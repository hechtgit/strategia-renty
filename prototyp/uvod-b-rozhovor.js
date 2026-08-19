/* VARIANTA B - príbehový vstup, ktorý poskladá prvý plán.

   Nad aplikáciou sa pri prvej návšteve otvorí samostatná ľahká vrstva a
   položí päť (pri hotovom majetku šesť) jednoduchých otázok - vždy jednu na
   obrazovke. Nepýta sa na meno, e-mail ani telefón a nič neodosiela.

   Kľúčové: žiadny druhý výpočet neexistuje. Každá odpoveď sa okamžite
   zapisuje do skutočného modelu aplikácie cez jej vlastné ovládacie prvky -
   míľniky na čiare života a pôvodné posuvníky. Vrstva iba kladie otázky;
   počíta stále tá istá aplikácia, ktorá zostane pod ňou. */

(() => {
  'use strict';

  const KLUC = 'renta-uvod-b-videny';
  const $ = id => document.getElementById(id);
  const QS = new URLSearchParams(location.search);
  const REDUKOVANY = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ============================================ zápis do modelu aplikácie */

  /* Vek sa nastavuje cez klávesnicové ovládanie samotného míľnika. Aplikácia
     si tak sama ustráži svoje hranice (dnes ≤ začiatok < koniec) - vrstva
     žiadnu z nich nepozná a ani ich nesmie obchádzať. */
  const vekTeraz = key => {
    const h = $('h-' + key);
    return h ? Number(h.getAttribute('aria-valuenow')) : null;
  };
  function posunVek(key, ciel) {
    const h = $('h-' + key);
    if (!h || h.dataset.locked === '1' || !Number.isFinite(ciel)) return;
    for (let i = 0; i < 300; i += 1) {
      const teraz = vekTeraz(key);
      if (teraz === ciel) return;
      const smer = ciel > teraz ? 1 : -1;
      const velky = Math.abs(ciel - teraz) >= 5;
      h.dispatchEvent(new KeyboardEvent('keydown', {
        key: smer > 0 ? 'ArrowRight' : 'ArrowLeft',
        shiftKey: velky, bubbles: true, cancelable: true,
      }));
      /* Aplikácia hodnotu orezala - ďalej to nejde a tlačiť nemá zmysel. */
      if (vekTeraz(key) === teraz) return;
    }
  }

  /* Sumové posuvníky bežia na nelineárnej škále, ktorú vlastní stránka.
     Používame presne tú istú, takže hodnoty sadnú na rovnakú mriežku. */
  const skala = id => (window.__SC || {})[id] || null;
  function nastavPosuvnik(id, hodnota) {
    const s = $(id);
    if (!s) return;
    const sc = skala(id);
    const lo = sc ? sc.toVal(+s.min) : +s.min;
    const hi = sc ? sc.toVal(+s.max) : +s.max;
    const v = Math.min(hi, Math.max(lo, hodnota));
    s.value = sc ? sc.toPos(v) : v;
    s.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function zvol(box, attr, hodnota) {
    const b = document.querySelector('#' + box + ' [data-' + attr + '="' + hodnota + '"]');
    if (b && !b.classList.contains('on')) b.click();
  }

  /* ==================================================== škály pre otázky */

  /* Poloha posuvníka vo vrstve je tá istá poloha ako v aplikácii - prevod
     robí škála stránky, nie vlastný prepočet. */
  function skalaPolohy(sliderId) {
    const s = $(sliderId), sc = skala(sliderId);
    if (!s) return null;
    return sc
      ? { min: +s.min, max: +s.max, naHodnotu: p => sc.toVal(p), naPolohu: v => sc.toPos(v) }
      : { min: +s.min, max: +s.max, naHodnotu: p => p, naPolohu: v => v };
  }
  const eur = v => Math.round(v).toLocaleString('sk-SK') + ' €';
  const roky = n => (n === 1 ? '1 rok' : n < 5 ? n + ' roky' : n + ' rokov');

  /* ============================================================ odpovede */

  const O = {
    vek: vekTeraz('now') || 35,
    situacia: 'lump',
    majetok: 600000,
    start: vekTeraz('start') || 55,
    renta: 3000,
    dlzka: 90,
  };

  /* =============================================================== otázky */

  const OTAZKY = {
    vek: {
      id: 'vek',
      nadpis: 'Koľko máte dnes rokov?',
      pod: 'Od tohto bodu sa odvíja celá čiara života.',
      typ: 'posuvnik',
      rozsah: () => ({ min: 18, max: 85, krok: 1 }),
      citaj: () => O.vek,
      cislo: v => v + '<small>rokov</small>',
      vysvetli: () => '',
      krajne: () => ['18', '85'],
      zapis: v => {
        O.vek = v;
        posunVek('now', v);
        if (O.start < v) { O.start = v; }
      },
    },

    situacia: {
      id: 'situacia',
      nadpis: 'Kde ste dnes s majetkom na rentu?',
      pod: 'Podľa toho sa aplikácia ďalej pýta na iné veci.',
      typ: 'volby',
      volby: [
        { kluc: 'lump',    nadpis: 'Mám sumu, ktorú viem investovať naraz',
          popis: 'Jednorazová investícia dnes.' },
        { kluc: 'monthly', nadpis: 'Budem odkladať každý mesiac',
          popis: 'Pravidelná mesačná investícia.' },
        { kluc: 'combo',   nadpis: 'Aj naraz, aj mesačne',
          popis: 'Kombinácia jednorazovej a pravidelnej investície.' },
        { kluc: 'have',    nadpis: 'Majetok už mám pripravený',
          popis: 'Rentu z neho chcem začať čerpať, nie ho ešte budovať.' },
      ],
      citaj: () => O.situacia,
      zapis: v => {
        O.situacia = v;
        if (v === 'have') { zvol('tg-sit', 'sit', 'have'); }
        else { zvol('tg-sit', 'sit', 'build'); zvol('tg-mode', 'mode', v); }
      },
    },

    majetok: {
      id: 'majetok',
      nadpis: 'Koľko máte na rentu pripravené?',
      pod: 'Hodnota majetku, z ktorého má renta vzísť.',
      typ: 'posuvnik',
      rozsah: () => {
        const s = skalaPolohy('sl-c0');
        return { min: s.min, max: s.max, krok: 1, poloha: s };
      },
      citaj: () => O.majetok,
      cislo: v => eur(v),
      vysvetli: () => '',
      krajne: () => ['50 000 €', '30 mil. €'],
      zapis: v => { O.majetok = v; nastavPosuvnik('sl-c0', v); },
    },

    start: {
      id: 'start',
      nadpis: 'Odkedy si chcete rentu vyplácať?',
      pod: 'Vek, v ktorom má prísť prvá výplata.',
      typ: 'posuvnik',
      rozsah: () => ({ min: O.vek, max: 85, krok: 1 }),
      citaj: () => Math.max(O.start, O.vek),
      cislo: v => v + '<small>rokov</small>',
      vysvetli: v => (v <= O.vek ? 'Vyplácam si hneď teraz.'
                                 : 'Na budovanie majetku mám ' + roky(v - O.vek) + '.'),
      krajne: () => [String(O.vek), '85'],
      zapis: v => { O.start = v; posunVek('start', v); },
    },

    renta: {
      id: 'renta',
      nadpis: 'Akú rentu si chcete vyplácať?',
      pod: 'Mesačne, v dnešných cenách - aplikácia si infláciu dopočíta sama.',
      typ: 'posuvnik',
      rozsah: () => {
        const s = skalaPolohy('sl-rent');
        return { min: s.min, max: s.max, krok: 1, poloha: s };
      },
      citaj: () => O.renta,
      cislo: v => eur(v) + '<small>mesačne</small>',
      vysvetli: () => '',
      krajne: () => ['500 €', '50 000 €'],
      zapis: v => { O.renta = v; nastavPosuvnik('sl-rent', v); },
    },

    dlzka: {
      id: 'dlzka',
      nadpis: 'A ako dlho ju chcete poberať?',
      pod: 'Toto je jediné číslo, ktoré sa nedá odhadnúť - preto sa dá kedykoľvek zmeniť.',
      typ: 'volby',
      volby: () => {
        const v = [85, 90, 95].filter(a => a > O.start)
          .map(a => ({ kluc: String(a), nadpis: 'Do veku ' + a + ' rokov',
                       popis: 'Renta beží ' + roky(a - O.start) + '.' }));
        v.push({ kluc: 'navzdy', nadpis: 'Nekonečná renta',
                 popis: 'Vypláca sa len výnos, kapitál zostáva zachovaný.' });
        return v;
      },
      citaj: () => String(O.dlzka),
      zapis: v => {
        O.dlzka = v;
        if (v === 'navzdy') { zvol('tg-pension', 'pension', 'perpetuity'); }
        else {
          zvol('tg-pension', 'pension', 'temporary');
          posunVek('end', Number(v));
        }
      },
    },
  };

  /* Vetvenie sa riadi logikou aplikácie: hodnotu majetku pýtame len vtedy,
     keď ju aplikácia pri tomto scenári naozaj potrebuje. */
  const poradie = () => {
    const z = [OTAZKY.vek, OTAZKY.situacia];
    if (O.situacia === 'have') z.push(OTAZKY.majetok);
    z.push(OTAZKY.start, OTAZKY.renta, OTAZKY.dlzka);
    return z;
  };

  /* ================================================================ stav */

  let vrstva, panel, otvorene = false, krok = -1;

  function postav() {
    vrstva = document.createElement('div');
    vrstva.className = 'pv-vrstva';
    vrstva.hidden = true;
    panel = document.createElement('div');
    panel.className = 'pv-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Poskladajme váš prvý plán');
    panel.tabIndex = -1;
    vrstva.appendChild(panel);
    document.body.appendChild(vrstva);
  }

  function postavPilulku() {
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'pv-znovu';
    p.textContent = 'Poskladať plán nanovo';
    p.addEventListener('click', () => { if (!otvorene) { krok = -1; otvor(); } });
    document.body.appendChild(p);
  }

  /* ============================================================ vykreslenie */

  function hlavicka(cislo, celkom) {
    const h = document.createElement('div');
    h.className = 'pv-postup';
    const t = document.createElement('span');
    t.className = 'pv-postup-text';
    t.textContent = cislo + ' z ' + celkom;
    const pas = document.createElement('div');
    pas.className = 'pv-pas';
    const i = document.createElement('i');
    i.style.width = Math.round(cislo / celkom * 100) + '%';
    pas.appendChild(i);
    h.append(t, pas);
    return h;
  }

  function pata(prvky) {
    const p = document.createElement('div');
    p.className = 'pv-pata';
    prvky.forEach(el => p.appendChild(el));
    return p;
  }

  function tichy(text, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pv-tichy';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function hlavne(text, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pv-hlavne pv-medzera';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }

  function uvod() {
    panel.innerHTML = '';
    const h = document.createElement('h2');
    h.className = 'pv-otazka';
    h.textContent = 'Za minútu spolu poskladáme váš prvý plán.';
    const p = document.createElement('p');
    p.className = 'pv-pod';
    p.textContent = 'Položím vám päť jednoduchých otázok. Nič sa neodosiela a '
      + 'nepýtam sa na meno ani kontakt. Všetky hodnoty budete môcť potom '
      + 'ľubovoľne meniť.';
    panel.append(h, p, pata([
      tichy('Prejsť rovno do aplikácie', odist),
      hlavne('Poďme na to', () => ukaz(0)),
    ]));
    panel.focus();
    const prve = panel.querySelector('.pv-hlavne');
    if (prve) prve.focus();
  }

  function ukaz(i) {
    const zoznam = poradie();
    if (i >= zoznam.length) { dokonci(); return; }
    krok = i;
    const q = zoznam[i];
    panel.innerHTML = '';
    panel.appendChild(hlavicka(i + 1, zoznam.length));

    const h = document.createElement('h2');
    h.className = 'pv-otazka';
    h.textContent = q.nadpis;
    const p = document.createElement('p');
    p.className = 'pv-pod';
    p.textContent = q.pod;
    panel.append(h, p);

    if (q.typ === 'volby') vykresliVolby(q, i, zoznam.length);
    else vykresliPosuvnik(q, i, zoznam.length);
  }

  function vykresliVolby(q, i, celkom) {
    const box = document.createElement('div');
    box.className = 'pv-volby';
    const volby = typeof q.volby === 'function' ? q.volby() : q.volby;
    const teraz = q.citaj();
    volby.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pv-volba' + (v.kluc === teraz ? ' je' : '');
      const t = document.createElement('b');
      t.textContent = v.nadpis;
      const s = document.createElement('small');
      s.textContent = v.popis;
      b.append(t, s);
      b.addEventListener('click', () => {
        box.querySelectorAll('.pv-volba').forEach(x => x.classList.remove('je'));
        b.classList.add('je');
        q.zapis(v.kluc);
        /* Krátka pauza, nech je voľba vidieť skôr, než sa obrazovka zmení. */
        setTimeout(() => { if (otvorene) ukaz(i + 1); }, 260);
      });
      box.appendChild(b);
    });
    panel.append(box, pata(spodok(i)));
    const prve = box.querySelector('.pv-volba.je') || box.querySelector('.pv-volba');
    if (prve) prve.focus();
  }

  function vykresliPosuvnik(q, i, celkom) {
    const r = q.rozsah();
    const cislo = document.createElement('div');
    cislo.className = 'pv-cislo';
    const vysv = document.createElement('p');
    vysv.className = 'pv-vysvetlenie';

    const sl = document.createElement('input');
    sl.type = 'range';
    sl.className = 'pv-posuvnik';
    sl.min = r.min; sl.max = r.max; sl.step = r.krok;
    sl.setAttribute('aria-label', q.nadpis);

    const naHodnotu = p => (r.poloha ? r.poloha.naHodnotu(p) : p);
    const naPolohu = v => (r.poloha ? r.poloha.naPolohu(v) : v);
    sl.value = naPolohu(q.citaj());

    const krajne = document.createElement('div');
    krajne.className = 'pv-krajne';
    const [a, b] = q.krajne();
    krajne.innerHTML = '<span>' + a + '</span><span>' + b + '</span>';

    const prekresli = () => {
      const v = naHodnotu(+sl.value);
      cislo.innerHTML = q.cislo(v);
      vysv.textContent = q.vysvetli(v);
      sl.setAttribute('aria-valuetext', cislo.textContent);
    };
    /* Odpoveď ide do modelu okamžite - pod vrstvou sa scenár prepočítava
       priebežne, nečaká sa na potvrdenie. */
    sl.addEventListener('input', () => { prekresli(); q.zapis(naHodnotu(+sl.value)); });
    prekresli();
    q.zapis(naHodnotu(+sl.value));

    panel.append(cislo, vysv, sl, krajne, pata(spodok(i)));
    sl.focus();
  }

  function spodok(i) {
    const p = [];
    if (i > 0) p.push(tichy('Späť', () => ukaz(i - 1)));
    p.push(tichy('Prejsť rovno do aplikácie', odist));
    const zoznam = poradie();
    const q = zoznam[i];
    if (q && q.typ !== 'volby')
      p.push(hlavne(i + 1 >= zoznam.length ? 'Zobraziť môj plán' : 'Pokračovať',
                    () => ukaz(i + 1)));
    return p;
  }

  /* ============================================================== otvorenie */

  function naKlaves(e) {
    if (!otvorene) return;
    if (e.key === 'Escape') { e.preventDefault(); odist(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button,input,[href],select,textarea')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const prvy = f[0], posledny = f[f.length - 1];
    if (e.shiftKey && document.activeElement === prvy) { e.preventDefault(); posledny.focus(); }
    else if (!e.shiftKey && document.activeElement === posledny) { e.preventDefault(); prvy.focus(); }
  }

  function otvor() {
    if (otvorene) return;
    otvorene = true;
    vrstva.hidden = false;
    document.querySelector('main')?.setAttribute('aria-hidden', 'true');
    addEventListener('keydown', naKlaves);
    /* Vrstva je viditeľná sama osebe; prelnutie je len ozdoba navrchu. Keby
       viditeľnosť závisela od prechodu, stačilo by jedno neprehraté prelnutie
       a klient by hľadel na prázdnu tmavú plochu bez otázok. */
    if (!REDUKOVANY && vrstva.animate)
      vrstva.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    if (krok < 0) uvod(); else ukaz(krok);
  }

  function zavri() {
    if (!otvorene) return;
    otvorene = false;
    removeEventListener('keydown', naKlaves);
    document.querySelector('main')?.removeAttribute('aria-hidden');
    if (!REDUKOVANY && vrstva.animate)
      vrstva.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'forwards' });
    setTimeout(() => { vrstva.hidden = true; }, 470);
    try { localStorage.setItem(KLUC, '1'); } catch (e) {}
  }

  /* Odchod uprostred nie je zahodenie: čo klient stihol odpovedať, už v modeli
     je, a aplikácia zostane presne v tom stave. */
  function odist() { zavri(); }

  function dokonci() {
    zavri();
    setTimeout(hotovo, 560);
  }

  function hotovo() {
    /* Kto v rozhovore vyberie samé predvolené odpovede, nezmení ani jeden
       vstup - pás by mu zostal skrytý, hoci si plán prešiel celý. */
    if (window.odomkniPas) window.odomkniPas();
    const t = document.createElement('div');
    t.className = 'pv-hotovo';
    t.setAttribute('role', 'status');
    const s = document.createElement('span');
    s.innerHTML = '<strong>Toto je váš prvý plán.</strong> '
      + 'Ktorúkoľvek hodnotu teraz zmeňte - míľniky na čiare sa dajú ťahať '
      + 'a každá zmena sa prepočíta hneď.';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'pv-zavri';
    x.setAttribute('aria-label', 'Zavrieť');
    x.textContent = '×';
    const prec = () => {
      if (!REDUKOVANY && t.animate)
        t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
      setTimeout(() => t.remove(), 420);
    };
    x.addEventListener('click', prec);
    t.append(s, x);
    document.body.appendChild(t);
    if (!REDUKOVANY && t.animate) t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    setTimeout(() => { if (t.isConnected) prec(); }, 11000);
  }

  /* ============================================================== spustenie */

  function pripoj() {
    postav();
    postavPilulku();
    if (QS.has('bez-uvodu')) return;
    let videne = false;
    try { videne = localStorage.getItem(KLUC) === '1'; } catch (e) {}
    if (videne && !QS.has('uvod')) return;
    setTimeout(otvor, 350);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', pripoj);
  else pripoj();
})();
