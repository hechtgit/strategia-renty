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
      testujeme: Array.prototype.map.call(
        odolnost.querySelectorAll(".odolnost-testuje li"), text
      ),
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
      metodika: "Každá z 800 modelovaných simulácií vzniká spojením súvislých päťročných blokov ročných výnosov MSCI World Net Total Return v EUR z rokov 1970–2025 do novej modelovanej kombinácie. História sa používa iba počas budovania majetku; čerpanie pracuje s plánovacím výnosom 4 % ročne po nákladoch, pred infláciou. Podiel úspešných simulácií nie je odhadom pravdepodobnosti budúceho úspechu.",
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
      var uspesneHl = (r.hodnota.match(/([0-9]+)\s*z\s*800/) || [])[1];
      var hodnotaHl = uspesneHl ? uspesneHl + " z 800 simulácií" : r.hodnota;
      var panelH = 0;
      if (!index) {
        /* Výška bola zapísaná natvrdo (37). Keď sa text sprava skrátil, rámček
           zostal rovnako vysoký a pod obsahom ostala prázdna plocha. Ráta sa
           preto z toho, čo sa doň naozaj vojde. */
        var hLava = vyskaTextu(r.nadpis, 10, lava, 1.3)
                  + vyskaTextu(r.vysvetlenie, 8.5, lava, 1.35);
        var hPrava = vyskaTextu(hodnotaHl, 12.2, prava, 1.24)
                   + vyskaTextu(r.doplnenie, 8.3, prava, 1.4);
        panelH = Math.max(hLava, hPrava) + 12;
        doc.setFillColor(250, 246, 238);
        doc.setDrawColor.apply(doc, ZLATA);
        doc.setLineWidth(0.35);
        doc.roundedRect(OKRAJ, panelTop, SIRKA, panelH, 1.8, 1.8, "FD");
        y += 6;
      }
      var vrch = y;
      napis(r.nadpis, OKRAJ, index ? 9.2 : 10, "bold", TMAVA, lava, 1.3);
      napis(r.vysvetlenie, OKRAJ, index ? 7.8 : 8.5, "normal", SEDA, lava, 1.35);
      var yL = y;
      y = vrch;
      if (index) {
        var pomer = (r.hodnota.match(/([0-9]+)\s*z\s*800/) || [])[1];
        var percento = pomer === "600" ? "75 %" : pomer === "720" ? "90 %" : "";
        napis((pomer ? pomer + " z 800 simulácií" : r.hodnota) + (percento ? " (" + percento + " simulácií v tomto modeli)" : ""), OKRAJ + lava + 8, 8.2, "bold", SEDA, prava, 1.3);
        napis("Všetky plánované výplaty boli pokryté.", OKRAJ + lava + 8, 7.8, "normal", SEDA, prava, 1.3);
      } else {
        napis(hodnotaHl, OKRAJ + lava + 8, 12.2, "bold", ZLATA, prava, 1.24);
        napis(r.doplnenie, OKRAJ + lava + 8, 8.3, "normal", SEDA, prava, 1.4);
      }
      y = index ? Math.max(y, yL) + 2.5 : Math.max(panelTop + panelH, y, yL) + 8;
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
      var VNU = 6;
      var FOTO = d.portret ? 26 : 0;
      var MEDZI = FOTO ? 6 : 0;
      var TXT = SIRKA - 2 * VNU - FOTO - MEDZI;
      var CTA_S = 62, CTA_V = 9;

      var DOSTUPNE = doc.internal.pageSize.getHeight() - 8 - y;
      function vyskaListu(sFotkou) {
        var sirka = SIRKA - 2 * VNU - (sFotkou ? FOTO + MEDZI : 0);
        var h = vyskaTextu(LIST_NADPIS, 12.5, sirka, 1.25) + 2
              + vyskaTextu(LIST_TELO, 8.3, sirka, 1.4);
        return { hlava: Math.max(sFotkou ? FOTO : 0, h),
                 cela: VNU + Math.max(sFotkou ? FOTO : 0, h) + 3 + CTA_V + VNU };
      }
      /* Pri dlhšom obsahu nad sekciou nemusí zostať na portrét miesto. Vtedy
         padá on, nie text - bez portrétu je blok o výšku fotky nižší. Text sa
         neskracuje nikdy: radšej list bez tváre než useknutá veta. */
      var sFotkou = !!d.portret && vyskaListu(true).cela <= DOSTUPNE;
      if (!sFotkou) { FOTO = 0; MEDZI = 0; TXT = SIRKA - 2 * VNU; }
      var miery = vyskaListu(sFotkou);
      var hHlava = miery.hlava;
      var konzH = Math.min(miery.cela, DOSTUPNE);

      var konzTop = y;
      doc.setFillColor(250, 246, 238);
      doc.setDrawColor.apply(doc, ZLATA);
      doc.setLineWidth(0.3);
      doc.roundedRect(OKRAJ, konzTop, SIRKA, konzH, 1.8, 1.8, "FD");

      if (d.portret) {
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
    docasneSkrat(predpoklady[1], "Zohľadňuje vstupný poplatok 1,5 %, správu 0,9 % ročne, zadanú infláciu a mesačný priebeh výpočtu; dane z výnosov nezohľadňuje.");
    docasneSkrat(predpoklady[2], dataDruhejStrany
      ? "Základný prepočet a modelované simulácie používajú dve odlišné metodiky, vysvetlené na druhej strane."
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
