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
  var OKRAJ = 18;
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
      if (!m || m.hidden) return;
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
    document.querySelectorAll("details p").forEach(function (p) {
      var t = text(p);
      if (t) predpoklady.push(t);
    });

    return {
      nadpis: text(document.querySelector("h1")),
      uvod: text(document.querySelector(".lead")),
      plan: text(document.querySelector(".section-head h2")),
      ciel: text(document.getElementById("ciel")),
      karty: karty,
      predpokladyNadpis: text(document.querySelector("details summary")),
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
    function ciara() {
      miesto(6);
      doc.setDrawColor(LINKA[0], LINKA[1], LINKA[2]);
      doc.setLineWidth(0.2);
      doc.line(OKRAJ, y, OKRAJ + SIRKA, y);
      y += 5;
    }

    /* ——— hlavička ——— */
    odstavec("MODELÁCIA PRIVÁTNEJ RENTY", 7.5, "bold", ZLATA, SIRKA, 1.2);
    medzera(1.5);
    odstavec(d.nadpis, 17, "bold", TMAVA, SIRKA, 1.2);
    medzera(1.5);
    odstavec(d.uvod, 9, "normal", SEDA, SIRKA, 1.38);
    medzera(3);
    ciara();

    /* ——— plán ——— */
    odstavec(d.plan, 12, "bold", TMAVA, SIRKA, 1.25);
    medzera(0.5);
    odstavec(d.ciel, 9, "normal", SEDA, SIRKA, 1.38);
    medzera(3);

    /* ——— míľniky ——— */
    d.karty.forEach(function (k) {
      var vyskaBloku = 10.5 + k.riadky.length * 9 + (k.pod ? 5.5 : 0);
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
        y += 9;
      });

      if (k.pod) {
        doc.setFont("Asap", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
        doc.text(doc.splitTextToSize(k.pod, SIRKA - 12), OKRAJ + 6, y);
      }
      y = vrch + vyskaBloku + 3.5;
    });

    medzera(1);
    ciara();

    /* ——— predpoklady a východiská ——— */
    odstavec(d.predpokladyNadpis, 11, "bold", TMAVA, SIRKA, 1.22);
    medzera(0.5);
    d.predpoklady.forEach(function (p) { odstavec(p, 8, "normal", SEDA, SIRKA, 1.36); medzera(1); });
    medzera(2.5);

    odstavec(d.vychodiskaNadpis, 11, "bold", TMAVA, SIRKA, 1.22);
    medzera(0.5);
    d.vychodiska.forEach(function (v) {
      miesto(6);
      doc.setFont("Asap", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(SEDA[0], SEDA[1], SEDA[2]);
      doc.setFillColor(ZLATA[0], ZLATA[1], ZLATA[2]);
      doc.circle(OKRAJ + 1.4, y + 1.4, 0.7, "F");
      doc.text(doc.splitTextToSize(v, SIRKA - 6), OKRAJ + 5, y + 2.4);
      y += 5.2;
    });
    medzera(2.5);
    ciara();

    /* ——— ďalší krok ——— */
    odstavec(d.dalejNadpis, 11, "bold", TMAVA, SIRKA, 1.22);
    medzera(0.5);
    odstavec(d.dalej, 8.5, "normal", SEDA, SIRKA, 1.38);
    medzera(3);

    /* ——— disclaimer ——— */
    ciara();
    odstavec(d.disclaimer, 7, "normal", [130, 125, 118], SIRKA, 1.5);

    return doc;
  }

  window.PH_PDF = function () {
    var doc = vytvor(zoStranky());
    doc.save("modelacia-privatnej-renty.pdf");
  };
})();
