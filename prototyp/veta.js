/* PROTOTYP v3.2 — „Plán ako tri vety" (klientsky desktop).

   Vrstva nad živou aplikáciou. Nesiaha do výpočtu ani do jeho logiky: pracuje
   s tými istými prvkami, ktoré stránka sama napĺňa a skrýva, len ich preskladá
   do viet a nahradí formulárové ovládanie krokovačom pri čísle.

   Druhý priechod pridáva:
   1. jednotný segmentový vzor volieb — spoločný pojem je v popise, možnosti
      sú segmenty („Majetok: budujem | už mám");
   2. krokovač „− hodnota +" namiesto čísla s linkou rozsahu; klik na hodnotu
      otvára presný zápis, tlačidlá krokujú po mriežke škály stránky;
   3. výsledok stojí len pri tom míľniku, ktorého sa týka — duplicity sa
      presúvajú alebo skrývajú podľa toho, čo stránka práve počíta;
   4. vysvetlenia a porovnania sú pod informačným „i", varovania zostávajú
      na karte. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const NBSP = ' ';
  const text = t => document.createTextNode(t);

  /* ---------------------------------------------------------------- čísla */

  /* Slovenské číslo: nezlomiteľné medzery ako oddeľovač tisícov, desatinná
     čiarka. `parseFloat` by z „296 159" prečítal 296, preto vlastné čítanie. */
  const cislo = t => {
    const c = String(t).replace(/[\s  ]/g, '').replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const v = parseFloat(c);
    return Number.isFinite(v) ? v : null;
  };
  const format = (v, des) => v.toLocaleString('sk-SK',
    { minimumFractionDigits: des, maximumFractionDigits: des });
  /* V hlásení o rozsahu píšeme percentá prirodzene: „0 – 50 %", nie „0,0 – 50,0 %". */
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
      popis: 'Ročné zhodnotenie počas vyplácania renty' },
  ];

  /* Sumové posuvníky bežia na nelineárnej škále 0–1000, kde číslo nie je
     eurová hodnota, ale poloha. Prevod robí tá istá škála, ktorú používa
     stránka (`window.__SC`) — nič sa tu nedopočítava nanovo. */
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
    const krokP = (+s.step || 1);
    s.value = sc ? sc.toPos(orez) : Math.round(orez / krokP) * krokP;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return orez;
  }
  /* Najbližšia odlišná hodnota v danom smere. Pri nelineárnej škále to nie je
     pevný krok — mriežku (stovky, tisíce) si drží samotná škála. */
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

  function zjednotKroky() {
    POLIA.forEach(cfg => {
      const s = $(cfg.slider);
      if (!s) return;
      s.step = (+s.min === 0 && +s.max === 1000) ? 1 : 0.1;
      s.tabIndex = -1;
      s.setAttribute('aria-hidden', 'true');
    });
  }

  /* Hláška po orezaní hodnoty. Nesmie skončiť vnútri krokovača — ten má
     `overflow:hidden` a text by sa neukázal. Ide preto pod celú vetu a je
     oznámená čítačke obrazovky. */
  /* Hlásenie k hodnote hľadáme v tom istom rodičovi, do ktorého ho vkladáme. */
  function zmazPoznamku(kde) {
    const veta_ = kde.closest('.veta') || kde.closest('label.sl') || kde.closest('.set');
    const kam = (veta_ && veta_.parentNode) ? veta_.parentNode : kde.parentNode;
    const stara = kam.querySelector('.pole-poznamka');
    if (stara) stara.remove();
  }

  function poznamkaPri(kde, sprava) {
    const veta_ = kde.closest('.veta') || kde.closest('label.sl') || kde.closest('.set');
    const kam = (veta_ && veta_.parentNode) ? veta_.parentNode : kde.parentNode;
    zmazPoznamku(kde);
    const p = document.createElement('div');
    p.className = 'pole-poznamka';
    p.setAttribute('role', 'status');
    p.textContent = sprava;
    if (veta_ && veta_.parentNode) veta_.parentNode.insertBefore(p, veta_.nextSibling);
    else kam.appendChild(p);
    setTimeout(() => p.remove(), 7000);
  }

  /* ------------------------------------------------------------ krokovač */

  function tlacidloKroku(znak, popis) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'krok';
    b.textContent = znak;
    b.tabIndex = -1;                 /* ovládačom pre klávesnicu je hodnota */
    b.setAttribute('aria-label', popis);
    b.title = popis;
    return b;
  }

  /* Jeden kompaktný ovládač „− hodnota +". Klik na hodnotu otvorí presný
     zápis, tlačidlá krokujú, podržanie zrýchľuje, šípky robia to isté. */
  function krokovac(cfg) {
    const el = $(cfg.id), slider = $(cfg.slider);
    if (!el || !slider) return;
    const skupina = document.createElement('span');
    skupina.className = 'ovladac-skupina';
    el.parentNode.insertBefore(skupina, el);
    const obal = document.createElement('span');
    obal.className = 'krok-ovladac';
    skupina.appendChild(obal);
    const dole = tlacidloKroku('−', 'Znížiť: ' + cfg.popis.toLowerCase());
    const hore = tlacidloKroku('+', 'Zvýšiť: ' + cfg.popis.toLowerCase());
    obal.appendChild(dole);
    obal.appendChild(el);
    obal.appendChild(hore);
    /* Ak za hodnotou nasleduje informačné „i", ide s ňou v jednom celku —
       inak by pri zalomení vety zostalo osamotené na vlastnom riadku. */
    let dalsi = skupina.nextSibling;
    while (dalsi && dalsi.nodeType === 3 && !dalsi.textContent.trim()) {
      const potom = dalsi.nextSibling;
      skupina.appendChild(dalsi);
      dalsi = potom;
    }
    if (dalsi && dalsi.classList && dalsi.classList.contains('info-i')) skupina.appendChild(dalsi);

    el.classList.add('zive-cislo');
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', cfg.popis);
    el.title = 'Kliknutím zadáte presnú hodnotu';

    const obnovStav = () => {
      const [lo, hi] = rozsah(cfg);
      const v = citaj(cfg);
      el.setAttribute('aria-valuenow', String(v));
      el.setAttribute('aria-valuetext', el.textContent.trim());
      el.setAttribute('aria-valuemin', String(lo));
      el.setAttribute('aria-valuemax', String(hi));
      const vypnute = slider.disabled;
      dole.disabled = vypnute || v <= lo;
      hore.disabled = vypnute || v >= hi;
      el.setAttribute('aria-disabled', vypnute ? 'true' : 'false');
    };
    obnovStav();
    new MutationObserver(obnovStav).observe(el,
      { childList: true, characterData: true, subtree: true });
    new MutationObserver(obnovStav).observe(slider,
      { attributes: true, attributeFilter: ['disabled'] });

    const krokni = smer => {
      if (slider.disabled) return;
      zapis(cfg, dalsia(cfg, smer));
      obnovStav();
    };

    /* Podržanie zrýchľuje: po pol sekunde začne opakovať a postupne zrýchli. */
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
      const teraz = citaj(cfg);
      const pole = document.createElement('input');
      pole.type = 'text';
      pole.inputMode = 'decimal';
      pole.className = 'pole-hodnoty';
      pole.setAttribute('aria-label', cfg.popis);
      pole.value = format(teraz, cfg.des);
      pole.style.width = Math.max(3, pole.value.length + 1) + 'ch';
      el.textContent = '';
      el.appendChild(pole);
      pole.focus();
      pole.select();

      let hotovo = false;
      const zavri = ulozit => {
        if (hotovo) return;
        hotovo = true;
        const v = cislo(pole.value);
        const napisane = pole.value.trim();
        el.innerHTML = povodne;
        /* Staré hlásenie o rozsahu nesmie prežiť ďalšie platné zadanie. */
        zmazPoznamku(el);
        if (ulozit && v === null && napisane !== '') {
          poznamkaPri(el, `Hodnotu „${napisane}“ sme nevedeli prečítať ako číslo, `
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
        obnovStav();
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
      /* Väčší krok: desať bežných krokov mriežky. */
      else if (e.key === 'PageUp') { e.preventDefault(); for (let i = 0; i < 10; i += 1) krokni(1); }
      else if (e.key === 'PageDown') { e.preventDefault(); for (let i = 0; i < 10; i += 1) krokni(-1); }
      else if (e.key === 'Home') { e.preventDefault(); zapis(cfg, lo); obnovStav(); }
      else if (e.key === 'End') { e.preventDefault(); zapis(cfg, hi); obnovStav(); }
    });
  }

  /* ------------------------------------------------------- voľby vo vete */

  function vetaVolba(idSkupiny, popis, popisky) {
    const tg = $(idSkupiny);
    if (!tg) return null;
    tg.classList.add('veta-volba');
    const tlacidla = [...tg.querySelectorAll('button')];
    if (popisky) tlacidla.forEach((b, i) => { if (popisky[i]) b.textContent = popisky[i]; });
    /* Možnosti stoja na spoločnej ploche — tá drží skupinu pokope aj vtedy,
       keď sa riadok zalomí, a odlišuje ju od okolitej vety. */
    if (!tg.querySelector('.volba-plocha')) {
      const plocha = document.createElement('span');
      plocha.className = 'volba-plocha';
      tg.insertBefore(plocha, tlacidla[0]);
      tlacidla.forEach(b => plocha.appendChild(b));
    }
    if (popis) {
      const s = document.createElement('span');
      s.className = 'popis-volby';
      s.textContent = popis + ':';
      tg.insertBefore(s, tg.firstChild);
      /* Názov skupiny berieme z viditeľného popisu — `aria-label` navyše by
         čítačka prečítala druhýkrát. */
      s.id = 'popis-' + idSkupiny;
      tg.setAttribute('aria-labelledby', s.id);
    }
    /* Roving tabindex: do skupiny sa vstúpi jedným tabulátorom, medzi
       možnosťami sa chodí šípkami a šípka rovno aj vyberá. */
    const zosuladTab = () => tlacidla.forEach(b => {
      b.tabIndex = b.classList.contains('on') ? 0 : -1;
    });
    zosuladTab();
    tlacidla.forEach(b => new MutationObserver(zosuladTab)
      .observe(b, { attributes: true, attributeFilter: ['class'] }));
    tg.addEventListener('keydown', e => {
      const i = tlacidla.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tlacidla.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tlacidla.length) % tlacidla.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tlacidla.length - 1;
      if (j === null) return;
      e.preventDefault();
      tlacidla[j].click();
      tlacidla[j].focus();
    });
    return tg;
  }
  const jeAktivny = (idSkupiny, hodnota) => {
    const b = $(idSkupiny) && $(idSkupiny).querySelector('button.on');
    return !!b && Object.values(b.dataset).indexOf(hodnota) !== -1;
  };

  /* ------------------------------------------------------- informačné „i" */

  /* ------------------------------------------------- okno s vysvetlením
     Vysvetlenie sa neotvára v karte, ale cez celú plochu: v stĺpci širokom
     466 px bolo písmo neprečítateľné. Panel zostáva na svojom mieste v DOM
     a na čas otvorenia sa presunie do prekrytia — nič sa nekopíruje, takže
     údaje, ktoré stránka priebežne prepisuje, zostávajú živé. */

  let prekrytie = null, otvoreny = null;

  function pripravPrekrytie() {
    if (prekrytie) return prekrytie;
    prekrytie = document.createElement('div');
    prekrytie.className = 'info-prekrytie';
    prekrytie.hidden = true;
    const okno = document.createElement('div');
    okno.className = 'info-okno';
    okno.setAttribute('role', 'dialog');
    okno.setAttribute('aria-modal', 'true');
    const hlavicka = document.createElement('div');
    hlavicka.className = 'info-hlavicka';
    const nadpis = document.createElement('h3');
    nadpis.className = 'info-nadpis';
    const zavri = document.createElement('button');
    zavri.type = 'button';
    zavri.className = 'info-zavri';
    zavri.setAttribute('aria-label', 'Zavrieť vysvetlenie');
    zavri.textContent = '✕';
    hlavicka.appendChild(nadpis);
    hlavicka.appendChild(zavri);
    okno.appendChild(hlavicka);
    prekrytie.appendChild(okno);
    document.body.appendChild(prekrytie);
    zavri.addEventListener('click', () => zavriInfo());
    prekrytie.addEventListener('click', e => { if (e.target === prekrytie) zavriInfo(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && otvoreny) { e.stopPropagation(); zavriInfo(); }
    });
    prekrytie.__okno = okno;
    prekrytie.__nadpis = nadpis;
    prekrytie.__zavri = zavri;
    return prekrytie;
  }

  function otvorInfo(panel, btn, popis) {
    const pre = pripravPrekrytie();
    if (otvoreny) zavriInfo();
    /* Miesto v DOM si pamätáme, aby sa panel vrátil presne tam, kde bol. */
    panel.__rodic = panel.parentNode;
    panel.__zaNim = panel.nextSibling;
    pre.__nadpis.textContent = popis;
    pre.__okno.appendChild(panel);
    panel.hidden = false;
    pre.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    otvoreny = { panel, btn };
    pre.__zavri.focus();
    prepocitaj();
  }

  function zavriInfo() {
    if (!otvoreny) return;
    const { panel, btn } = otvoreny;
    otvoreny = null;
    panel.hidden = true;
    if (panel.__rodic) panel.__rodic.insertBefore(panel, panel.__zaNim);
    prekrytie.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
    prepocitaj();
  }

  let poradieInfo = 0;
  function infoPri(kotva, prvky, popis) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'info-i';
    btn.textContent = 'i';
    btn.setAttribute('aria-label', popis);
    btn.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('div');
    poradieInfo += 1;
    panel.id = 'info-panel-' + poradieInfo;
    btn.setAttribute('aria-controls', panel.id);
    panel.className = 'info-panel';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', popis);
    panel.tabIndex = -1;
    panel.hidden = true;
    prvky.forEach(el => { if (el) panel.appendChild(el); });
    /* „i" patrí k poslednému celku popisu — samo na riadku by pôsobilo ako
       opustený znak. */
    let posledny = kotva.querySelector('.kus:last-of-type') || kotva;
    /* Vnútri štítku prepínača by klik na „i" prepol zaškrtávacie políčko —
       vtedy tlačidlo patrí až za celý štítok. */
    if (posledny.closest('label')) posledny = kotva;
    posledny.appendChild(text(' '));
    posledny.appendChild(btn);
    const veta = kotva.closest('.veta') || kotva;
    veta.parentNode.insertBefore(panel, veta.nextSibling);
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (otvoreny && otvoreny.panel === panel) zavriInfo();
      else otvorInfo(panel, btn, popis);
    });
    /* Voľba priamo v okne (napríklad prevzatie historického výnosu) je
       rozhodnutie — okno sa zavrie, aby bolo vidieť, čo sa zmenilo. */
    panel.addEventListener('click', e => {
      if (e.target.closest('button')) setTimeout(zavriInfo, 0);
    });
    return panel;
  }

  /* ------------------------------------------------------- stavba viet */

  function veta(...casti) {
    const p = document.createElement('p');
    p.className = 'veta';
    casti.forEach(c => { if (c) p.appendChild(typeof c === 'string' ? text(c) : c); });
    return p;
  }

  /* Popis vety sa skladá z celkov oddelených znakom „|". Každý celok drží
     pokope, takže riadok sa nikdy nezlomí uprostred myšlienky — a keď sa
     popis zmestí, zostane na jednom riadku. */
  function kusyPopisu(span, znenie) {
    /* Doplnky hľadáme v celom podstrome, nielen medzi priamymi deťmi —
       informačné „i" býva vnorené v poslednom celku a prepis znenia by ho
       inak potichu zmazal. */
    const doplnky = [...span.querySelectorAll('*')].filter(e => !e.classList.contains('kus'));
    span.textContent = '';
    String(znenie).split('|').forEach((k, i) => {
      const kus = document.createElement('span');
      kus.className = 'kus';
      kus.textContent = k.trim();
      if (i) span.appendChild(text(' '));
      span.appendChild(kus);
    });
    /* Doplnky (informačné „i") patria k poslednému celku — samy na riadku
       by pôsobili ako opustený znak. */
    const posledny = span.querySelector('.kus:last-of-type') || span;
    doplnky.forEach(d => { posledny.appendChild(text(' ')); posledny.appendChild(d); });
    return span;
  }

  function popisVety(znenie, ...doplnky) {
    const s = document.createElement('span');
    s.className = 'popis-vety';
    kusyPopisu(s, znenie);
    doplnky.forEach(d => {
      if (!d) return;
      /* Doplnok, ktorý je sám celkom (napríklad „v dnešných cenách"), stojí
         vedľa ostatných celkov; drobnosti idú dovnútra posledného. Medzera
         musí ísť k tomu istému rodičovi, inak sa slová zlepia. */
      const kam = (d.classList && d.classList.contains('kus'))
        ? s : (s.querySelector('.kus:last-of-type') || s);
      kam.appendChild(text(' '));
      kam.appendChild(d);
    });
    return s;
  }

  function vetaPole(obal, idHodnoty, popis, ...doplnky) {
    if (!obal) return null;
    const hodnota = $(idHodnoty);
    const slider = obal.querySelector('input[type=range]');
    const p = veta(hodnota, popis ? popisVety(popis, ...doplnky) : null);
    obal.textContent = '';
    obal.appendChild(p);
    if (slider) obal.appendChild(slider);
    return p;
  }
  /* ------------------------------------------------- výsledok ako veta
     Rovnaké usporiadanie ako v ovládaní: najprv hodnota, za ňou to, čo o nej
     hovorí. Popisy stránky sú menné frázy, tu z nich robíme prísudok. */

  const PREDIKAT = {
    'Potrebný kapitál dnes': 'je potrebný kapitál|dnes',
    'Potrebná jednorazová investícia': 'je potrebná|jednorazová investícia',
    'Potrebná pravidelná investícia': 'je potrebná|pravidelná investícia',
    'Dosiahnuteľná renta': 'je dosiahnuteľná|renta',
    'Prvá vyplatená renta v budúcich cenách': 'je prvá vyplatená renta|v budúcich cenách',
    'Prvá vyplatená renta': 'je prvá vyplatená|renta',
    'Majetok mi vydrží': 'mi vydrží|majetok',
    'Renta v dnešných cenách': 'je renta|v dnešných cenách',
    'Pevná nominálna renta': 'je pevná|nominálna renta',
    'Hodnota majetku vtedy': 'je hodnota majetku|vtedy',
    'Potrebný kapitál': 'je potrebný|kapitál',
    'Vytvorený kapitál': 'je vytvorený|kapitál'
  };

  const predikat = popis => {
    const t = (popis || '').trim();
    if (!t) return '';
    return PREDIKAT[t] || ('je ' + t.charAt(0).toLowerCase() + t.slice(1));
  };

  function vysledokAkoVeta(out) {
    if (!out || out.dataset.vetaHotova === '1') return;
    const k = out.querySelector('.k'), v = out.querySelector('.v');
    if (!k || !v) return;
    out.dataset.vetaHotova = '1';
    out.classList.add('vysledok-veta');
    out.insertBefore(v, k);          /* hodnota ide pred popis aj v poradí čítania */
    /* Stránka popis prepisuje pri každom prepočte. Vlastný zápis poznáme podľa
       `hotovo`, takže sledovanie nezacyklí samo seba. */
    const prepis = () => {
      const t = (k.textContent || '').trim();
      if (!t || t === k.dataset.hotovo) return;
      const novy = predikat(t);
      k.classList.add('popis-vety');
      kusyPopisu(k, novy);
      k.dataset.hotovo = k.textContent.trim();
    };
    prepis();
    new MutationObserver(prepis).observe(k,
      { childList: true, characterData: true, subtree: true });
  }

  function poznamky(karta, prvky) {
    const box = document.createElement('div');
    box.className = 'poznamky';
    prvky.forEach(el => { if (el) box.appendChild(el); });
    karta.appendChild(box);
    return box;
  }

  /* ------------------------------------------------------- hlavičky kariet */

  const VEK = { 'c-today': 'v-now', 'c-start': 'v-start', 'c-end': 'v-end' };
  const KEDY = { 'c-today': 'w-now', 'c-start': 'w-start', 'c-end': 'w-end' };
  const KLUC = { 'c-today': 'now', 'c-start': 'start', 'c-end': 'end' };
  const POPIS_VEKU = { 'c-today': 'Môj dnešný vek', 'c-start': 'Začiatok vyplácania',
    'c-end': 'Koniec vyplácania' };
  /* Krátky titulok karty sa nemení podľa stavu — je to kotva, podľa ktorej
     človek nájde kartu bez čítania. Konkrétny stav hovorí veta pod ním. */
  const TITULOK = { 'c-today': 'Dnes', 'c-start': 'Začiatok vyplácania',
    'c-end': 'Koniec vyplácania' };

  /* Hlavička je taký istý riadok ako ostatné: najprv hodnota s krokovaním,
     za ňou veta, ktorá hovorí, čo tá hodnota znamená. */
  function zneniHlavicky(id) {
    const vek = ($(VEK[id]).textContent || '').trim();
    const kedy = ($(KEDY[id]).textContent || '').trim();
    /* Jednotka patrí do popisu, nie k číslu — v stĺpci hodnôt tak stoja
       samotné čísla a dajú sa porovnať na prvý pohľad. */
    if (id === 'c-today') return { vek, jed: 'rokov', predikat: 'rokov|mám dnes', vedla: '' };
    if (id === 'c-start') {
      if (/hneď/i.test(kedy)) return { holaVeta: 'Vyplácam si|hneď teraz' };
      const m = kedy.match(/^O\s+([^,]+)/i);
      return { vek, jed: 'rokov', predikat: 'rokov budem mať|na začiatku vyplácania',
        vedla: m ? `o ${m[1]}` : '' };
    }
    if (/bez konca|bez časového/i.test(kedy)) return { holaVeta: 'Renta|bez časového obmedzenia' };
    return { vek, jed: 'rokov', predikat: 'rokov budem mať|na konci vyplácania', vedla: '' };
  }

  function posunVek(kluc, cielova) {
    /* Vek nastavujeme cez klávesnicu míľnika, takže výpočet aj všetky
       obmedzenia zostávajú v pôvodnom kóde. */
    const h = document.querySelector(`.handle[data-key="${kluc}"]`);
    if (!h) return;
    const teraz = Number(h.getAttribute('aria-valuenow'));
    if (!Number.isFinite(teraz)) return;
    const smer = cielova > teraz ? 'ArrowRight' : 'ArrowLeft';
    for (let i = 0; i < Math.abs(cielova - teraz); i += 1) {
      h.dispatchEvent(new KeyboardEvent('keydown', { key: smer, bubbles: true }));
    }
  }

  function prestavHlavicku(id) {
    const karta = $(id);
    const v = karta && karta.querySelector('h2 .veta-hlavicky');
    if (!v) return;
    const z = zneniHlavicky(id);
    const podpis = [z.holaVeta || '', z.vek || '', z.jed || '', z.predikat || '', z.vedla || ''].join('|');
    if (v.dataset.podpis === podpis) return;
    v.dataset.podpis = podpis;
    v.textContent = '';
    const kroky = karta.__krokyVeku;

    /* Stavy bez veku („Vyplácam si hneď teraz") nemajú čo krokovať. */
    if (z.holaVeta) {
      if (kroky) { kroky.dole.hidden = true; kroky.hore.hidden = true; }
      v.classList.add('bez-hodnoty');
      v.appendChild(popisVety(z.holaVeta));
      return;
    }
    v.classList.remove('bez-hodnoty');

    {
      const obal = document.createElement('span');
      obal.className = 'krok-ovladac';
      const span = document.createElement('span');
      span.className = 'zive-cislo vek-v-nadpise';
      span.tabIndex = 0;
      span.setAttribute('role', 'button');
      /* Samotné „35" by čítačka prečítala bez akéhokoľvek kontextu. */
      span.setAttribute('aria-label', POPIS_VEKU[id] + ', ' + z.vek + ' ' + z.jed);
      span.title = 'Kliknutím zadáte vek priamo';
      span.textContent = z.vek;
      if (kroky) {
        kroky.dole.hidden = false; kroky.hore.hidden = false;
        obal.appendChild(kroky.dole);
      }
      obal.appendChild(span);
      if (kroky) obal.appendChild(kroky.hore);
      v.appendChild(obal);
      let vedla = null;
      if (z.vedla) {
        vedla = document.createElement('span');
        vedla.className = 'vedlajsi-udaj kus';
        vedla.textContent = z.vedla;
      }
      v.appendChild(popisVety(z.predikat, vedla));
      const otvor = () => {
        if (karta.classList.contains('locked') || span.querySelector('input')) return;
        const pole = document.createElement('input');
        pole.type = 'text';
        pole.inputMode = 'numeric';
        pole.className = 'pole-hodnoty';
        pole.style.width = '3ch';
        pole.setAttribute('aria-label', 'Vek');
        pole.value = z.vek;
        span.textContent = '';
        span.appendChild(pole);
        pole.focus(); pole.select();
        let hotovo = false;
        const zavri = ulozit => {
          if (hotovo) return;
          hotovo = true;
          const n = cislo(pole.value);
          span.textContent = z.vek;
          if (ulozit && n !== null) posunVek(KLUC[id], Math.round(n));
          span.focus();
        };
        pole.addEventListener('keydown', ev => {
          ev.stopPropagation();
          if (ev.key === 'Enter') { ev.preventDefault(); zavri(true); }
          if (ev.key === 'Escape') { ev.preventDefault(); zavri(false); }
        });
        pole.addEventListener('blur', () => zavri(true));
        pole.addEventListener('pointerdown', ev => ev.stopPropagation());
      };
      span.addEventListener('pointerdown', e => e.stopPropagation());
      span.addEventListener('click', e => {
        e.stopPropagation();
        if (e.target === span) otvor();
      });
      span.addEventListener('keydown', e => {
        if (e.target !== span) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otvor(); }
      });
    }
  }

  function pripravHlavicky() {
    Object.keys(VEK).forEach(id => {
      const karta = $(id);
      const h2 = karta && karta.querySelector('h2');
      const riadok = karta && karta.querySelector('.when-row');
      if (!h2 || !riadok) return;
      h2.textContent = '';
      const titulok = document.createElement('span');
      titulok.className = 'titulok';
      titulok.textContent = TITULOK[id];
      h2.appendChild(titulok);
      const v = document.createElement('span');
      v.className = 'veta-hlavicky';
      h2.appendChild(v);
      /* Krokovacie tlačidlá stránky si necháme ako celé prvky aj s ich
         obsluhou — hlavička ich len postaví okolo veku. */
      const stepy = [...riadok.querySelectorAll('button.step')];
      const dole = stepy.find(b => b.dataset.dir === '-1');
      const hore = stepy.find(b => b.dataset.dir === '1');
      if (dole && hore) {
        [dole, hore].forEach(b => { b.classList.add('krok'); b.tabIndex = -1; });
        karta.__krokyVeku = { dole, hore };
      }
      prestavHlavicku(id);
    });
    const obnov = () => Object.keys(VEK).forEach(prestavHlavicku);
    [...Object.values(VEK), ...Object.values(KEDY)].forEach(id => {
      const el = $(id);
      if (!el) return;
      new MutationObserver(obnov).observe(el,
        { childList: true, characterData: true, subtree: true });
    });
  }

  /* ------------------------------------------------------- karta DNES */

  let slotKombinacie = null, zaverDnes = null, uvodVynosu = null, zaverKoncaVeta = null;
  const ZNENIE_VYNOSU = {
    buduje: 'je očakávané zhodnotenie|počas budovania',
    ma: 'je očakávané zhodnotenie|do začiatku vyplácania'
  };

  function kartaDnes() {
    const karta = $('c-today');
    if (!karta) return;

    vetaVolba('tg-sit', 'Majetok', ['budujem', 'už mám']);
    vetaVolba('tg-mode', 'Investujem', ['jednorazovo', 'pravidelne', 'kombináciou']);

    /* Kombinácia je jeden významový blok: jednorazová časť, spôsob mesačnej
       časti a hodnota, ktorú tá voľba nesie. */
    const blok = document.createElement('div');
    blok.className = 'blok-kombinacia';
    const smer = $('combo-direction');
    smer.parentNode.insertBefore(blok, smer);
    blok.appendChild($('sl-combo-wrap'));
    blok.appendChild(smer);
    vetaPole($('sl-combo-wrap'), 'combo-v', 'zainvestujem|jednorazovo');
    const cap = smer.querySelector('.cap');
    if (cap) cap.remove();
    vetaVolba('tg-combo-direction', 'Mesačnú sumu', ['zadám sám', 'chcem dopočítať']);
    slotKombinacie = document.createElement('div');
    slotKombinacie.className = 'nesena-hodnota';
    smer.appendChild(slotKombinacie);
    slotKombinacie.appendChild($('sl-monthly-known-wrap'));
    vetaPole($('sl-monthly-known-wrap'), 'monthly-known-v', 'chcem investovať|mesačne');
    blok.hidden = smer.hidden;

    const majetok = $('c0-v') && $('c0-v').closest('label.sl');
    vetaPole(majetok, 'c0-v', 'mám pripravených|na rentu');
    vetaVolba('tg-goal', 'Chcem vedieť', ['koľko mi vyplatí', 'ako dlho vydrží']);

    /* Predpoklad zhodnotenia: veta na karte, porovnanie a vysvetlenie pod „i". */
    const set = karta.querySelector('.set');
    const predpoklad = set.querySelector('p.assumption-note:not(.assumption-warn)');
    const warn = $('vynos-warn');
    if (warn) { warn.setAttribute('role', 'status'); warn.setAttribute('aria-live', 'polite'); }
    const popisTipov = [...set.querySelectorAll('p.when')]
      .find(p => /Historické/i.test(p.textContent));
    const tipy = $('tg-tipy');
    const note = $('vynos-note');
    const slider = $('sl-vynos');
    const hodnota = $('vynos-v');
    set.textContent = '';
    /* Kto majetok už má, nič nebuduje — veta sa musí prispôsobiť voľbe. */
    uvodVynosu = popisVety(ZNENIE_VYNOSU.buduje);
    const vetaVynosu = veta(hodnota, uvodVynosu);
    set.appendChild(vetaVynosu);
    set.appendChild(slider);

    if (predpoklad) predpoklad.textContent =
      'Je to váš vlastný predpoklad, nie odhad ani odporúčanie.';
    if (tipy && popisTipov) {
      const b = [...tipy.querySelectorAll('button')];
      b.forEach(x => { x.textContent = String(x.dataset.vynos).replace('.', ',') + ' %'; x.remove(); });
      tipy.textContent = 'Na porovnanie, nie ako návrh predpokladu: svetový akciový index MSCI World dosiahol ';
      tipy.append(b[0], ' ročne za 56 rokov a ', b[1], ' za posledných desať.');
      popisTipov.remove();
    }
    /* Podmienky výpočtu (poplatky, inflácia, dane, mesačná báza) píše stránka
       sama a priebežne ich prepočítava — preto ich sem len presunieme pod „i".
       Karta tak nepribrala ani riadok textu a údaj zostáva živý. Pôvodná veta
       „je to váš vlastný predpoklad" tu odpadá: to isté hovorí prvá veta
       presunutého textu a dve výhrady za sebou pôsobia obranne. */
    const podmienky = $('assump-detail');
    infoPri(uvodVynosu, [podmienky, tipy, note], 'Podmienky výpočtu a porovnanie');
    if (predpoklad) predpoklad.remove();

    /* Záver karty. Oba výsledky žijú vo svojich blokoch, ktoré stránka
       prepína — ich viditeľnosť aj umiestnenie preto riadime podľa toho,
       čo práve počíta. */
    zaverDnes = document.createElement('div');
    zaverDnes.className = 'zaver-dnes';
    karta.appendChild(zaverDnes);
    /* Pri okamžitom vyplácaní stoja vedľa seba dve podobné sumy: čo treba mať
       dnes pripravené a aký kapitál je potrebný na začiatku. Líšia sa presne
       o predpokladaný vstupný poplatok — povedzme to rovno. */
    vysvetlenieDnes = document.createElement('p');
    vysvetlenieDnes.className = 'vysvetlenie-rezimu';
    vysvetlenieDnes.hidden = true;
    vysvetlenieDnes.textContent = 'Suma je o predpokladaný vstupný poplatok vyššia '
      + 'než potrebný kapitál uvedený na karte začiatku vyplácania.';
    karta.appendChild(vysvetlenieDnes);
    poznamky(karta, [warn]);
  }

  /* --------------------------------------------- karta ZAČIATOK ČERPANIA */

  let mriezkaZaveru = null, vysvetlenieDnes = null, vysvetlenieRezimu = null;

  function kartaZaciatok() {
    const karta = $('c-start');
    if (!karta) return;

    const nota = $('rent-note');
    if (nota) { nota.textContent = 'v dnešných cenách'; nota.classList.add('kus'); }
    vetaPole($('sl-rent-wrap'), 'rent-v', 'chcem si vyplácať mesačne', nota);

    const sety = karta.querySelectorAll('.set');
    /* Inflácia je zapnutie a vypnutie, nie voľba z dvoch možností. Krokovač
       stojí vedľa štítku, nie v ňom — inak by klik na číslo prepol políčko. */
    const prepinac = sety[0] && sety[0].querySelector('label.sw');
    if (prepinac && sety[0]) {
      const hodnotaInfl = $('infl-v');
      const sliderInfl = $('sl-infl');
      hodnotaInfl.remove();
      /* Prepínač sa prepisuje po častiach — `textContent` na celom štítku by
         zmazal aj zaškrtávacie políčko, a s ním celé ovládanie inflácie. */
      const policko = prepinac.querySelector('input[type=checkbox]');
      prepinac.textContent = '';
      if (policko) prepinac.appendChild(policko);
      /* Štítok prepínača je vetou ako každá iná — má vlastné celky, aby sa
         v úzkom stĺpci zlomil na určenom mieste a nepretiekol z karty. */
      ['je inflácia,', 's ktorou rátam'].forEach((t, i) => {
        if (i) prepinac.appendChild(text(' '));
        const kus = document.createElement('span');
        kus.className = 'kus';
        kus.textContent = t;
        prepinac.appendChild(kus);
      });
      const obalPopisu = document.createElement('span');
      obalPopisu.className = 'popis-vety';
      obalPopisu.appendChild(prepinac);
      const p = veta(hodnotaInfl, obalPopisu);
      /* Ak je hodnota prednastavená, klient má vedieť, odkiaľ je. Vysvetlenie
         je pod „i", aby karta nepribrala riadok textu. */
      /* Text zámerne neobsahuje žiadny údaj, ktorý by sa musel udržiavať:
         cieľ ECB je dlhodobá politika, zvyšok je kvalitatívny. Aktuálna
         miera inflácie by o rok bola nepravdivá a nikto by to nestrážil. */
      const oInflacii = document.createElement('p');
      oInflacii.className = 'assumption-note';
      oInflacii.textContent = 'Predvolené 3 % ročne sú dlhodobý predpoklad, '
        + 'nie predpoveď. Európska centrálna banka sa snaží držať infláciu '
        + 'v eurozóne blízko 2 %; na Slovensku býva dlhodobo o niečo vyššia '
        + 'a v jednotlivých rokoch kolíše výrazne. Hodnotu si preto môžete '
        + 'nastaviť podľa toho, s čím chcete počítať.';
      sety[0].textContent = '';
      sety[0].appendChild(p);
      sety[0].appendChild(sliderInfl);
      /* Až keď veta stojí v karte — panel sa vkladá vedľa nej. */
      infoPri(obalPopisu, [oInflacii], 'Prečo počítame s infláciou 3 %');
    }

    let vysvetlenie = null, warnRenty = null;
    if (sety[1]) {
      vysvetlenie = sety[1].querySelector('p.assumption-note:not(.assumption-warn)');
      warnRenty = $('vynos-rent-warn');
      if (warnRenty) { warnRenty.setAttribute('role', 'status'); warnRenty.setAttribute('aria-live', 'polite'); }
      const sliderRent = $('sl-vynos-rent');
      const hodnotaRent = $('vynos-rent-v');
      sety[1].textContent = '';
      const popis = popisVety('je očakávané zhodnotenie|počas vyplácania');
      const v = veta(hodnotaRent, popis);
      sety[1].appendChild(v);
      sety[1].appendChild(sliderRent);
      if (vysvetlenie) {
        vysvetlenie.textContent =
          'Kým majetok budujete, môžete si dovoliť väčšie výkyvy, pretože trhy majú '
          + 'viac času na zotavenie. Počas vyplácania z majetku pravidelne vyberáte, '
          + 'preto počítame opatrnejšie a portfólio má predovšetkým chrániť kúpnu '
          + 'silu renty.';
        infoPri(popis, [vysvetlenie], 'Prečo sa počas vyplácania počíta opatrnejšie');
      }
    }

    /* Sem patria všetky výsledky, ktoré sa viažu na začiatok vyplácania. */
    mriezkaZaveru = document.createElement('div');
    mriezkaZaveru.className = 'zaver-mriezka';
    karta.appendChild(mriezkaZaveru);
    mriezkaZaveru.appendChild($('out-cap'));
    mriezkaZaveru.appendChild($('out-prva-renta'));
    mriezkaZaveru.appendChild($('out-fut'));
    mriezkaZaveru.appendChild($('have-k').closest('.out'));
    /* Renta bez časového obmedzenia je nižšia, lebo sa vypláca len výnos.
       Bez tejto vety to vyzerá ako chyba výpočtu. */
    vysvetlenieRezimu = document.createElement('p');
    vysvetlenieRezimu.className = 'vysvetlenie-rezimu';
    vysvetlenieRezimu.hidden = true;
    vysvetlenieRezimu.textContent = 'Výpočet počíta so zachovaním kapitálu počas '
      + 'celého modelovaného obdobia.';
    karta.appendChild(vysvetlenieRezimu);
    poznamky(karta, [warnRenty]);
  }

  /* ----------------------------------------------- karta KONIEC ČERPANIA */

  let slotRokov = null, zaverKonca = null, hodnotaRokov = null;

  function kartaKoniec() {
    const karta = $('c-end');
    if (!karta) return;
    const tg = vetaVolba('tg-pension', 'Rentu si chcem vyplácať',
      ['určitý čas', 'bez časového obmedzenia']);

    /* Počet rokov nesie priamo voľba „určitý čas". Nie je to samostatný
       posuvník — mení koncový míľnik, presne ako ťahanie po osi. */
    slotRokov = document.createElement('div');
    slotRokov.className = 'nesena-hodnota';
    tg.parentNode.insertBefore(slotRokov, tg.nextSibling);
    const obal = document.createElement('span');
    obal.className = 'krok-ovladac';
    hodnotaRokov = document.createElement('span');
    hodnotaRokov.className = 'zive-cislo';
    hodnotaRokov.tabIndex = 0;
    hodnotaRokov.setAttribute('role', 'slider');
    hodnotaRokov.setAttribute('aria-label', 'Počet rokov vyplácania renty');
    hodnotaRokov.title = 'Kliknutím zadáte počet rokov';
    const dole = tlacidloKroku('−', 'Skrátiť vyplácanie o rok');
    const hore = tlacidloKroku('+', 'Predĺžiť vyplácanie o rok');
    obal.appendChild(dole); obal.appendChild(hodnotaRokov); obal.appendChild(hore);
    const popisRokov = popisVety('rokov si budem vyplácať|rentu');
    slotRokov.appendChild(veta(obal, popisRokov));

    const roky = () => {
      const s = cislo($('v-start').textContent), e = cislo($('v-end').textContent);
      return (s === null || e === null) ? null : Math.max(0, Math.round(e - s));
    };
    const krokniRok = smer => {
      const h = document.querySelector('.handle[data-key="end"]');
      if (!h || h.dataset.locked === '1') return;
      h.dispatchEvent(new KeyboardEvent('keydown',
        { key: smer > 0 ? 'ArrowRight' : 'ArrowLeft', bubbles: true }));
    };
    [[dole, -1], [hore, 1]].forEach(([b, smer]) => {
      let cakanie = null, opakovanie = null;
      const stop = () => { clearTimeout(cakanie); clearInterval(opakovanie); cakanie = opakovanie = null; };
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        krokniRok(smer);
        cakanie = setTimeout(() => { opakovanie = setInterval(() => krokniRok(smer), 90); }, 480);
      });
      ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(t => b.addEventListener(t, stop));
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
    });
    const otvorRoky = () => {
      if (hodnotaRokov.querySelector('input')) return;
      const teraz = roky();
      if (teraz === null) return;
      const povodne = hodnotaRokov.innerHTML;
      const pole = document.createElement('input');
      pole.type = 'text'; pole.inputMode = 'numeric';
      pole.className = 'pole-hodnoty'; pole.style.width = '3ch';
      pole.setAttribute('aria-label', 'Počet rokov vyplácania renty');
      pole.value = String(teraz);
      hodnotaRokov.textContent = '';
      hodnotaRokov.appendChild(pole);
      pole.focus(); pole.select();
      let hotovo = false;
      const zavri = ulozit => {
        if (hotovo) return;
        hotovo = true;
        const n = cislo(pole.value);
        hodnotaRokov.innerHTML = povodne;
        const zac = cislo($('v-start').textContent);
        if (ulozit && n !== null && zac !== null) posunVek('end', Math.round(zac + n));
        hodnotaRokov.focus();
      };
      pole.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { ev.preventDefault(); zavri(true); }
        if (ev.key === 'Escape') { ev.preventDefault(); zavri(false); }
      });
      pole.addEventListener('blur', () => zavri(true));
      pole.addEventListener('pointerdown', ev => ev.stopPropagation());
    };
    hodnotaRokov.addEventListener('pointerdown', e => e.stopPropagation());
    hodnotaRokov.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (e.target === hodnotaRokov) otvorRoky();
    });
    hodnotaRokov.addEventListener('keydown', e => {
      if (e.target !== hodnotaRokov) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); otvorRoky(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); krokniRok(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); krokniRok(-1); }
    });
    slotRokov.__obnov = () => {
      const r = roky();
      if (r === null || hodnotaRokov.querySelector('input')) return;
      const slovo = r === 1 ? 'rok' : (r >= 2 && r <= 4 ? 'roky' : 'rokov');
      if (hodnotaRokov.textContent !== String(r)) hodnotaRokov.textContent = String(r);
      /* Jednotka je v popise, preto sa musí ohýbať spolu s počtom. */
      const znenie = slovo + ' si budem vyplácať|rentu';
      if (popisRokov.dataset.znenie !== znenie) {
        popisRokov.dataset.znenie = znenie;
        kusyPopisu(popisRokov, znenie);
      }
      hodnotaRokov.setAttribute('aria-valuenow', String(r));
      hodnotaRokov.setAttribute('aria-valuetext', r + ' ' + slovo);
      /* Rozsah rokov je rozsah koncového míľnika prepočítaný od začiatku vyplácania. */
      const h = document.querySelector('.handle[data-key="end"]');
      const zac = cislo($('v-start').textContent);
      if (h && zac !== null) {
        const lo = Number(h.getAttribute('aria-valuemin'));
        const hi = Number(h.getAttribute('aria-valuemax'));
        if (Number.isFinite(lo)) hodnotaRokov.setAttribute('aria-valuemin', String(Math.max(0, lo - zac)));
        if (Number.isFinite(hi)) hodnotaRokov.setAttribute('aria-valuemax', String(Math.max(0, hi - zac)));
      }
    };
    slotRokov.__obnov();

    zaverKonca = $('end-k').closest('.out');
    karta.appendChild(zaverKonca);
    /* Pri zvolenom počte rokov karta inak nemá žiadny záver — len ovládanie. */
    zaverKoncaVeta = document.createElement('p');
    zaverKoncaVeta.className = 'zaver-konca';
    zaverKoncaVeta.textContent = 'Kapitál sa dovtedy vyčerpá.';
    zaverKoncaVeta.hidden = true;
    karta.appendChild(zaverKoncaVeta);
    karta.appendChild($('leg'));
  }

  /* Všetky zadávané aj vypočítané čísla majú jednu veľkosť a jednu farbu —
     zmenšovanie veľkých súm by z hodnôt spravilo dve rôzne triedy údajov.
     Veľká suma sa preto rieši zalomením jednotky, nie zmenou písma; šírku
     stĺpca hodnôt drží v medziach `zarovnajStlpce`. */
  function prisposobHodnotu(el) {
    if (!el) return;
    if (el.style.fontSize) el.style.fontSize = '';
    if (el.style.whiteSpace) el.style.whiteSpace = '';
  }
  function prisposobHodnoty() {
    document.querySelectorAll('.card .out .v').forEach(prisposobHodnotu);
  }

  /* ------------------------------------- výsledok patrí k svojmu míľniku */

  function zosuladenie() {
    const stavba = $('blk-build'), mam = $('blk-have');
    const fundOut = $('fund-out'), fundK = $('fund-k');
    const haveOut = $('have-k').closest('.out'), haveK = $('have-k');
    const smer = $('combo-direction');

    const zosuladit = () => {
      const komboDopocet = !smer.hidden && jeAktivny('tg-combo-direction', 'needed');
      /* Vypočítaná mesačná suma patrí priamo k voľbe, ktorá si ju vyžiadala. */
      const kam = komboDopocet ? slotKombinacie : zaverDnes;
      if (fundOut.parentNode !== kam) kam.appendChild(fundOut);
      /* Dosiahnuteľná renta patrí ku kartám vyplácania, nie k dnešku. */
      const jeRenta = /Dosiahnuteľná renta/i.test(fundK.textContent);
      fundOut.hidden = stavba.hidden || jeRenta;
      /* „Ako dlho vydrží" hovorí o konci vyplácania — na karte Dnes by to bola
         druhá kópia toho istého výsledku. */
      const jeTrvanie = /vydrží/i.test(haveK.textContent);
      haveOut.hidden = mam.hidden || jeTrvanie;

      /* Poznámka o raste renty patrí pod prvú vyplatenú rentu. */
      const nota = $('calculated-rent-note');
      const cielova = [...mriezkaZaveru.children].find(o =>
        o.classList && o.classList.contains('out') && !o.hidden
        && /Prvá vyplatená renta/i.test(o.textContent));
      if (nota && cielova && nota.parentNode !== cielova) cielova.appendChild(nota);
      if (nota && !cielova && nota.parentNode !== mriezkaZaveru) mriezkaZaveru.appendChild(nota);

      /* Blok kombinácie zmizne aj s rámom, keď kombinácia nie je zvolená. */
      const blok = smer.closest('.blok-kombinacia');
      if (blok) blok.hidden = smer.hidden && $('sl-combo-wrap').hidden;
      slotKombinacie.hidden = smer.hidden
        || (!komboDopocet && $('sl-monthly-known-wrap').hidden);

      /* Počet rokov nesie voľba „určitý čas"; pri vyplácaní bez konca aj pri
         odvodenom konci zmizne a hovorí zaň príslušný výsledok. */
      const koniec = $('c-end');
      const dobaVolitelna = !koniec.classList.contains('locked')
        && jeAktivny('tg-pension', 'temporary') && $('tg-pension').style.display !== 'none';
      slotRokov.hidden = !dobaVolitelna;
      if (dobaVolitelna) slotRokov.__obnov();
      const bezObmedzenia = /bez časového/i.test($('end-v').textContent);
      zaverKonca.hidden = dobaVolitelna || bezObmedzenia;
      /* Odvodený koniec vyplácania je konštatovanie, nie zadávaná hodnota. */
      const jeVeta = !dobaVolitelna && !bezObmedzenia;
      zaverKonca.classList.toggle('zaver-veta', jeVeta);
      /* Medzeru medzi popisom a hodnotou musí niesť skutočný znak, nie odsadenie:
         inak čítačka aj kopírovanie textu spoja slová do „vystačído". */
      const medzera = zaverKonca.querySelector('.medzera-vety');
      if (jeVeta && !medzera) {
        const m = document.createElement('span');
        m.className = 'medzera-vety';
        m.textContent = ' ';
        zaverKonca.insertBefore(m, $('end-v'));
      } else if (!jeVeta && medzera) medzera.remove();
      if (uvodVynosu) {
        const chce = jeAktivny('tg-sit', 'have') ? ZNENIE_VYNOSU.ma : ZNENIE_VYNOSU.buduje;
        if (uvodVynosu.dataset.znenie !== chce) {
          uvodVynosu.dataset.znenie = chce;
          kusyPopisu(uvodVynosu, chce);
        }
      }
      if (zaverKoncaVeta) zaverKoncaVeta.hidden = !dobaVolitelna;
      prisposobHodnoty();
      zarovnajStlpce();
      if (vysvetlenieDnes) vysvetlenieDnes.hidden =
        !/Potrebný kapitál dnes/i.test(fundK.textContent) || fundOut.hidden;
      if (vysvetlenieRezimu) vysvetlenieRezimu.hidden = !jeAktivny('tg-pension', 'perpetuity')
        || $('tg-pension').style.display === 'none';
    };

    zosuladit();
    const sleduj = (el, opts) => new MutationObserver(zosuladit).observe(el, opts);
    [stavba, mam, smer, $('sl-monthly-known-wrap'), $('sl-combo-wrap'),
      $('out-fut'), $('out-prva-renta'), $('c-end'), $('tg-pension')]
      .forEach(el => el && sleduj(el, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] }));
    [fundK, haveK, $('end-v'), $('v-start'), $('v-end'), $('cap-k'), $('fut-k')]
      .forEach(el => el && sleduj(el, { childList: true, characterData: true, subtree: true }));
    /* Hodnoty prepisuje stránka priebežne — veľkosť dolaďujeme pri každej zmene
       textu, nielen pri prepnutí režimu. */
    document.querySelectorAll('.card .out .v').forEach(el =>
      new MutationObserver(() => prisposobHodnotu(el))
        .observe(el, { childList: true, characterData: true, subtree: true }));
    addEventListener('resize', () => { prisposobHodnoty(); zarovnajStlpce(); }, { passive: true });
    document.querySelectorAll('.card .out .v, .card .zive-cislo').forEach(el =>
      new MutationObserver(zarovnajStlpce)
        .observe(el, { childList: true, characterData: true, subtree: true }));
    [$('tg-combo-direction'), $('tg-pension'), $('tg-goal')].forEach(tg => tg &&
      tg.querySelectorAll('button').forEach(b => sleduj(b, { attributes: true, attributeFilter: ['class'] })));
  }

  /* --------------------------------------------- stĺpec hodnôt na karte
     Hodnoty majú stáť pod sebou v jednom bloku, nie každá inde. Šírku
     stĺpca určuje najširšia hodnota na karte; popisy potom začínajú všetky
     na tej istej zvislici. */

  function zarovnajStlpce() {
    ['c-today', 'c-start', 'c-end'].forEach(id => {
      const karta = $(id);
      if (!karta) return;
      let max = 0;
      karta.querySelectorAll('.veta > :first-child, .out.vysledok-veta > .v, '
        + '.veta-hlavicky > .krok-ovladac').forEach(el => {
        if (!el.offsetParent) return;
        max = Math.max(max, el.getBoundingClientRect().width);
      });
      /* Ani mimoriadne veľká suma nesmie zožrať celý riadok — od istej
         šírky sa radšej zalomí vo svojom stĺpci. */
      const strop = karta.clientWidth * 0.62;
      if (strop > 0) max = Math.min(max, strop);
      const chce = max ? Math.ceil(max) + 'px' : '';
      if (karta.style.getPropertyValue('--stlpec') !== chce) {
        karta.style.setProperty('--stlpec', chce);
      }
    });
  }

  /* ------------------------------------------------------- rozloženie */

  const prepocitaj = () => dispatchEvent(new Event('resize'));

  /* Vrstva mení obsah kariet až po tom, čo stránka prepočítala ich polohy.
     Namiesto čakania naslepo sledujeme skutočnú zmenu rozmerov karty a až
     vtedy si vypýtame nové rozmiestnenie. Rozmiestnenie mení iba polohu,
     nie veľkosť, takže sa slučka neuzavrie. */
  function sledujRozmery() {
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => prepocitaj());
    ['c-today', 'c-start', 'c-end'].forEach(id => { const el = $(id); if (el) ro.observe(el); });
    document.addEventListener('visibilitychange', prepocitaj);
  }

  /* Spojnica tretej karty mieri v tomto režime na koniec osi. Doteraz tam
     nebolo nič — bod dopĺňame presne na to miesto, kam spojnica smeruje. */
  function koniecBezObmedzenia() {
    const wrap = document.querySelector('.axis-wrap');
    if (!wrap || wrap.querySelector('.koniec-nekonecno')) return;
    const bod = document.createElement('div');
    bod.className = 'koniec-nekonecno';
    bod.innerHTML = '<span aria-hidden="true">∞</span><span class="popis">a ďalej</span>';
    bod.setAttribute('role', 'img');
    bod.setAttribute('aria-label', 'Renta pokračuje bez časového obmedzenia');
    wrap.appendChild(bod);
  }

  function samostatnyViewport() {
    if (window.top !== window.self) return;
    /* Prototyp sa skúša aj na väčšom monitore, než na ktorý mieri. */
    const vynutene = (location.search.match(/[?&]rad=(jeden|dva)/) || [])[1];
    const prepni = () => {
      /* Jeden rad troch kariet potrebuje aspoň 1400 px šírky; keď ich má, je
         to na notebooku lepšia voľba než dva rady nad sebou. */
      /* Tri karty vedľa seba potrebujú ~1100 px; kým ich má, je jeden rad
         zrozumiteľnejší než dva — a chronológia Dnes → Začiatok → Koniec
         zostane zachovaná aj na 1280 × 800. */
      const compact = vynutene ? vynutene === 'jeden'
        : innerWidth >= 1100 && innerHeight < 1100;
      const html = document.documentElement;
      if (html.classList.contains('viewport-compact') === compact) return;
      html.classList.toggle('viewport-compact', compact);
      prepocitaj();
    };
    prepni();
    addEventListener('resize', prepni, { passive: true });
  }

  function start() {
    zjednotKroky();
    pripravHlavicky();
    kartaDnes();
    kartaZaciatok();
    kartaKoniec();
    POLIA.forEach(krokovac);
    /* Záver karty konca vyplácania („Renta vystačí do veku 94 rokov") je už
       vetou sám o sebe, ten sa neprestavuje. */
    [$('fund-out'), $('have-k') && $('have-k').closest('.out'),
      $('out-cap'), $('out-prva-renta'), $('out-fut')].forEach(vysledokAkoVeta);
    koniecBezObmedzenia();
    zosuladenie();
    document.documentElement.classList.add('veta-pripravena');
    samostatnyViewport();
    sledujRozmery();
    prepocitaj();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
