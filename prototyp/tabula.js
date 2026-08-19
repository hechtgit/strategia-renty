/* PROTOTYP — varianta „Odletová tabuľa" (split-flap).

   Vrstva beží nad vrstvou viet a nemení usporiadanie obsahu: každý riadok
   zostáva tam, kde bol, v tom istom poradí a s tým istým znením. Mení sa
   len to, ako sa hodnota správa pri zmene.

   Logika mechanickej tabule, ktorú sem preberáme:
   • hodnota sa neprepíše — preklopí sa, a preklápanie má smer aj trvanie;
   • číslica sa nedostane na svoje miesto skokom, ale prebehne cez tie
     medzi ňou a predchádzajúcou hodnotou (ako bubon klapiek);
   • klapky nespúšťajú naraz: riadok sa rozbehne zľava doprava;
   • pri prepnutí režimu sa nový riadok neobjaví, ale sa „nahodí" z prázdna.

   Text prvku je po celý čas konečná hodnota. Medzistavy vykresľujú
   prekryvné vrstvy cez `::after` z atribútu, takže sa nedostanú ani do
   `textContent`, ani k čítačke — pôvodný kód, ktorý si tie hodnoty číta,
   teda vidí presne to isté ako doteraz. */

(function () {
  'use strict';

  const KROK = 128;          /* trvanie jedného preklopenia (ms) */
  const ODSTUP = 42;         /* posun štartu medzi susednými klapkami (ms) */
  const MAX_KROKOV = 6;      /* dlhší bubon už len zdržuje */
  const CIFRY = '0123456789';

  let piseme = false;        /* vlastné zápisy nesmú spustiť ďalšie kolo */
  const stav = new WeakMap();

  /* --------------------------------------------------------------- zvuk */

  let zvukZapnuty = false, audio = null;
  const klapnutie = () => {
    if (!zvukZapnuty) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      /* Krátky šumový impulz — mechanické cvaknutie, nie tón. */
      const dlzka = Math.floor(audio.sampleRate * 0.012);
      const buf = audio.createBuffer(1, dlzka, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < dlzka; i += 1) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / dlzka, 3);
      }
      const zdroj = audio.createBufferSource();
      zdroj.buffer = buf;
      const hlasitost = audio.createGain();
      hlasitost.gain.value = 0.055;
      zdroj.connect(hlasitost).connect(audio.destination);
      zdroj.start(t);
    } catch (e) { /* zvuk je doplnok, nie podmienka */ }
  };

  function prepinacZvuku() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tabula-zvuk';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span class="bod"></span><span>Zvuk tabule</span>';
    b.addEventListener('click', () => {
      zvukZapnuty = !zvukZapnuty;
      b.setAttribute('aria-pressed', zvukZapnuty ? 'true' : 'false');
      if (zvukZapnuty) klapnutie();
    });
    document.body.appendChild(b);
  }

  /* ------------------------------------------------------------ klapky */

  const vrstva = (trieda, znak) => {
    const s = document.createElement('span');
    s.className = 'vrstva ' + trieda;
    s.setAttribute('aria-hidden', 'true');
    s.dataset.znak = znak;
    return s;
  };

  /* Bubon: z jednej číslice na druhú sa ide cez číslice medzi nimi, inak
     stačí jedno preklopenie. */
  function postupnost(stary, novy) {
    if (stary === novy) return [];
    const a = CIFRY.indexOf(stary), b = CIFRY.indexOf(novy);
    if (a < 0 || b < 0) return [novy];
    const kroky = [];
    let i = a;
    while (i !== b && kroky.length < MAX_KROKOV) {
      i = (i + 1) % 10;
      kroky.push(CIFRY[i]);
    }
    if (kroky[kroky.length - 1] !== novy) kroky.push(novy);
    return kroky;
  }

  function klapka(znak) {
    const cela = document.createElement('span');
    cela.className = 'klapka' + (znak === ' ' ? ' medzera' : '');
    /* Skutočný text prvku — konečná hodnota, viditeľná pod prekryvmi. */
    const text = document.createElement('span');
    text.className = 'znak';
    text.textContent = znak;
    cela.appendChild(vrstva('horna', znak));
    cela.appendChild(vrstva('dolna', znak));
    cela.appendChild(text);
    return cela;
  }

  /* Preklopenie jednej klapky cez zadanú postupnosť znakov. */
  async function preklop(cela, zo, kroky, meskanie) {
    if (!kroky.length) return;
    const kh = vrstva('horna kryt', zo);
    const kd = vrstva('dolna kryt', zo);
    cela.appendChild(kd);
    cela.appendChild(kh);
    if (meskanie) await pauza(meskanie);
    let teraz = zo;
    for (const dalsi of kroky) {
      const klopa = vrstva('horna klopa', teraz);
      cela.appendChild(klopa);
      kh.dataset.znak = dalsi;                    /* horná polovica už ukazuje ďalší znak */
      klapnutie();
      await animuj(klopa, 0, -90, 'cubic-bezier(.36,0,.66,-0.05)');
      klopa.className = 'vrstva dolna klopa';
      klopa.dataset.znak = dalsi;
      kd.dataset.znak = dalsi;                    /* skryté pod padajúcou klapkou */
      await animuj(klopa, 90, 0, 'cubic-bezier(.34,1.05,.64,1)');
      klopa.remove();
      teraz = dalsi;
    }
    kh.remove();
    kd.remove();
  }

  const pauza = ms => new Promise(r => setTimeout(r, ms));

  function animuj(el, zo, na, priebeh) {
    const a = el.animate(
      [{ transform: 'rotateX(' + zo + 'deg)' }, { transform: 'rotateX(' + na + 'deg)' }],
      { duration: KROK / 2, easing: priebeh, fill: 'forwards' });
    return a.finished.catch(() => {});
  }

  /* ------------------------------------------------- hodnota ako tabuľa */

  /* Prvok prestavíme na rad klapiek. Deti, ktoré nie sú textom (napríklad
     „mesačne" v `<small>`), zostávajú nedotknuté a na svojom mieste. */
  function prestav(el, stary, animovat) {
    const novy = el.textContent;
    const kusy = [...el.childNodes];
    const zlomok = document.createDocumentFragment();
    const nove = [];
    kusy.forEach(uzol => {
      if (uzol.nodeType !== 3) { zlomok.appendChild(uzol); return; }
      const rad = document.createElement('span');
      rad.className = 'klapky';
      [...uzol.textContent].forEach(z => {
        const k = klapka(z);
        rad.appendChild(k);
        nove.push({ cela: k, znak: z });
      });
      zlomok.appendChild(rad);
    });
    piseme = true;
    el.textContent = '';
    el.appendChild(zlomok);
    piseme = false;
    stav.set(el, novy);
    if (animovat) rozbehni(el, stary);
  }

  /* Rozbehnutie radu. Zarovnávame odzadu: pri číslach sa mení koniec, nie
     začiatok, takže „1 234 → 11 234" preklopí len to, čo sa naozaj posunulo. */
  function rozbehni(el, stary) {
    const nove = [...el.querySelectorAll('.klapka')].map(k => ({
      cela: k, znak: (k.querySelector('.znak') || {}).textContent || ' '
    }));
    if (!nove.length) return;
    const stareZnaky = [...stary];
    const posun = nove.length - stareZnaky.length;
    const rady = [...el.querySelectorAll('.klapky')];
    rady.forEach(r => r.classList.add('bezi'));
    const behy = nove.map((c, i) => {
      const predtym = stareZnaky[i - posun];
      const zo = predtym === undefined ? ' ' : predtym;
      return preklop(c.cela, zo, postupnost(zo, c.znak), i * ODSTUP);
    });
    Promise.all(behy).then(() => rady.forEach(r => r.classList.remove('bezi')));
  }

  const JE_HODNOTA = el =>
    el.classList.contains('zive-cislo')
    || (el.classList.contains('v') && el.closest('.out'))
    || el.classList.contains('leg-v');

  const viditelnost = new WeakMap();

  function skontroluj(el) {
    if (piseme || !el.isConnected) return;
    if (el.querySelector('input')) return;         /* prebieha presný zápis */
    const novy = el.textContent;
    const stary = stav.get(el);
    const vidno = !!el.offsetParent;
    const predtym = viditelnost.get(el);
    viditelnost.set(el, vidno);
    if (stary === novy && el.querySelector('.klapky')) {
      /* Riadok, ktorý sa práve objavil, sa na tabuli nezjaví hotový —
         nahodí sa z prázdnych klapiek. */
      if (vidno && predtym === false) rozbehni(el, '');
      return;
    }
    prestav(el, stary === undefined ? '' : stary, stary !== undefined && vidno);
  }

  function prehladaj(korene) {
    korene.forEach(k => {
      if (!k || k.nodeType !== 1) return;
      if (JE_HODNOTA(k)) skontroluj(k);
      k.querySelectorAll('.zive-cislo, .out .v, .leg-v').forEach(skontroluj);
    });
  }

  /* -------------------------------------------------------------- štart */

  function start() {
    document.documentElement.classList.add('tabula');
    const karty = ['c-today', 'c-start', 'c-end']
      .map(id => document.getElementById(id)).filter(Boolean);
    prehladaj(karty);

    /* Karta si obsah prestavuje sama (prepnutie režimu, nová hlavička),
       preto sledujeme celý jej podstrom a po každej zmene prejdeme hodnoty.
       Vlastné zápisy sú počas prestavby uzavreté cez `piseme`. */
    let cakaSa = false;
    const po = new MutationObserver(() => {
      if (piseme || cakaSa) return;
      cakaSa = true;
      requestAnimationFrame(() => { cakaSa = false; prehladaj(karty); });
    });
    karty.forEach(k => po.observe(k, { childList: true, characterData: true,
      subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] }));

    prepinacZvuku();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
