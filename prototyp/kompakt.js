/* PROTOTYP v2 — kompaktné usporiadanie klientskych kariet (desktop).
   Beží ako vrstva nad živou aplikáciou: nemení výpočet ani logiku, iba
   usporiadanie a texty. Vďaka tomu sa dá rýchlo ladiť a nič sa nemôže
   pokaziť v produkčnom jadre.

   Čo sa v druhom priechode zmenilo oproti prvému:
   1. Hlavička je prirodzená veta („Začiatok čerpania v 65 rokoch"), nie
      nadpis s bodkou a samostatným riadkom o veku. Krokovacie tlačidlá idú
      do tej istej vety, takže z troch riadkov je jeden.
   2. Prostredná karta je dvojstĺpcová. Výsledky, ktoré patria k sebe, stoja
      vedľa seba — to je hlavný zdroj úspory výšky, nie menšie medzery.
   3. Vysvetlenia sa nemažú, len sa zbalia do jedného pásu pod ovládanie.
      Žiadne číslo, voľba ani veta z kariet nezmizli. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const NBSP = ' ';

  /* ---- Kroky posuvníkov ----
     Doteraz krok závisel od šírky obrazovky a preskakoval po desiatkach eur.
     Tu je pevný a rovnaký na každom zariadení. */
  const KROK = {
    'sl-rent': 10, 'sl-combo': 100, 'sl-monthly-known': 5,
    'sl-c0': 1000, 'sl-vynos': 0.1, 'sl-infl': 0.1, 'sl-vynos-rent': 0.1,
  };

  /* Ktoré zobrazenie hodnoty patrí ku ktorému posuvníku a ako sa číta späť.
     `des` = počet desatinných miest, `jed` = jednotka za číslom. */
  const POLIA = [
    { zobraz: 'combo-v',         slider: 'sl-combo',         des: 0, jed: '€' },
    { zobraz: 'monthly-known-v', slider: 'sl-monthly-known', des: 0, jed: '€' },
    { zobraz: 'c0-v',            slider: 'sl-c0',            des: 0, jed: '€' },
    { zobraz: 'rent-v',          slider: 'sl-rent',          des: 0, jed: '€' },
    { zobraz: 'vynos-v',         slider: 'sl-vynos',         des: 1, jed: '%' },
    { zobraz: 'infl-v',          slider: 'sl-infl',          des: 1, jed: '%' },
    { zobraz: 'vynos-rent-v',    slider: 'sl-vynos-rent',    des: 1, jed: '%' },
  ];

  /* Slovenské číslo: nezlomiteľné medzery ako oddeľovač tisícov, desatinná
     čiarka. `parseFloat` by z „296 159" prečítal 296, preto vlastné čítanie. */
  const cislo = t => {
    const c = String(t).replace(/[\s  ]/g, '').replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const v = parseFloat(c);
    return Number.isFinite(v) ? v : null;
  };
  const format = (v, des) => v.toLocaleString('sk-SK',
    { minimumFractionDigits: des, maximumFractionDigits: des });

  function poznamka(kde, text) {
    const p = document.createElement('span');
    p.className = 'pole-poznamka';
    p.textContent = text;
    kde.parentNode.appendChild(p);
    setTimeout(() => p.remove(), 4000);
  }

  /* Sumové posuvníky bežia na škále 0–1000, kde číslo nie je eurová hodnota,
     ale poloha. Rozsah v eurách preto zistíme tak, že sa posuvníka spýtame:
     posunieme ho na oba konce a prečítame, čo zobrazí. Žiadnu škálu si tu
     nedopočítavame — používame tú, ktorú má stránka. */
  function rozsahHodnot(cfg) {
    const slider = $(cfg.slider), zobraz = $(cfg.zobraz);
    const povodna = slider.value;
    const citaj = p => {
      slider.value = p;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      return cislo(zobraz.textContent);
    };
    const lo = citaj(slider.min), hi = citaj(slider.max);
    citaj(povodna);
    if (lo === null || hi === null) return [parseFloat(slider.min), parseFloat(slider.max)];
    return lo <= hi ? [lo, hi] : [hi, lo];
  }

  /* Nelineárne posuvníky majú vlastnú škálu, takže hodnotu nevieme zapísať
     priamo do `value`. Prevod pozície zabezpečí binárne hľadanie nad tým,
     čo posuvník sám vracia — funguje pre lineárne aj nelineárne rovnako. */
  function nastav(cfg, hodnota) {
    const slider = $(cfg.slider), zobraz = $(cfg.zobraz);
    const precitaj = () => cislo(zobraz.textContent);
    const min = parseFloat(slider.min), max = parseFloat(slider.max);
    const krok = parseFloat(slider.step) || 1;
    let lo = min, hi = max, najlepsia = slider.value, najmensiaChyba = Infinity;
    for (let i = 0; i < 40; i += 1) {
      const stred = Math.round((lo + hi) / 2 / krok) * krok;
      slider.value = stred;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      const teraz = precitaj();
      if (teraz === null) break;
      const chyba = Math.abs(teraz - hodnota);
      if (chyba < najmensiaChyba) { najmensiaChyba = chyba; najlepsia = stred; }
      if (chyba === 0) break;
      if (teraz < hodnota) lo = stred; else hi = stred;
      if (hi - lo <= krok) break;
    }
    slider.value = najlepsia;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---- Hodnota ako vstupné pole ----
     Zobrazenie sa nenahrádza inputom natrvalo — pole sa otvorí až po kliknutí.
     Karta tak v pokoji vyzerá ako text, nie ako formulár. Aby však bolo na
     prvý pohľad jasné, že sa hodnota dá prepísať, má vlastnú jemnú plochu
     s rámikom (výhrada 6 z testovania). */
  function urobEditovatelnym(cfg) {
    const zobraz = $(cfg.zobraz), slider = $(cfg.slider);
    if (!zobraz || !slider) return;
    zobraz.classList.add('editovatelne');
    zobraz.tabIndex = 0;
    zobraz.setAttribute('role', 'button');
    zobraz.setAttribute('aria-label', 'Upraviť hodnotu');
    zobraz.title = 'Kliknutím zadáte hodnotu priamo';

    const otvor = () => {
      if (zobraz.querySelector('input')) return;
      const teraz = cislo(zobraz.textContent);
      const pole = document.createElement('input');
      pole.type = 'text';
      pole.inputMode = 'decimal';
      pole.className = 'pole-hodnoty';
      pole.value = teraz === null ? '' : format(teraz, cfg.des);
      const povodne = zobraz.innerHTML;
      zobraz.textContent = '';
      zobraz.appendChild(pole);
      pole.focus();
      pole.select();

      let hotovo = false;
      const zavri = (uloz) => {
        /* Zatvorenie príde dvakrát: z klávesy aj z následného blur. Druhýkrát
           by sa už čítalo z odpojeného poľa a hodnota by sa vrátila späť. */
        if (hotovo) return;
        hotovo = true;
        const v = cislo(pole.value);
        zobraz.innerHTML = povodne;
        if (uloz && v !== null) {
          /* Hodnotu podstrčíme posuvníku a necháme prebehnúť jeho vlastnú
             obsluhu — výpočet aj clamp tak zostávajú v pôvodnom kóde. */
          const [min, max] = rozsahHodnot(cfg);
          const orez = Math.min(max, Math.max(min, v));
          nastav(cfg, orez);
          if (orez !== v) poznamka(zobraz,
            `Rozsah je ${format(min, cfg.des)}${NBSP}–${NBSP}${format(max, cfg.des)}${NBSP}${cfg.jed}.`);
        }
      };
      pole.addEventListener('keydown', e => {
        /* Klávesa nesmie prebublať na zobrazenie — Enter aj medzerník tam
           otvárajú pole a otvorili by ho hneď znova, s prázdnou hodnotou. */
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); zavri(true); }
        if (e.key === 'Escape') { e.preventDefault(); zavri(false); }
      });
      pole.addEventListener('blur', () => zavri(true));
    };
    zobraz.addEventListener('click', e => {
      if (e.target !== zobraz) return;
      /* Hodnota inflácie sedí vo vnútri `label` — bez tohto by kliknutie
         prehodilo zaškrtávacie políčko a prekreslenie by pole hneď zmazalo. */
      e.preventDefault();
      e.stopPropagation();
      otvor();
    });
    zobraz.addEventListener('keydown', e => {
      if (e.target !== zobraz) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otvor(); }
    });
  }

  /* ---- Hlavička ako prirodzená veta ----
     Pôvodne: nadpis „Začiatok čerpania", pod ním samostatný riadok
     „O 15 rokov, keď budem mať 65" a okolo neho dve krokovacie tlačidlá.
     Tri riadky, ktoré sa pri zalomení rozpadali. Teraz jedna veta, v nej
     editovateľný vek a hneď za ňou krokovanie.

     Zdrojom textu zostávajú pôvodné prvky (`v-*` a `w-*`), ktoré prepisuje
     `render()`. Nič nedopočítavame — iba preskladáme. */
  const VEK = { 'c-today': 'v-now', 'c-start': 'v-start', 'c-end': 'v-end' };
  const KEDY = { 'c-today': 'w-now', 'c-start': 'w-start', 'c-end': 'w-end' };
  const KLUC = { 'c-today': 'now', 'c-start': 'start', 'c-end': 'end' };

  function zneniHlavicky(idKarty) {
    const vek = ($(VEK[idKarty]).textContent || '').trim();
    const kedy = ($(KEDY[idKarty]).textContent || '').trim();
    if (idKarty === 'c-today') return { pred: 'Dnes mám ', vek, po: ' rokov', vedla: '' };
    if (idKarty === 'c-start') {
      if (/hneď/i.test(kedy)) return { pred: 'Čerpám hneď teraz', vek: '', po: '', vedla: '' };
      /* „O 15 rokov, keď budem mať 65" — časť „o 15 rokov" je informácia
         navyše oproti veku, takže ju držíme vedľa vety, nie pod ňou. */
      const m = kedy.match(/^O\s+([^,]+)/i);
      return { pred: 'Začiatok čerpania v ', vek, po: ' rokoch',
               vedla: m ? `o ${m[1]}` : '' };
    }
    if (/bez konca/i.test(kedy)) return { pred: 'Renta pokračuje bez konca', vek: '', po: '', vedla: '' };
    return { pred: 'Koniec čerpania v ', vek, po: ' rokoch', vedla: '' };
  }

  function posunVek(kluc, cielova) {
    /* Vek nastavujeme cez klávesnicu míľnika, takže výpočet aj všetky
       obmedzenia (minimá, maximá, zamknuté karty) zostávajú v pôvodnom kóde. */
    const h = document.querySelector(`.handle[data-key="${kluc}"]`);
    if (!h) return;
    const teraz = Number(h.getAttribute('aria-valuenow'));
    if (!Number.isFinite(teraz)) return;
    const smer = cielova > teraz ? 'ArrowRight' : 'ArrowLeft';
    for (let i = 0; i < Math.abs(cielova - teraz); i += 1) {
      h.dispatchEvent(new KeyboardEvent('keydown', { key: smer, bubbles: true }));
    }
  }

  function prestavHlavicku(idKarty) {
    const karta = $(idKarty);
    const h2 = karta && karta.querySelector('h2');
    if (!h2) return;
    const veta = h2.querySelector('.veta');
    if (!veta) return;
    const z = zneniHlavicky(idKarty);
    const podpis = `${z.pred}|${z.vek}|${z.po}|${z.vedla}`;
    if (veta.dataset.podpis === podpis) return;
    veta.dataset.podpis = podpis;
    veta.textContent = z.pred;
    if (z.vek) {
      const span = document.createElement('span');
      span.className = 'vek-v-nadpise editovatelne';
      span.tabIndex = 0;
      span.setAttribute('role', 'button');
      span.title = 'Kliknutím zadáte vek priamo';
      span.textContent = z.vek;
      veta.appendChild(span);
      veta.appendChild(document.createTextNode(z.po));
      const otvor = () => {
        if (karta.classList.contains('locked')) return;
        if (span.querySelector('input')) return;
        const pole = document.createElement('input');
        pole.type = 'text'; pole.inputMode = 'numeric';
        pole.className = 'pole-hodnoty pole-vek';
        pole.value = z.vek;
        span.textContent = '';
        span.appendChild(pole);
        pole.focus(); pole.select();
        let hotovo = false;
        const zavri = uloz => {
          if (hotovo) return;
          hotovo = true;
          const v = cislo(pole.value);
          span.textContent = z.vek;
          if (uloz && v !== null) posunVek(KLUC[idKarty], Math.round(v));
        };
        pole.addEventListener('keydown', ev => {
          ev.stopPropagation();
          if (ev.key === 'Enter') { ev.preventDefault(); zavri(true); }
          if (ev.key === 'Escape') { ev.preventDefault(); zavri(false); }
        });
        pole.addEventListener('blur', () => zavri(true));
      };
      span.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target === span) otvor();
      });
      span.addEventListener('keydown', e => {
        if (e.target !== span) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otvor(); }
      });
    }
    if (z.vedla) {
      const vedla = document.createElement('span');
      vedla.className = 'vedlajsi-udaj';
      vedla.textContent = z.vedla;
      veta.appendChild(document.createTextNode(' '));
      veta.appendChild(vedla);
    }
  }

  function pripravHlavicky() {
    Object.keys(VEK).forEach(id => {
      const karta = $(id);
      const h2 = karta && karta.querySelector('h2');
      const riadok = karta && karta.querySelector('.when-row');
      if (!h2 || !riadok) return;
      h2.textContent = '';
      const veta = document.createElement('span');
      veta.className = 'veta';
      h2.appendChild(veta);
      /* Krokovacie tlačidlá patria k vete, nie pod ňu. */
      const kroky = document.createElement('span');
      kroky.className = 'kroky';
      riadok.querySelectorAll('button.step').forEach(b => kroky.appendChild(b));
      h2.appendChild(kroky);
      prestavHlavicku(id);
    });
    const obnov = () => Object.keys(VEK).forEach(prestavHlavicku);
    /* `render()` prepisuje veky aj podnadpisy; sledujeme ich a vetu držíme
       aktuálnu bez toho, aby sme siahali do pôvodného kódu. */
    [...Object.values(VEK), ...Object.values(KEDY)].forEach(id => {
      const el = $(id);
      if (!el) return;
      new MutationObserver(obnov).observe(el,
        { childList: true, characterData: true, subtree: true });
    });
  }

  /* ---- Popis a hodnota na jednom riadku ---- */
  function riadokPopisHodnota(popis, hodnota) {
    if (!popis || !hodnota || !popis.parentNode) return null;
    const riadok = document.createElement('div');
    riadok.className = 'riadok-ovladania';
    popis.parentNode.insertBefore(riadok, popis);
    riadok.appendChild(popis);
    riadok.appendChild(hodnota);
    return riadok;
  }

  /* Dva bloky vedľa seba. Toto je hlavný zdroj úspory výšky na prostrednej
     karte — nie menšie medzery, ale iné usporiadanie. */
  function paruj(a, b) {
    if (!a || !b || !a.parentNode) return;
    const obal = document.createElement('div');
    obal.className = 'dvojica';
    a.parentNode.insertBefore(obal, a);
    obal.appendChild(a);
    obal.appendChild(b);
  }

  /* ---- Karta „Dnes": blok zhodnotenia ----
     Zo siedmich riadkov robíme tri. Všetky vety zostávajú, len sa poskladajú
     do jedného pásu pod posuvník. */
  function kompaktujZhodnotenie() {
    const set = document.querySelector('#c-today .set');
    if (!set) return;
    set.classList.add('kompakt');
    riadokPopisHodnota(set.querySelector('.cap'), $('vynos-v'));

    const pas = document.createElement('div');
    pas.className = 'pas-poznamok';
    const predpoklad = set.querySelector('p.assumption-note:not(.assumption-warn)');
    if (predpoklad) pas.appendChild(predpoklad);
    const popisTipov = [...set.querySelectorAll('p.when')]
      .find(p => /Historické/i.test(p.textContent));
    const tipy = $('tg-tipy');
    if (popisTipov && tipy) {
      const riadok = document.createElement('div');
      riadok.className = 'riadok-tipov';
      popisTipov.classList.add('popis-tipov');
      riadok.appendChild(popisTipov);
      riadok.appendChild(tipy);
      pas.appendChild(riadok);
    }
    const warn = $('vynos-warn');
    if (warn) pas.appendChild(warn);
    const note = $('vynos-note');
    if (note) pas.appendChild(note);
    set.appendChild(pas);
  }

  /* ---- Karta „Začiatok čerpania" ---- */
  function kompaktujStart() {
    const karta = $('c-start');
    if (!karta) return;

    /* „(v dnešných cenách)" patrí k popisu, nie na vlastný riadok. */
    const popisRenty = $('rent-k'), notaRenty = $('rent-note');
    if (popisRenty && notaRenty) {
      popisRenty.appendChild(document.createTextNode(' '));
      popisRenty.appendChild(notaRenty);
      notaRenty.classList.add('v-popise');
    }

    /* Dva výsledky vedľa seba. */
    paruj($('out-cap'), $('out-fut'));

    const sety = karta.querySelectorAll('.set');
    /* Varovanie aj dlhé vysvetlenie k výnosu počas čerpania by v polovičnom
       stĺpci narástli do výšky — patria pod obe nastavenia, cez celú šírku.
       Varovanie ide prvé, aby si ho klient nemohol nevšimnúť. */
    const podKartou = sety[1]
      ? [$('vynos-rent-warn'), sety[1].querySelector('p.assumption-note:not(.assumption-warn)')]
      : [];
    if (sety[1]) {
      riadokPopisHodnota(sety[1].querySelector('.cap'), $('vynos-rent-v'));
      sety[1].classList.add('kompakt');
    }
    if (sety[0]) sety[0].classList.add('kompakt');
    if (sety[0] && sety[1]) paruj(sety[0], sety[1]);
    podKartou.forEach(el => {
      if (!el) return;
      el.classList.add('poznamka-siroka');
      karta.appendChild(el);
    });
  }

  /* Po preskladaní kariet majú iné výšky, než s akými počítalo posledné
     rozmiestnenie. Pôvodná stránka si polohy prepočíta pri každom `resize`,
     takže si o prepočet povieme jej vlastnou cestou — do jej kódu nesiahame. */
  const prepocitajRozlozenie = () => dispatchEvent(new Event('resize'));

  /* ---- Prototyp beží aj samostatne, nielen v iframe ----
     Kompaktné rozloženie (všetky tri karty v jednom rade nad osou) zapína
     v ostrej verzii hostiteľská stránka správou o svojej výške. Samostatne
     otvorený prototyp takú správu nedostane a zbytočne by sa zobrazoval
     v dvojriadkovom rozložení, ktoré na 14" displeji nevyjde. */
  function samostatnyViewport() {
    if (window.top !== window.self) return;
    const prepni = () => {
      const compact = innerWidth > 480 && innerHeight < 900;
      const html = document.documentElement;
      if (html.classList.contains('viewport-compact') === compact) return;
      html.classList.toggle('viewport-compact', compact);
      prepocitajRozlozenie();
    };
    prepni();
    addEventListener('resize', prepni, { passive: true });
  }

  function zjednotKroky() {
    for (const [id, krok] of Object.entries(KROK)) {
      const s = $(id);
      if (!s) continue;
      /* Sumové posuvníky bežia na nelineárnej škále 0–1000, takže krok
         nastavujeme na najjemnejší možný a hodnotu doladí priame zadanie. */
      if (parseFloat(s.max) === 1000 && parseFloat(s.min) === 0) s.step = 1;
      else s.step = krok;
    }
  }

  function start() {
    zjednotKroky();
    POLIA.forEach(urobEditovatelnym);
    pripravHlavicky();
    kompaktujZhodnotenie();
    kompaktujStart();

    /* Prepínač spôsobu investovania sám o sebe nepovie, na čo sa pýta.
       Ostatné prepínače majú popisné tlačidlá, takže otázku nepotrebujú. */
    const tgMode = $('tg-mode');
    if (tgMode) {
      const otazka = document.createElement('span');
      otazka.className = 'otazka-prepinaca';
      otazka.textContent = 'Ako chcete investovať?';
      tgMode.parentNode.insertBefore(otazka, tgMode);
    }

    document.documentElement.classList.add('kompakt-pripraveny');
    samostatnyViewport();
    prepocitajRozlozenie();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
