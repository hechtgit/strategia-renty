/* Druhá strana PDF pre redakčnú alternatívu výsledku.
   Pôvodný generátor zostáva nedotknutý. Tento doplnok zachytí dokument tesne
   pred uložením, pridá zrozumiteľný výsledok modelovaných priebehov a až potom
   ho uloží. */
(function () {
  "use strict";

  var povodnePDF = window.PH_PDF;
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
          return {
            nadpis: text(r.querySelector(".co strong")),
            vysvetlenie: text(r.querySelector(".co small")),
            hodnota: text(r.querySelector(".kolko strong")),
            doplnenie: text(r.querySelector(".kolko span"))
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
        napis(d.citlivostNadpis, OKRAJ, 11.5, "bold", TMAVA, SIRKA, 1.3);
        if (d.citlivostUvod) {
          medzera(1);
          napis(d.citlivostUvod, OKRAJ, 8.2, "normal", SEDA, SIRKA, 1.4);
        }
        medzera(2);
      }
      if (index) ciara();
      var vrch = y;
      var lava = 112;
      var prava = SIRKA - lava - 8;
      napis(r.nadpis, OKRAJ, index ? 9.2 : 10, "bold", TMAVA, lava, 1.3);
      napis(r.vysvetlenie, OKRAJ, index ? 7.8 : 8.5, "normal", SEDA, lava, 1.35);
      var yL = y;
      y = vrch;
      if (index) {
        var pomer = (r.hodnota.match(/([0-9]+)\s*z\s*800/) || [])[1];
        var percento = pomer === "600" ? "75 %" : pomer === "720" ? "90 %" : "";
        napis((pomer ? pomer + " z 800 simulácií" : r.hodnota) + (percento ? " (" + percento + " simulácií v tomto modeli)" : ""), OKRAJ + lava + 8, 9.2, "bold", ZLATA, prava, 1.25);
        napis("Všetky plánované výplaty boli pokryté.", OKRAJ + lava + 8, 7.8, "normal", SEDA, prava, 1.3);
      } else {
        var uspesne = (r.hodnota.match(/([0-9]+)\s*z\s*800/) || [])[1];
        napis(uspesne ? "Kapitál pokryl všetky výplaty v " + uspesne + " z 800 simulácií" : r.hodnota,
          OKRAJ + lava + 8, 10.8, "bold", ZLATA, prava, 1.28);
        napis(r.doplnenie, OKRAJ + lava + 8, 8.3, "normal", SEDA, prava, 1.4);
      }
      y = Math.max(y, yL) + (index ? 2.5 : 4);
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
      medzera(4);
      ciara();
      napis(d.konzultaciaNadpis, OKRAJ, 12.5, "bold", TMAVA, SIRKA, 1.3);
      medzera(2);
      napis("Na osobnej konzultácii zasadíme výsledok do kontextu vášho skutočného majetku a doplníme pohľad založený na aktuálnych dlhodobých očakávaniach popredných svetových investičných inštitúcií.", OKRAJ, 8.5, "normal", SEDA, SIRKA, 1.38);
      medzera(2);
      napis("Rezervovať konzultáciu · hechtberger.com/rezervacia", OKRAJ, 8.5, "bold", ZLATA, SIRKA, 1.3);
      doc.link(OKRAJ, y - 4, 56, 6, { url: "https://hechtberger.com/rezervacia" });
    }

    doc.setDrawColor.apply(doc, LINKA);
    doc.setLineWidth(0.2);
    doc.line(OKRAJ, 282, OKRAJ + SIRKA, 282);
    doc.setFont("Asap", "normal"); doc.setFontSize(7);
    doc.setTextColor.apply(doc, SEDA);
    doc.text("Modelácia privátnej renty · hechtberger.com", OKRAJ, 287);
    doc.text("2 / 2", OKRAJ + SIRKA, 287, { align: "right" });
  }

  window.PH_PDF = function () {
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

    pridajDruhuStranu(dokument, dataDruhejStrany);
    skutocneUlozenie.call(dokument, "modelacia-privatnej-renty.pdf");
  };
})();
