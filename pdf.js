/* Vygenerovanie modelácie ako PDF priamo v prehliadači.

   Prečo takto: stránka je statická, žiadny server nemáme, a tlačový dialóg
   je na telefóne neprívetivý — klient chce súbor, nie ponuku tlače. jsPDF
   preto dokument vysádže a stiahne ho ako súbor.

   Čísla sa neprepočítavajú. Čítajú sa z už vykreslenej modelácie, takže PDF
   nemá ako ukázať niečo iné, než čo má klient pred očami.

   Načítava sa až po ťuknutí na tlačidlo — spolu s písmom má okolo 440 kB
   a väčšina návštevníkov PDF nechce.
*/
(function () {
  "use strict";

  var A4 = { s: 210, v: 297 };          /* mm */
  var OKRAJ = 16;
  var SIRKA = A4.s - 2 * OKRAJ;

  var ZLATA = [154, 105, 41];
  var TMAVA = [26, 26, 26];
  var SEDA = [90, 85, 78];
  var LINKA = [214, 208, 198];

  function text(el) {
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }

  /* Údaje berieme z DOM — jediný zdroj, ktorý klient naozaj videl. */
  function zoStranky() {
    var karty = [];
    ["m-today", "m-start", "m-end"].forEach(function (id) {
      var m = document.getElementById(id);
      if (!m || m.hidden || m.closest('[hidden]')) return;
      var riadky = [];
      m.querySelectorAll(".label").forEach(function (l) {
        var v = l.nextElementSibling;
        if (v && v.classList.contains("value")) riadky.push([text(l), text(v)]);
      });
      karty.push({
        nadpis: text(m.querySelector("h3")),
        riadky: riadky,
        pod: text(m.querySelector(".sub"))
      });
    });

    var predpoklady = [];
    document.querySelectorAll(".blok p:not(.vystraha)").forEach(function (p) {
      var t = text(p);
      if (t) predpoklady.push(t);
    });

    var suhrn = null;
    var sek = document.getElementById("suhrn");
    if (sek && !sek.hidden) {
      suhrn = {
        nadpis: text(sek.querySelector("h2")),
        polozky: Array.prototype.map.call(sek.querySelectorAll(".suhrn-polozka"), function (p) {
          return [text(p.querySelector(".k")), text(p.querySelector(".v"))];
        }),
        pod: text(document.getElementById("suhrn-pod"))
      };
    }

    return {
      nadpis: text(document.querySelector("h1")),
      uvod: text(document.querySelector(".lead")),
      plan: text(document.querySelector(".section-head h2")),
      ciel: text(document.getElementById("ciel")),
      karty: karty,
      suhrn: suhrn,
      preKoho: text(document.getElementById("pre-koho")),
      vyhotovene: text(document.getElementById("vyhotovene")),
      /* Tri míľniky ako čísla, nie ako veta - klient si vie 35 + 20 = 55
         overiť na prvý pohľad. Berú sa z adresy, teda z toho istého zdroja,
         akým je zložený celý výpočet. */
      veky: (function () {
        var q = new URLSearchParams(location.search);
        var dnes = q.get("now"), start = q.get("start"), koniec = q.get("end");
        if (!dnes || !start) return "";
        var kusy = ["Vek dnes: " + dnes, "Začiatok čerpania: " + start];
        if (koniec && q.get("pension") !== "perpetuity") kusy.push("Koniec: " + koniec);
        return kusy.join("   ·   ");
      })(),
      vystraha: text(document.querySelector(".blok .vystraha")),
      predpokladyNadpis: text(document.querySelector(".blok h2")),
      predpoklady: predpoklady,
      vychodiskaNadpis: text(document.querySelector(".recap h3")),
      vychodiska: Array.prototype.map.call(document.querySelectorAll(".recap li"), text),
      dalejNadpis: text(document.querySelector(".next h2")),
      dalej: text(document.querySelector(".next p")),
      disclaimer: text(document.querySelector(".disclaimer"))
    };
  }

  function vytvor(d) {
    var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });

    doc.addFileToVFS("Asap-Regular.ttf", window.PH_FONT.regular);
    doc.addFont("Asap-Regular.ttf", "Asap", "normal");
    doc.addFileToVFS("Asap-SemiBold.ttf", window.PH_FONT.semibold);
    doc.addFont("Asap-SemiBold.ttf", "Asap", "bold");
    doc.setFont("Asap", "normal");

    var y = OKRAJ;

    function strana() {
      doc.addPage();
      y = OKRAJ;
    }
    function miesto(potreba) {
      if (y + potreba > A4.v - OKRAJ - 6) strana();
    }
    function odstavec(t, vel, styl, farba, sirka, riadkovanie) {
      if (!t) return;
      doc.setFont("Asap", styl || "normal");
      doc.setFontSize(vel);
      doc.setTextColor(farba[0], farba[1], farba[2]);
      var r = doc.splitTextToSize(t, sirka || SIRKA);
      var vyskaRiadku = vel * 0.3528 * (riadkovanie || 1.42);
      miesto(r.length * vyskaRiadku);
      for (var i = 0; i < r.length; i++) {
        miesto(vyskaRiadku);
        doc.text(r[i], OKRAJ, y + vel * 0.3528 * 0.8);
        y += vyskaRiadku;
      }
    }
    function medzera(mm) { y += mm; }
    /* Nadpis bez svojho textu na konci strany vyzerá ako chyba sadzby.
       Odhadneme výšku nadpisu aj nasledujúceho odseku a zalomíme ich spolu. */
    function nadpisSTelom(nadpis, telo, velN, velT) {
      doc.setFont("Asap", "normal"); doc.setFontSize(velT);
      var riadkov = doc.splitTextToSize(telo || "", SIRKA).length;
      miesto(velN * 0.3528 * 1.22 + riadkov * velT * 0.3528 * 1.38 + 3);
      odstavec(nadpis, velN, "bold", TMAVA, SIRKA, 1.22);
      medzera(0.5);
      if (telo) odstavec(telo, velT, "normal", SEDA, SIRKA, 1.38);
    }
    function ciara() {
      miesto(6);
      doc.setDrawColor(LINKA[0], LINKA[1], LINKA[2]);
      doc.setLineWidth(0.2);
      doc.line(OKRAJ, y, OKRAJ + SIRKA, y);
      y += 5;
    }

    /* ——— hlavička ——— */
    var vrchH = y;
    odstavec("MODELÁCIA PRIVÁTNEJ RENTY", 7.5, "bold", ZLATA, SIRKA, 1.2);
    /* Meno aj dátum berieme zo stránky — nie z generátora, nech sa dokument
       a stránka nemôžu rozísť. Idú na jeden riadok oproti rubrike, takže
       dokumentu nepribudne ani milimeter výšky. */
    var meta = [d.preKoho, d.vyhotovene].filter(Boolean).join("  ·  ");
    if (meta) {
      doc.setFont("Asap", "normal"); doc.setFontSize(7.5);
      doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
      doc.text(meta, OKRAJ + SIRKA, vrchH + 7.5 * 0.3528 * 0.8, { align: "right" });
    }
    medzera(1.5);
    odstavec(d.nadpis, 17, "bold", TMAVA, SIRKA, 1.2);
    medzera(1.5);
    odstavec(d.uvod, 8.8, "normal", SEDA, SIRKA, 1.34);

    /* Dokument hovoril „obdobie budovania majetku: 20 rokov" a „renta od 55
       rokov", ale dnešný vek klienta neuvádzal nikde - tie dve čísla si teda
       nemal ako spojiť ani overiť. Tri míľniky na jednom riadku to zavrú. */
    if (d.veky) {
      medzera(1.5);
      odstavec(d.veky, 8, "bold", TMAVA, SIRKA, 1.3);
    }

    medzera(2);
    ciara();

    /* ——— plán ——— */
    odstavec(d.plan, 12, "bold", TMAVA, SIRKA, 1.25);
    /* d.ciel bol vytlačený dvakrát: raz v perexe (d.uvod ho obsahuje) a hneď
       pod čiarou znova. */
    if (d.ciel && d.uvod.indexOf(d.ciel) === -1) {
      medzera(0.5);
      odstavec(d.ciel, 9, "normal", SEDA, SIRKA, 1.38);
    }
    medzera(1.5);

    /* ——— míľniky ——— */
    d.karty.forEach(function (k) {
      /* Podtext („Obdobie budovania majetku: 20 rokov.") dosadal 0,05 mm nad
         rám, takže dolné dotiahnutia písmen j, g, p rám pretínali. Rovnaký
         krok ako pri riadkoch dá pod text toľko vzduchu, koľko je nad
         nadpisom. */
      var vyskaBloku = 7.5 + k.riadky.length * 7.2 + (k.pod ? 7.2 : 0);
      miesto(vyskaBloku);

      var vrch = y;
      doc.setFillColor(250, 247, 242);
      doc.setDrawColor(LINKA[0], LINKA[1], LINKA[2]);
      doc.roundedRect(OKRAJ, vrch, SIRKA, vyskaBloku, 1.5, 1.5, "FD");

      y = vrch + 5.5;
      doc.setFont("Asap", "bold");
      doc.setFontSize(11);
      doc.setTextColor(TMAVA[0], TMAVA[1], TMAVA[2]);
      doc.text(k.nadpis, OKRAJ + 6, y);
      y += 5.5;

      k.riadky.forEach(function (r) {
        doc.setFont("Asap", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
        doc.text(r[0].toUpperCase(), OKRAJ + 6, y);
        doc.setFont("Asap", "bold");
        doc.setFontSize(13);
        doc.setTextColor(TMAVA[0], TMAVA[1], TMAVA[2]);
        doc.text(r[1], OKRAJ + SIRKA - 6, y, { align: "right" });
        y += 7.2;
      });

      if (k.pod) {
        doc.setFont("Asap", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
        doc.text(doc.splitTextToSize(k.pod, SIRKA - 12), OKRAJ + 6, y);
      }
      y = vrch + vyskaBloku + 2;
    });

    medzera(0.5);

    /* ——— čo to znamená v číslach ——— */
    if (d.suhrn && d.suhrn.polozky.length) {
      /* Rámček musí pojať aj dvojriadkový popisok - výška sa preto dopočíta
         z toho, koľko riadkov popisky naozaj zaberú. */
      var sirkaStlpca = (SIRKA - 12) / d.suhrn.polozky.length;
      doc.setFont("Asap", "normal"); doc.setFontSize(7);
      var riadkovPopisku = d.suhrn.polozky.reduce(function (a, p) {
        return Math.max(a, doc.splitTextToSize(p[0].toUpperCase(), sirkaStlpca - 6).length);
      }, 1);
      var vyskaS = 11 + 11 + (riadkovPopisku - 1) * 3 + (d.suhrn.pod ? 10.5 : 0);
      miesto(vyskaS);
      var vrchS = y;
      doc.setFillColor(250, 246, 238);
      doc.setDrawColor(ZLATA[0], ZLATA[1], ZLATA[2]);
      doc.setLineWidth(0.3);
      doc.roundedRect(OKRAJ, vrchS, SIRKA, vyskaS, 1.5, 1.5, "FD");
      doc.setLineWidth(0.2);

      y = vrchS + 6;
      doc.setFont("Asap", "bold"); doc.setFontSize(11);
      doc.setTextColor(TMAVA[0], TMAVA[1], TMAVA[2]);
      doc.text(d.suhrn.nadpis, OKRAJ + 6, y);
      y += 7;

      var stlpec = (SIRKA - 12) / d.suhrn.polozky.length;
      /* Popisky sa kreslili holým doc.text bez zalomenia, takže dlhší z nich
         („ROZDIEL MEDZI NOMINÁLNOU RENTOU A INVESTÍCIAMI") prerástol svoj
         stĺpec a dobehol až na rám rámčeka. Zalamujú sa na šírku stĺpca
         zmenšenú o medzeru, a keďže sa tým jeden z nich stane dvojriadkovým,
         hodnoty sa sadzajú na spoločnú účtovnú čiaru - inak by zlaté sumy
         stáli každá inde. */
      doc.setFont("Asap", "normal"); doc.setFontSize(7);
      var popisky = d.suhrn.polozky.map(function (p) {
        return doc.splitTextToSize(p[0].toUpperCase(), stlpec - 6);
      });
      var najviacRiadkov = popisky.reduce(function (a, r) { return Math.max(a, r.length); }, 1);
      var yHodnoty = y + (najviacRiadkov - 1) * 3 + 6;

      d.suhrn.polozky.forEach(function (p, i) {
        var x = OKRAJ + 6 + i * stlpec;
        doc.setFont("Asap", "normal"); doc.setFontSize(7);
        doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
        popisky[i].forEach(function (r, j) { doc.text(r, x, y + j * 3); });
        doc.setFont("Asap", "bold"); doc.setFontSize(12.5);
        doc.setTextColor(ZLATA[0], ZLATA[1], ZLATA[2]);
        doc.text(p[1], x, yHodnoty);
      });
      y = yHodnoty + 8;

      if (d.suhrn.pod) {
        doc.setFont("Asap", "normal"); doc.setFontSize(8);
        doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
        doc.text(doc.splitTextToSize(d.suhrn.pod, SIRKA - 12), OKRAJ + 6, y);
      }
      y = vrchS + vyskaS + 5;
    }

    ciara();

    /* ——— predpoklady a východiská ———
       Dva stĺpce vedľa seba, rovnako ako na stránke: obsah oboch výstupov tak
       sedí a dokument sa zmestí na jednu stranu. */
    var MEDZISTLPEC = 10;
    var stlp = (SIRKA - MEDZISTLPEC) / 2;
    var xL = OKRAJ, xP = OKRAJ + stlp + MEDZISTLPEC;

    function nadpisStlpca(t, x, yy) {
      doc.setFont("Asap", "bold"); doc.setFontSize(10.5);
      doc.setTextColor(TMAVA[0], TMAVA[1], TMAVA[2]);
      doc.text(t, x, yy + 3);
      return yy + 8;
    }
    function odstavecStlpca(t, x, yy, sirkaS) {
      doc.setFont("Asap", "normal"); doc.setFontSize(7.4);
      doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
      var r = doc.splitTextToSize(t, sirkaS);
      var vr = 7.4 * 0.3528 * 1.32;
      r.forEach(function (riadok, i) { doc.text(riadok, x, yy + i * vr + 2.4); });
      return yy + r.length * vr + 2;
    }

    var vrchS2 = y;
    var yL = nadpisStlpca(d.predpokladyNadpis, xL, vrchS2);
    d.predpoklady.forEach(function (t) { yL = odstavecStlpca(t, xL, yL, stlp) + 1; });

    var yP = nadpisStlpca(d.vychodiskaNadpis, xP, vrchS2);
    /* Pravý stĺpec mal odrážky o bod väčšie než text vľavo a odsadené o 4,6 mm
       od nadpisu - dva rovnocenné stĺpce tak vyzerali ako hlavný a vedľajší.
       Veľkosť je teraz rovnaká ako vľavo a guľôčka visí v medzistĺpci, takže
       nadpis aj text lícujú na jednej zvislici. */
    doc.setFont("Asap", "normal"); doc.setFontSize(7.4);
    var vrOdr = 7.4 * 0.3528 * 1.32;
    d.vychodiska.forEach(function (v) {
      doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
      doc.setFillColor(ZLATA[0], ZLATA[1], ZLATA[2]);
      doc.circle(xP - 2.6, yP + 2.1, 0.7, "F");
      var riadky = doc.splitTextToSize(v, stlp);
      riadky.forEach(function (r, i) { doc.text(r, xP, yP + 2.4 + i * vrOdr); });
      /* dlhá odrážka sa zalomí — posun musí ísť podľa počtu riadkov,
         inak nasledujúca odrážka pristane na nej */
      yP += Math.max(5.2, riadky.length * vrOdr + 1.4);
    });

    y = Math.max(yL, yP) + 1.5;
    if (d.vystraha) {
      doc.setFont("Asap", "bold"); doc.setFontSize(7.8);
      doc.setTextColor(TMAVA[0], TMAVA[1], TMAVA[2]);
      doc.text(d.vystraha, OKRAJ, y + 2.5);
      y += 6;
    }
    /* ——— ďalší krok ———
       Obsah tejto sekcie sa presúva na druhú stranu, takže tu býva prázdna.
       Čiara sa predtým kreslila bezpodmienečne a nad pätkou zostali dve linky
       s ničím medzi sebou - klasický príznak „niečo sa nenačítalo". */
    if (d.dalejNadpis || d.dalej) {
      ciara();
      nadpisSTelom(d.dalejNadpis, d.dalej, 11, 8.5);
    }

    /* ——— kto to pripravil ———
       PDF putuje ďalej bez stránky, takže musí samo povedať, od koho je
       a kam sa klient môže obrátiť.

       Pätička sa neplaví s textom, ale kotví na spodok strany — tam patrí
       a dokument tým nekončí prázdnou stranou len kvôli pár riadkom. */
    doc.setFont("Asap", "normal"); doc.setFontSize(7);
    var riadkovD = doc.splitTextToSize(d.disclaimer, SIRKA).length;
    var VYSKA_PATKY = 5 + 18 + 5 + riadkovD * 7 * 0.3528 * 1.5 + 1;
    var spodok = A4.v - OKRAJ;
    if (y + VYSKA_PATKY > spodok) strana();
    y = spodok - VYSKA_PATKY;

    /* čiary sa kreslia priamo — ciara() by tu vlastnou kontrolou miesta
       zbytočne zalomila stranu pod už ukotvenou pätičkou */
    function linka() {
      doc.setDrawColor(LINKA[0], LINKA[1], LINKA[2]);
      doc.setLineWidth(0.2);
      doc.line(OKRAJ, y, OKRAJ + SIRKA, y);
      y += 5;
    }
    linka();
    var vrchK = y;
    doc.setFont("Asap", "bold"); doc.setFontSize(10.5);
    doc.setTextColor(TMAVA[0], TMAVA[1], TMAVA[2]);
    doc.text("Petr Hechtberger", OKRAJ, vrchK + 3.5);
    doc.setFont("Asap", "normal"); doc.setFontSize(8);
    doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
    doc.text("Wealth manager senior · Swiss Life Select Slovensko", OKRAJ, vrchK + 8.5);
    doc.text("Framborská 252/19, 010 01 Žilina", OKRAJ, vrchK + 13);

    doc.setFont("Asap", "normal"); doc.setFontSize(8.5);
    doc.setTextColor(ZLATA[0], ZLATA[1], ZLATA[2]);
    doc.textWithLink("hechtberger.com", OKRAJ + SIRKA, vrchK + 3.5,
      { align: "right", url: "https://www.hechtberger.com" });
    doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
    doc.textWithLink("petr@hechtberger.com", OKRAJ + SIRKA, vrchK + 8.5,
      { align: "right", url: "mailto:petr@hechtberger.com" });
    doc.text("+421 903 231 659", OKRAJ + SIRKA, vrchK + 13, { align: "right" });
    y = vrchK + 18;

    /* ——— disclaimer ——— */
    linka();
    doc.setFont("Asap", "normal"); doc.setFontSize(7);
    doc.setTextColor(130, 125, 118);
    /* Číslovanie mala len druhá strana („2 / 2"), takže prvá pôsobila, akoby
       do dokumentu nepatrila. Ide pod disclaimer, nie k telefónu - tam ho
       prvý pokus položil rovno na číslo. Počet strán dodá pdf-alternativa.js
       ešte pred kreslením; bez neho ostane samotné „1". */
    doc.text(window.PH_PDF_STRAN ? "1 / " + window.PH_PDF_STRAN : "1",
      OKRAJ + SIRKA, y + 2.4, { align: "right" });
    doc.splitTextToSize(d.disclaimer, SIRKA).forEach(function (r, i) {
      doc.text(r, OKRAJ, y + i * 7 * 0.3528 * 1.5 + 2);
    });

    return doc;
  }

  window.PH_PDF = function () {
    var doc = vytvor(zoStranky());
    doc.save("modelacia-privatnej-renty.pdf");
  };
})();
