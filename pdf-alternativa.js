/* Druhá strana PDF pre redakčnú alternatívu výsledku.
   Pôvodný generátor zostáva nedotknutý. Tento doplnok zachytí dokument tesne
   pred uložením, pridá zrozumiteľný výsledok modelovaných priebehov a až potom
   ho uloží. */
(function () {
  "use strict";

  var povodnePDF = window.PH_PDF;

  /* Portrét je kruhový PNG s priehľadným pozadím - jsPDF orezať do kruhu nevie,
     tak kruh nesie priamo obrázok a zlatý lem sa dokreslí. Sťahuje sa hneď pri
     načítaní tohto súboru; ak by sa nestihol alebo chýbal, sekcia sa vykreslí
     bez neho. */
  var portretData = null;
  var portretHotovy = fetch("portrait-petr-kruh.png")
    .then(function (r) { return r.ok ? r.blob() : null; })
    .then(function (b) {
      if (!b) return null;
      return new Promise(function (hotovo) {
        var fr = new FileReader();
        fr.onload = function () { portretData = fr.result; hotovo(fr.result); };
        fr.onerror = function () { hotovo(null); };
        fr.readAsDataURL(b);
      });
    })
    .catch(function () { return null; });

  /* Záverečná sekcia je osobné oslovenie od Petra, nie marketingový blok.
     Text píše Redaktor (job j-20260820-170542-6eba); tu je preto natvrdo a
     nečíta sa zo stránky - na webe tá sekcia vyzerá inak a je dlhšia.
     Oproti dodanému zneniu sú dve opravy kvôli súladu so zvyškom: „vy" sa
     všade píše malým písmenom a produkt sa volá privátna, nie súkromná renta. */
  var LIST_NADPIS = "Od čísla k stratégii";
  var LIST_TELO = "Táto modelácia vám dáva prvý obraz o tom, aký majetok môže byť "
    + "potrebný pre vašu privátnu rentu. Nevidí však celý váš majetok, ďalšie "
    + "investície, rezervu, likviditu ani rozhodnutia, ktoré máte pred sebou. "
    + "Na konzultácii ju viem zasadiť do vašej reality a oddeliť zaujímavé číslo "
    + "od stratégie, podľa ktorej sa dá pokojne rozhodovať. Preto má zmysel "
    + "sadnúť si k tomu spolu.";
  if (typeof povodnePDF !== "function" || !window.jspdf || !window.jspdf.jsPDF) return;

  function text(el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  function dataZoStranky() {
    var odolnost = document.getElementById("odolnost");
    if (!odolnost || odolnost.hidden) return null;
    var zdrojoveRiadky = Array.prototype.slice.call(document.querySelectorAll("#odolnost-riadky tr"))
      .concat(Array.prototype.slice.call(document.querySelectorAll(".odolnost-citlivost .citlivost-rad")));
    return {
      nadpis: text(odolnost.querySelector("h2")),
      uvod: text(document.getElementById("odolnost-uvod")),
      /* Prvá odrážka („Vaša dnešná investícia: 856 425 €.") je tá istá veta,
         ktorou začína zlatý panel hneď pod týmto boxom. Dva rámčeky pod sebou
         otvárané rovnakou vetou pôsobia ako dvojité vykreslenie - a riadok
         navyše je na tejto strane drahý. */
      testujeme: Array.prototype.map.call(
        odolnost.querySelectorAll(".odolnost-testuje li"), text
      /* Ostáva jediná odrážka - tá o základnom prepočte. Prvá („Vaša dnešná
         investícia") otvárala aj panel pod boxom, druhá („Cieľ: renta…") je
         doslova to, čo stojí v perexe nad ním. Cieľ sa v dokumente opakoval
         štyrikrát; tu z neho ubúda štvrtý výskyt a strane sa uvoľní miesto
         pre portrét v závere. */
      ).filter(function (t) { return !/^Vaša dnešná investícia|^Cieľ:/.test(t); }),
      riadky: Array.prototype.map.call(
        zdrojoveRiadky,
        function (r) {
          var hlavny = !r.querySelector(".co strong") && !!r.querySelector(".kolko strong");
          return {
            nadpis: hlavny
              ? text(odolnost.querySelector(".odolnost-testuje li:first-child"))
              : text(r.querySelector(".co strong")),
            vysvetlenie: hlavny
              ? "Tento vstup testujeme v každej modelovanej simulácii."
              : text(r.querySelector(".co small")),
            hodnota: text(r.querySelector(".kolko strong")),
            /* Prvý <span> v hlavnom riadku je malý štítok „Výsledok modelovaných
               simulácií"; vysvetľujúca veta je až ten druhý. querySelector bral
               ten prvý, takže PDF tlačilo štítok namiesto vysvetlenia - a rámček
               potom zíval prázdnotou. */
            doplnenie: text(r.querySelector(".kolko span:not(.vysledok-label)")
                            || r.querySelector(".kolko span"))
          };
        }
      ).filter(function (r) { return r.nadpis && r.hodnota; }),
      zaver: text(odolnost.querySelector(".odolnost-zaver")),
      citlivostNadpis: text(odolnost.querySelector(".odolnost-citlivost summary")),
      citlivostUvod: text(odolnost.querySelector(".odolnost-citlivost .uvod")),
      upozornenie: text(document.getElementById("odolnost-vystraha")),
      /* Kratšie a zároveň úplnejšie: pribudol názov metódy a to, že sa bloky
         LOSUJÚ (bez toho znel postup ako deterministický), a ubudlo štvornásobné
         opakovanie slova „model". Ušetrený riadok potrebuje záver strany. */
      metodika: "Simulácie vznikajú metódou Monte Carlo: z výnosov indexu MSCI World (v EUR, 1970–2025) sa losujú súvislé päťročné bloky a skladajú do nových priebehov. História platí len počas budovania majetku; čerpanie počíta so 4 % ročne po nákladoch, pred infláciou. Slabé výnosy hneď na začiatku čerpania môžu obdobie renty výrazne skrátiť.",
      konzultaciaNadpis: text(document.querySelector(".next h2")),
      konzultacia: Array.prototype.map.call(document.querySelectorAll(".next p"), text)
    };
  }

  function pridajDruhuStranu(doc, d) {
    if (!d || !d.riadky.length) return;

    var OKRAJ = 16;
    var SIRKA = 210 - 2 * OKRAJ;
    var TMAVA = [26, 26, 26];
    var SEDA = [90, 85, 78];
    var ZLATA = [154, 105, 41];
    var LINKA = [214, 208, 198];
    var y = OKRAJ;

    doc.addPage();
    doc.setFont("Asap", "normal");

    function riadky(t, vel, sirka) {
      doc.setFontSize(vel);
      return doc.splitTextToSize(t || "", sirka || SIRKA);
    }
    function napis(t, x, vel, styl, farba, sirka, line) {
      if (!t) return 0;
      doc.setFont("Asap", styl || "normal");
      doc.setFontSize(vel);
      doc.setTextColor.apply(doc, farba || TMAVA);
      var rs = riadky(t, vel, sirka);
      var krok = vel * 0.3528 * (line || 1.38);
      rs.forEach(function (r, i) { doc.text(r, x, y + vel * 0.3528 * 0.8 + i * krok); });
      y += rs.length * krok;
      return rs.length * krok;
    }
    /* Výška, ktorú text zaberie, bez toho aby sa čokoľvek vykreslilo -
       panel treba nakresliť skôr, než sa doň píše. */
    function vyskaTextu(t, vel, sirka, line) {
      if (!t) return 0;
      return riadky(t, vel, sirka).length * vel * 0.3528 * (line || 1.38);
    }
    function medzera(mm) { y += mm; }
    function ciara() {
      doc.setDrawColor.apply(doc, LINKA);
      doc.setLineWidth(0.2);
      doc.line(OKRAJ, y, OKRAJ + SIRKA, y);
      y += 5;
    }

    var meta = text(document.getElementById("pre-koho"));
    napis("AKO OBSTÁL VÁŠ PLÁN", OKRAJ, 8, "bold", ZLATA, SIRKA, 1.2);
    if (meta) {
      doc.setFont("Asap", "normal"); doc.setFontSize(7.5);
      doc.setTextColor.apply(doc, SEDA);
      doc.text(meta, OKRAJ + SIRKA, OKRAJ + 2.2, { align: "right" });
    }
    medzera(3);
    napis(d.nadpis, OKRAJ, 17, "bold", TMAVA, SIRKA, 1.2);
    medzera(2.5);
    napis(d.uvod, OKRAJ, 9.5, "normal", SEDA, SIRKA, 1.45);
    medzera(5);

    if (d.testujeme.length) {
      var testText = d.testujeme.map(function (p) { return "• " + p; }).join("\n");
      var testTop = y;
      doc.setFillColor(250, 246, 238);
      doc.setDrawColor.apply(doc, ZLATA);
      var testR = riadky(testText, 9.2, SIRKA - 14);
      var testH = 10 + testR.length * 9.2 * 0.3528 * 1.42;
      doc.roundedRect(OKRAJ, y, SIRKA, testH, 1.5, 1.5, "FD");
      y += 4;
      napis(testText, OKRAJ + 7, 9.2, "normal", TMAVA, SIRKA - 14, 1.42);
      y = testTop + testH + 8;
    }

    d.riadky.forEach(function (r, index) {
      if (index === 1 && d.citlivostNadpis) {
        medzera(2);
        napis(d.citlivostNadpis, OKRAJ, 9.5, "bold", SEDA, SIRKA, 1.3);
        if (d.citlivostUvod) {
          medzera(1);
          napis(d.citlivostUvod, OKRAJ, 8.2, "normal", SEDA, SIRKA, 1.4);
        }
        medzera(2);
      }
      if (index) ciara();
      var panelTop = y;
      var lava = index ? 112 : 104;
      var prava = SIRKA - lava - 8;
      /* Stránka píše „Majetok pokryl všetky plánované výplaty v 604 z 800
         simulácií". Regex z toho vytiahol číslo a SLOVESO ZAHODIL, takže
         v PDF stálo holé „604 z 800 simulácií" - veľké zlaté číslo bez
         výsledku, na ktoré nadväzujúca veta nemala ako nadviazať. Preberáme
         preto celú vetu tak, ako ju stránka zložila. */
      var uspesneHl = (r.hodnota.match(/([0-9]+)\s*z\s*800/) || [])[1];
      var hodnotaHl = r.hodnota;
      /* A najmä: dokument nikde nehovoril, čo sa stalo vo zvyšku. Bez tejto
         vety si klient odnesie len to, koľkokrát to vyšlo. */
      var nepokrylo = uspesneHl
        ? "V zvyšných " + (800 - Number(uspesneHl)) + " z 800 simulácií by majetok "
          + "plánované výplaty nepokryl."
        : "";
      var panelH = 0;
      /* Hlavný panel bol dvojstĺpcový: vľavo dva riadky, vpravo šesť, a medzi
         nimi polovica rámčeka prázdna. Pod sebou na celú šírku sa dlhá veta
         zalomí do dvoch riadkov namiesto piatich - panel je nižší a nič
         nezíva. Detailné riadky nižšie dvojstĺpcové zostávajú, tam sú obe
         strany podobne dlhé a porovnanie vedľa seba dáva zmysel. */
      var PLNA = SIRKA - 12;
      if (!index) {
        panelH = vyskaTextu(r.nadpis, 10, PLNA, 1.3)
               + vyskaTextu(r.vysvetlenie, 8.5, PLNA, 1.35)
               + 3
               + vyskaTextu(hodnotaHl, 12.2, PLNA, 1.24)
               + (nepokrylo ? 1.5 + vyskaTextu(nepokrylo, 8.3, PLNA, 1.4) : 0)
               + vyskaTextu(r.doplnenie, 8.3, PLNA, 1.4)
               + 12;
        doc.setFillColor(250, 246, 238);
        doc.setDrawColor.apply(doc, ZLATA);
        doc.setLineWidth(0.35);
        doc.roundedRect(OKRAJ, panelTop, SIRKA, panelH, 1.8, 1.8, "FD");
        y += 6;   /* text sa predtým dotýkal rámu - vnútorný okraj bol nula */
      }
      var vrch = y;
      if (!index) {
        var xP = OKRAJ + 6;
        napis(r.nadpis, xP, 10, "bold", TMAVA, PLNA, 1.3);
        napis(r.vysvetlenie, xP, 8.5, "normal", SEDA, PLNA, 1.35);
        medzera(3);
        napis(hodnotaHl, xP, 12.2, "bold", ZLATA, PLNA, 1.24);
        if (nepokrylo) { medzera(1.5); napis(nepokrylo, xP, 8.3, "bold", TMAVA, PLNA, 1.4); }
        napis(r.doplnenie, xP, 8.3, "normal", SEDA, PLNA, 1.4);
        y = Math.max(panelTop + panelH, y) + 8;
        return;
      }
      napis(r.nadpis, OKRAJ, 9.2, "bold", TMAVA, lava, 1.3);
      napis(r.vysvetlenie, OKRAJ, 7.8, "normal", SEDA, lava, 1.35);
      var yL = y;
      y = vrch;
      if (index) {
        var pomer = (r.hodnota.match(/([0-9]+)\s*z\s*800/) || [])[1];
        napis(pomer ? pomer + " z 800 simulácií" : r.hodnota,
          OKRAJ + lava + 8, 8.2, "bold", SEDA, prava, 1.3);
        /* Predtým tu stálo oznamovacie „Všetky plánované výplaty boli pokryté."
           - minulý čas, bez väzby na počet. Vedľa vety „Túto úroveň spĺňa už
           vaša dnešná investícia" sa to čítalo ako „moje peniaze pokryli
           všetko", čo je opak toho, čo model hovorí. Stránka má správne
           podmieňovací spôsob aj kvantifikátor, tak ich používame tiež. */
        napis(pomer
          ? "Majetok by všetky plánované výplaty pokryl aspoň v " + pomer + " z 800 simulácií."
          : "Ilustračná úroveň.", OKRAJ + lava + 8, 7.8, "normal", SEDA, prava, 1.3);
      }
      y = Math.max(y, yL) + 2.5;
    });

    if (d.zaver) {
      medzera(2);
      doc.setFillColor(247, 244, 238);
      var zR = riadky(d.zaver, 8.8, SIRKA - 12);
      var zH = 8 + zR.length * 8.8 * 0.3528 * 1.42;
      doc.roundedRect(OKRAJ, y, SIRKA, zH, 1.5, 1.5, "F");
      y += 4;
      napis(d.zaver, OKRAJ + 6, 8.8, "bold", TMAVA, SIRKA - 12, 1.42);
      y += 4;
    }

    medzera(2);
    ciara();
    napis(d.upozornenie, OKRAJ, 8.7, "bold", TMAVA, SIRKA, 1.42);
    medzera(3);
    napis(d.metodika, OKRAJ, 7.8, "normal", SEDA, SIRKA, 1.46);

    if (d.konzultaciaNadpis) {
      medzera(6);
      /* Posledný blok na strane: portrét vľavo, oslovenie vpravo, tlačidlo pod
         tým. Doteraz tu bola natvrdo vysoká škatuľa s jednou vetou, ktorá na
         webe ani nestála. Výška sa ráta z obsahu.

         Spodný okraj strany je inde 16 mm; tento blok smie ísť až na 8 mm.
         Práve tých 8 mm rozhoduje o tom, či sa sekcia zmestí na druhú stranu -
         a keďže je posledná na strane, užší okraj pod ňou nie je vidieť. */
      /* Sekcia potrebovala s portrétom 50 mm a na strane ich zostáva 47.
         Tie tri milimetre sa berú z vnútorných okrajov a medzery nad
         tlačidlom - nie z textu ani z veľkosti fotky. */
      var VNU = 5;
      var FOTO = d.portret ? 26 : 0;
      var MEDZI = FOTO ? 6 : 0;
      var TXT = SIRKA - 2 * VNU - FOTO - MEDZI;
      var CTA_S = 62, CTA_V = 8.5;

      /* Pätka je ukotvená natvrdo na 282 mm. Predtým som blok pustil až na
         289 mm, čo je 7 mm POD ňu - v tomto scenári to nevyskočilo, ale bola
         to čakajúca chyba. */
      var DOSTUPNE = 282 - 4 - y;
      function vyskaListu(sFotkou) {
        var sirka = SIRKA - 2 * VNU - (sFotkou ? FOTO + MEDZI : 0);
        var h = vyskaTextu(LIST_NADPIS, 12.5, sirka, 1.25) + 2
              + vyskaTextu(LIST_TELO, 8.3, sirka, 1.4);
        return { hlava: Math.max(sFotkou ? FOTO : 0, h),
                 cela: VNU + Math.max(sFotkou ? FOTO : 0, h) + 2 + CTA_V + VNU };
      }
      /* Pri dlhšom obsahu nad sekciou nemusí zostať na portrét miesto. Vtedy
         padá on, nie text - bez portrétu je blok o výšku fotky nižší. Text sa
         neskracuje nikdy: radšej list bez tváre než useknutá veta. */
      var sFotkou = !!d.portret && vyskaListu(true).cela <= DOSTUPNE;
      if (!sFotkou) { FOTO = 0; MEDZI = 0; TXT = SIRKA - 2 * VNU; }
      var miery = vyskaListu(sFotkou);
      var hHlava = miery.hlava;
      /* Rámček sa NESMIE orezať pod výšku obsahu - predtým som ho zmenšil na
         dostupné miesto, ale text sa kreslil ďalej a tlačidlo pristálo naň. */
      var konzH = miery.cela;

      var konzTop = y;
      doc.setFillColor(250, 246, 238);
      doc.setDrawColor.apply(doc, ZLATA);
      doc.setLineWidth(0.3);
      doc.roundedRect(OKRAJ, konzTop, SIRKA, konzH, 1.8, 1.8, "FD");

      /* Podmienka musí byť `sFotkou`, nie `d.portret`. Keď sa portrét nezmestí,
         FOTO je nula - a addImage s nulovým rozmerom si jsPDF vyloží ako
         „použi vlastnú veľkosť obrázka", takže 400 px vykreslil cez pol
         strany. */
      if (sFotkou) {
        var fx = OKRAJ + VNU, fy = konzTop + VNU + Math.max(0, (hHlava - FOTO) / 2);
        try { doc.addImage(d.portret, "PNG", fx, fy, FOTO, FOTO); } catch (e) {}
        doc.setDrawColor.apply(doc, ZLATA);
        doc.setLineWidth(0.5);
        doc.circle(fx + FOTO / 2, fy + FOTO / 2, FOTO / 2, "S");
      }

      var textX = OKRAJ + VNU + (FOTO ? FOTO + MEDZI : 0);
      y = konzTop + VNU;
      napis(LIST_NADPIS, textX, 12.5, "bold", TMAVA, TXT, 1.25);
      medzera(2);
      napis(LIST_TELO, textX, 8.3, "normal", SEDA, TXT, 1.4);

      var ctaY = konzTop + konzH - VNU - CTA_V;
      doc.setFillColor.apply(doc, ZLATA);
      doc.rect(textX, ctaY, CTA_S, CTA_V, "F");
      doc.setFont("Asap", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text("Rezervovať konzultáciu", textX + CTA_S / 2, ctaY + 5.9, { align: "center" });
      doc.link(textX, ctaY, CTA_S, CTA_V, { url: "https://hechtberger.com/rezervacia" });
      y = konzTop + konzH;
    }

    doc.setDrawColor.apply(doc, LINKA);
    doc.setLineWidth(0.2);
    doc.line(OKRAJ, 282, OKRAJ + SIRKA, 282);
    doc.setFont("Asap", "normal"); doc.setFontSize(7);
    doc.setTextColor.apply(doc, SEDA);
    doc.text("Modelácia privátnej renty · hechtberger.com", OKRAJ, 287);
    doc.text("2 / 2", OKRAJ + SIRKA, 287, { align: "right" });
    /* Práve táto strana nesie čísla úspešnosti aj výzvu na konzultáciu, a
       pritom bola jediná bez akejkoľvek výhrady. Ak ju niekto odfotí alebo
       pošle samostatne, išla by von bez upozornenia. */
    doc.setFontSize(6.2);
    doc.text("Ilustračný a vzdelávací výpočet. Nejde o investičné poradenstvo ani odporúčanie.",
      OKRAJ, 291.5);
  }

  window.PH_PDF = async function () {
    var dataDruhejStrany = dataZoStranky();
    var SkutocnyKonstruktor = window.jspdf.jsPDF;
    var dokument = null;
    var skutocneUlozenie = null;
    function ZachytavajuciKonstruktor() {
      var args = Array.prototype.slice.call(arguments);
      dokument = new (Function.prototype.bind.apply(SkutocnyKonstruktor, [null].concat(args)))();
      skutocneUlozenie = dokument.save;
      dokument.save = function () { return dokument; };
      return dokument;
    }
    Object.keys(SkutocnyKonstruktor).forEach(function (k) {
      ZachytavajuciKonstruktor[k] = SkutocnyKonstruktor[k];
    });
    var docasneTexty = [];
    function docasneSkrat(el, novyText) {
      if (!el) return;
      docasneTexty.push({ el: el, html: el.innerHTML });
      el.textContent = novyText;
    }
    var predpoklady = document.querySelectorAll(".assumptions .blok p:not(.vystraha)");
    docasneSkrat(predpoklady[0], "Výpočet používa zhodnotenie, ktoré ste zadali vy. Nejde o odhad ani odporúčanie.");
    /* Model počíta s DVOMA sadzbami - jednou počas budovania, druhou počas
       vyplácania - a potrebný majetok určuje prevažne tá druhá. V PDF stála
       len prvá, takže kľúčové číslo nemalo v dokumente oporu. Sadzby sa
       neprepisujú natvrdo: čítajú sa z vety, ktorú stránka zloží do
       #metodika, aby sa pri zmene predpokladu nerozišli. */
    var sadzby = (function () {
      var m = text(document.getElementById("metodika"))
        .match(/so zhodnotením\s*([0-9.,]+)\s*%[^0-9]+([0-9.,]+)\s*%/);
      return m ? "Výpočet počíta so zhodnotením " + m[1] + " % ročne počas budovania majetku a "
                 + m[2] + " % ročne počas vyplácania; obe ste zadali vy. "
               : "";
    })();
    docasneSkrat(predpoklady[1], sadzby + "Zohľadňuje vstupný poplatok 1,5 %, správu 0,9 % ročne, zadanú infláciu a mesačný priebeh výpočtu; dane z výnosov nezohľadňuje.");
    docasneSkrat(predpoklady[2], dataDruhejStrany
      ? "Metodiku modelovaných simulácií nájdete na druhej strane."
      : "Tento scenár nemá obdobie budovania s vopred zvoleným koncom čerpania, preto sa historický test nezobrazuje.");
    docasneSkrat(document.querySelector(".next h2"), "");
    docasneSkrat(document.querySelector(".next p"), "");

    window.jspdf.jsPDF = ZachytavajuciKonstruktor;
    try {
      povodnePDF();
    } finally {
      window.jspdf.jsPDF = SkutocnyKonstruktor;
      docasneTexty.forEach(function (z) { z.el.innerHTML = z.html; });
    }
    if (!dokument || typeof skutocneUlozenie !== "function") {
      throw new Error("PDF dokument sa nepodarilo zachytiť.");
    }

    try { await portretHotovy; } catch (e) {}
    if (dataDruhejStrany) dataDruhejStrany.portret = portretData;
    pridajDruhuStranu(dokument, dataDruhejStrany);
    skutocneUlozenie.call(dokument, "modelacia-privatnej-renty.pdf");
  };
})();
