/* VARIANTA B - ostrá kalkulačka s prenesenými vylepšeniami.

   Východiskom je aplikácia tak, ako beží na webe. Rozloženie kariet, poradie
   riadkov ani znenie textov sa nemení - mení sa len to, čo sa pri porovnaní
   s prototypom ukázalo ako jednoznačne lepšie:

   1. hodnota sa dá zadať priamo (klik na číslo) a doladiť tlačidlami − a +;
      posuvník zostáva, takže na hľadanie hranice je stále ťahanie;
   2. vysvetlenia a historické výnosy idú pod „i" do okna s čitateľným písmom
      namiesto drobného textu na karte;
   3. výsledok je opticky odlíšený od zadania.

   Vrstva nesiaha do výpočtu - hodnoty nastavuje cez pôvodné posuvníky, takže
   celý finančný model zostáva nedotknutý. */

(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const NBSP = ' ';
  const text = t => document.createTextNode(t);

  /* --------------------------------------------------------------- čísla */

  /* Slovenské číslo: nezlomiteľné medzery ako oddeľovač tisícov, desatinná
     čiarka. `parseFloat` by z „296 159" prečítal 296. */
  const cislo = t => {
    const c = String(t).replace(/[\s  ]/g, '').replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const v = parseFloat(c);
    return Number.isFinite(v) ? v : null;
  };
  const format = (v, des) => v.toLocaleString('sk-SK',
    { minimumFractionDigits: des, maximumFractionDigits: des });
  const cisloText = (v, des) => format(v, Number.isInteger(v) ? 0 : des);

  const POLIA = [
    { id: 'combo-v',         slider: 'sl-combo',         des: 0, jed: '€',
      popis: 'Jednorazová investícia' },
    { id: 'monthly-known-v', slider: 'sl-monthly-known', des: 0, jed: '€',
      popis: 'Mesačná investícia' },
    { id: 'c0-v',            slider: 'sl-c0',            des: 0, jed: '€',
      popis: 'Majetok pripravený na rentu' },
    { id: 'rent-v',          slider: 'sl-rent',          des: 0, jed: '€',
      popis: 'Mesačná renta v dnešných cenách' },
    { id: 'vynos-v',         slider: 'sl-vynos',         des: 1, jed: '%',
      popis: 'Ročné zhodnotenie počas budovania majetku' },
    { id: 'infl-v',          slider: 'sl-infl',          des: 1, jed: '%',
      popis: 'Ročná inflácia' },
    { id: 'vynos-rent-v',    slider: 'sl-vynos-rent',    des: 1, jed: '%',
      popis: 'Ročné zhodnotenie počas čerpania renty' },
  ];

  /* Sumové posuvníky bežia na nelineárnej škále 0–1000, kde číslo nie je
     eurová hodnota, ale poloha. Prevod robí tá istá škála, ktorú používa
     stránka - nič sa tu nedopočítava nanovo. */
  const skala = cfg => (window.__SC || {})[cfg.slider] || null;
  const citaj = cfg => {
    const s = $(cfg.slider), sc = skala(cfg);
    return sc ? sc.toVal(+s.value) : +s.value;
  };
  const rozsah = cfg => {
    const s = $(cfg.slider), sc = skala(cfg);
    return sc ? [sc.toVal(+s.min), sc.toVal(+s.max)] : [+s.min, +s.max];
  };
  function zapis(cfg, hodnota) {
    const s = $(cfg.slider), sc = skala(cfg);
    const [lo, hi] = rozsah(cfg);
    const orez = Math.min(hi, Math.max(lo, hodnota));
    const krok = (+s.step || 1);
    s.value = sc ? sc.toPos(orez) : Math.round(orez / krok) * krok;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return orez;
  }
  /* Najbližšia odlišná hodnota v danom smere - mriežku drží samotná škála. */
  function dalsia(cfg, smer) {
    const s = $(cfg.slider), sc = skala(cfg);
    const teraz = citaj(cfg);
    if (!sc) return teraz + smer * (+s.step || 1);
    let pos = +s.value;
    for (let i = 0; i < 1200; i += 1) {
      pos += smer;
      if (pos < +s.min || pos > +s.max) return teraz;
      const v = sc.toVal(pos);
      if (v !== teraz) return v;
    }
    return teraz;
  }

  /* ------------------------------------------------------------ poznámka */

  function poznamkaPri(kde, sprava) {
    const kam = kde.closest('.sl') || kde.closest('.set') || kde.parentNode;
    const stara = kam.querySelector('.b-poznamka');
    if (stara) stara.remove();
    const p = document.createElement('div');
    p.className = 'b-poznamka';
    p.setAttribute('role', 'status');
    p.textContent = sprava;
    kam.appendChild(p);
    setTimeout(() => p.remove(), 7000);
  }

  /* ------------------------------------------------ krokovadlo pri hodnote */

  function tlacidlo(znak, popis) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'b-krok';
    b.textContent = znak;
    b.tabIndex = -1;                    /* ovládačom pre klávesnicu je hodnota */
    b.setAttribute('aria-label', popis);
    b.title = popis;
    return b;
  }

  function ovladac(cfg) {
    const el = $(cfg.id), slider = $(cfg.slider);
    if (!el || !slider) return;

    const skupina = document.createElement('span');
    skupina.className = 'b-ovladac';
    el.parentNode.insertBefore(skupina, el);
    const dole = tlacidlo('−', 'Znížiť: ' + cfg.popis.toLowerCase());
    const hore = tlacidlo('+', 'Zvýšiť: ' + cfg.popis.toLowerCase());
    /* Rovnaké usporiadanie ako v prvom prototype: − pred číslom, + za ním.
       Tlačidlá tak číslo rámujú a smer je čitateľný bez premýšľania. */
    skupina.appendChild(dole);
    skupina.appendChild(el);
    skupina.appendChild(hore);

    el.classList.add('b-cislo');
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', cfg.popis);
    el.title = 'Kliknutím zadáte presnú hodnotu';

    const obnov = () => {
      const [lo, hi] = rozsah(cfg);
      const v = citaj(cfg);
      el.setAttribute('aria-valuenow', String(v));
      el.setAttribute('aria-valuetext', el.textContent.trim());
      el.setAttribute('aria-valuemin', String(lo));
      el.setAttribute('aria-valuemax', String(hi));
      const vypnute = slider.disabled;
      dole.disabled = vypnute || v <= lo;
      hore.disabled = vypnute || v >= hi;
    };
    obnov();
    new MutationObserver(obnov).observe(el,
      { childList: true, characterData: true, subtree: true });
    new MutationObserver(obnov).observe(slider,
      { attributes: true, attributeFilter: ['disabled'] });

    const krokni = smer => {
      if (slider.disabled) return;
      zapis(cfg, dalsia(cfg, smer));
      obnov();
    };

    /* Podržanie zrýchľuje - inak je cesta z 35 na 50 pätnásť kliknutí. */
    [[dole, -1], [hore, 1]].forEach(([b, smer]) => {
      let cakanie = null, opakovanie = null, tempo = 110;
      const stop = () => {
        clearTimeout(cakanie); clearInterval(opakovanie);
        cakanie = opakovanie = null; tempo = 110;
      };
      b.addEventListener('pointerdown', e => {
        if (b.disabled) return;
        e.preventDefault(); e.stopPropagation();
        krokni(smer);
        cakanie = setTimeout(() => {
          const beh = () => {
            krokni(smer);
            if (b.disabled) { stop(); return; }
            if (tempo > 45) { tempo -= 12; clearInterval(opakovanie); opakovanie = setInterval(beh, tempo); }
          };
          opakovanie = setInterval(beh, tempo);
        }, 480);
      });
      ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(t =>
        b.addEventListener(t, stop));
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
    });

    /* --- presný zápis --- */
    const otvor = () => {
      if (slider.disabled || el.querySelector('input')) return;
      const povodne = el.innerHTML;
      const pole = document.createElement('input');
      pole.type = 'text';
      pole.inputMode = 'decimal';
      pole.className = 'b-pole';
      pole.setAttribute('aria-label', cfg.popis);
      pole.value = format(citaj(cfg), cfg.des);
      pole.style.width = Math.max(3, pole.value.length + 1) + 'ch';
      el.textContent = '';
      el.appendChild(pole);
      pole.focus(); pole.select();

      let hotovo = false;
      const zavri = ulozit => {
        if (hotovo) return;
        hotovo = true;
        const v = cislo(pole.value);
        const napisane = pole.value.trim();
        el.innerHTML = povodne;
        if (ulozit && v === null && napisane !== '') {
          poznamkaPri(el, `Hodnotu „${napisane}" sme nevedeli prečítať ako číslo, `
            + `preto sme ponechali ${cisloText(citaj(cfg), cfg.des)}${NBSP}${cfg.jed}.`);
        }
        if (ulozit && v !== null) {
          const [lo, hi] = rozsah(cfg);
          const orez = zapis(cfg, v);
          if (v < lo || v > hi) poznamkaPri(el,
            `Zadali ste ${cisloText(v, cfg.des)}${NBSP}${cfg.jed}. Rozsah je `
            + `${cisloText(lo, cfg.des)}${NBSP}–${NBSP}${cisloText(hi, cfg.des)}${NBSP}${cfg.jed}, `
            + `preto sme použili ${cisloText(orez, cfg.des)}${NBSP}${cfg.jed}.`);
        }
        obnov();
        el.focus();
      };
      pole.addEventListener('input', () => {
        pole.style.width = Math.max(3, pole.value.length + 1) + 'ch';
      });
      pole.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); zavri(true); }
        if (ev.key === 'Escape') { ev.preventDefault(); zavri(false); }
      });
      pole.addEventListener('blur', () => zavri(true));
      pole.addEventListener('pointerdown', ev => ev.stopPropagation());
    };

    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.target === el) otvor();
    });
    el.addEventListener('keydown', e => {
      if (e.target !== el || slider.disabled) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otvor(); return; }
      const [lo, hi] = rozsah(cfg);
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); krokni(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); krokni(-1); }
      else if (e.key === 'PageUp') { e.preventDefault(); for (let i = 0; i < 10; i += 1) krokni(1); }
      else if (e.key === 'PageDown') { e.preventDefault(); for (let i = 0; i < 10; i += 1) krokni(-1); }
      else if (e.key === 'Home') { e.preventDefault(); zapis(cfg, lo); obnov(); }
      else if (e.key === 'End') { e.preventDefault(); zapis(cfg, hi); obnov(); }
    });
  }

  /* ------------------------------------------------- okno s vysvetlením */

  let prekrytie = null, otvoreny = null, poradie = 0;

  function pripravOkno() {
    if (prekrytie) return prekrytie;
    prekrytie = document.createElement('div');
    prekrytie.className = 'b-prekrytie';
    prekrytie.hidden = true;
    const okno = document.createElement('div');
    okno.className = 'b-okno';
    okno.setAttribute('role', 'dialog');
    okno.setAttribute('aria-modal', 'true');
    const hlavicka = document.createElement('div');
    hlavicka.className = 'b-hlavicka';
    const nadpis = document.createElement('h3');
    nadpis.className = 'b-nadpis';
    const zavri = document.createElement('button');
    zavri.type = 'button';
    zavri.className = 'b-zavri';
    zavri.setAttribute('aria-label', 'Zavrieť vysvetlenie');
    zavri.textContent = '✕';
    hlavicka.append(nadpis, zavri);
    okno.appendChild(hlavicka);
    prekrytie.appendChild(okno);
    document.body.appendChild(prekrytie);
    zavri.addEventListener('click', () => zavriOkno());
    prekrytie.addEventListener('click', e => { if (e.target === prekrytie) zavriOkno(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && otvoreny) { e.stopPropagation(); zavriOkno(); }
    });
    Object.assign(prekrytie, { __okno: okno, __nadpis: nadpis, __zavri: zavri });
    return prekrytie;
  }

  function otvorOkno(panel, btn, popis) {
    const pre = pripravOkno();
    if (otvoreny) zavriOkno();
    /* Panel sa presúva, nekopíruje - údaje, ktoré stránka priebežne
       prepisuje, tak zostávajú živé aj v otvorenom okne. */
    panel.__rodic = panel.parentNode;
    panel.__zaNim = panel.nextSibling;
    pre.__nadpis.textContent = popis;
    pre.__okno.appendChild(panel);
    panel.hidden = false;
    pre.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    otvoreny = { panel, btn };
    pre.__zavri.focus();
  }

  function zavriOkno() {
    if (!otvoreny) return;
    const { panel, btn } = otvoreny;
    otvoreny = null;
    panel.hidden = true;
    if (panel.__rodic) panel.__rodic.insertBefore(panel, panel.__zaNim);
    prekrytie.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  }

  /* Vysvetlenie schová pod „i" pri zvolenej kotve. */
  function infoPri(kotva, prvky, popis) {
    const zoznam = prvky.filter(Boolean);
    if (!zoznam.length) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'b-info';
    btn.textContent = 'i';
    btn.setAttribute('aria-label', popis);
    btn.setAttribute('aria-expanded', 'false');
    poradie += 1;
    const panel = document.createElement('div');
    panel.id = 'b-panel-' + poradie;
    panel.className = 'b-panel';
    panel.hidden = true;
    btn.setAttribute('aria-controls', panel.id);
    zoznam.forEach(el => panel.appendChild(el));
    /* Pevná medzera, nie obyčajná: pri dvojriadkovom štítku ostávala ikona
       sama na druhom riadku a vyzeralo to ako preklep. Takto sa zalomí
       spolu s posledným slovom. */
    kotva.appendChild(text('\u00a0'));
    kotva.appendChild(btn);
    kotva.parentNode.insertBefore(panel, kotva.nextSibling);
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (otvoreny && otvoreny.panel === panel) zavriOkno();
      else otvorOkno(panel, btn, popis);
    });
    /* Voľba v okne je rozhodnutie - okno sa zavrie, aby bolo vidieť dôsledok. */
    panel.addEventListener('click', e => {
      if (e.target.closest('button')) setTimeout(zavriOkno, 0);
    });
    return panel;
  }

  /* Vysvetlenia idú pod „i" a preberajú znenie z prototypu: historické výnosy
     ako veta s tlačidlami namiesto tabuľkových popiskov, podmienky výpočtu
     priamo pri sadzbe a bez druhej výhrady, ktorá hovorila to isté. */
  function schovajVysvetlenia() {
    const set = document.querySelector('#c-today .set');
    if (set) {
      const cap = set.querySelector('.cap');
      const predpoklad = set.querySelector('p.assumption-note:not(.assumption-warn)');
      const popisTipov = [...set.querySelectorAll('p.when')]
        .find(p => /Historické/i.test(p.textContent));
      const tipy = $('tg-tipy');
      const note = $('vynos-note');

      /* Z dvoch tabuľkových tlačidiel sa stane veta - inak nie je poznať,
         že sa dá kliknúť, a chýba pri nich, čoho sa tie čísla týkajú. */
      if (tipy) {
        const b = [...tipy.querySelectorAll('button')];
        b.forEach(x => { x.textContent = String(x.dataset.vynos).replace('.', ',') + ' %'; x.remove(); });
        tipy.textContent = 'Historické údaje na porovnanie, nie návrh predpokladu: svetový akciový '
          + 'index MSCI World dosiahol ';
        if (b[0] && b[1]) tipy.append(b[0], ' ročne za 56 rokov a ', b[1], ' za posledných desať.');
      }
      if (popisTipov) popisTipov.remove();
      /* Podmienky výpočtu patria k sadzbe, nie na spodok stránky. Výhrada z
         karty sa neruší, iba sťahuje sem, aby na karte nestála dvakrát to
         isté: podmienky nižšie hovoria, že sadzbu zadal klient, táto veta
         dodáva to druhé - že ju neodporúčame my. Bez nej by prototyp nikde
         nepovedal, že číslo nie je náš návrh. */
      const vyhrada = document.createElement('p');
      vyhrada.className = 'b-vyhrada';
      vyhrada.textContent = 'Je to váš predpoklad, nie očakávaný ani odporúčaný výnos.';
      const podmienky = $('assump-detail');
      if (predpoklad) predpoklad.remove();
      if (cap) infoPri(cap, [vyhrada, podmienky, tipy, note], 'Podmienky výpočtu a porovnanie');
    }

    /* Inflácia: odkiaľ sa berie predvolená hodnota. Tlačidlo nesmie skončiť
       vnútri štítku - klik by prepol zaškrtávacie políčko. */
    const prepinac = document.querySelector('#c-start label.sw');
    if (prepinac && prepinac.parentNode) {
      const oInflacii = document.createElement('p');
      oInflacii.className = 'assumption-note';
      oInflacii.textContent = 'Predvolené 3 % ročne sú dlhodobý predpoklad, '
        + 'nie predpoveď. Európska centrálna banka sa snaží držať infláciu '
        + 'v eurozóne blízko 2 %; na Slovensku býva dlhodobo o niečo vyššia '
        + 'a v jednotlivých rokoch kolíše výrazne. Hodnotu si preto môžete '
        + 'nastaviť podľa toho, s čím chcete počítať.';
      const obal = document.createElement('span');
      obal.className = 'b-kotva';
      prepinac.parentNode.insertBefore(obal, prepinac.nextSibling);
      infoPri(obal, [oInflacii], 'Prečo počítame s infláciou 3 %');
    }

    const sety = document.querySelectorAll('#c-start .set');
    const cerpanie = sety[1];
    if (cerpanie) {
      const cap = cerpanie.querySelector('.cap');
      const vysvetlenie = cerpanie.querySelector('p.assumption-note:not(.assumption-warn)');
      if (vysvetlenie) vysvetlenie.textContent =
        'Kým majetok budujete, môžete si dovoliť väčšie výkyvy, pretože trhy majú '
        + 'viac času na zotavenie. Počas čerpania z majetku pravidelne vyberáte, '
        + 'preto počítame opatrnejšie a portfólio má predovšetkým chrániť kúpnu '
        + 'silu renty.';
      if (cap) infoPri(cap, [vysvetlenie], 'Prečo sa počas čerpania počíta opatrnejšie');
    }
  }

  /* ------------------------------------------------------------- štart */

  /* Inflácia je jediný riadok, kde hodnota stojí vnútri štítku prepínača.
     Tlačidlo „+" preto vytŕčalo z karty a klik na číslo prepínal políčko.
     Hodnota ide na vlastný riadok pod text, „i" zostáva pri texte. */
  function presunInflaciu() {
    const hodnota = $('infl-v');
    const stitok = document.querySelector('#c-start label.sw');
    if (!hodnota || !stitok || !stitok.parentNode) return;
    const skupina = hodnota.closest('.b-ovladac');
    if (!skupina) return;
    const riadok = document.createElement('div');
    riadok.className = 'b-riadok-hodnoty';
    riadok.appendChild(skupina);
    /* Za štítok aj za „i", ktoré k nemu patrí. */
    const kotva = stitok.nextElementSibling;
    const zaCim = kotva && kotva.classList.contains('b-kotva') ? kotva : stitok;
    zaCim.parentNode.insertBefore(riadok, zaCim.nextSibling);
  }

  /* Obsah niektorých rozbaľovačov sa presúva pod „i" pri príslušnom ovládači.
     Prázdny rozbaľovač potom sľubuje detaily a otvorí sa do ničoho - a klikne
     naň práve ten, kto detaily naozaj hľadá. Kontrola musí bežať až na konci,
     keď sú všetky presuny hotové; skôr by odsek ešte obsah mal. */
  function schovajPrazdneRozbalovace() {
    document.querySelectorAll('details.metodika').forEach(d => {
      const obsah = [...d.children].filter(e => e.tagName !== 'SUMMARY');
      if (!obsah.length || !obsah.some(e => e.textContent.trim())) d.hidden = true;
    });
  }

  function start() {
    document.documentElement.classList.add('b-vylepsene');
    POLIA.forEach(ovladac);
    schovajVysvetlenia();
    presunInflaciu();
    schovajPrazdneRozbalovace();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
