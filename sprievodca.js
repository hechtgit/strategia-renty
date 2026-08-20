/* VARIANTA A - interaktívne zaškolenie v aplikácii.

   Aplikácia aj Čiara života sú viditeľné od prvej sekundy. Sprievodca nič
   neprekrýva natrvalo a nič neblokuje: okolie sa stlmí, jeden skutočný
   ovládací prvok zostane v plnom jase.

   Prejde sa KAŽDÝ vstup, ktorý je pri danom scenári naozaj dostupný -
   vrátane zhodnotenia, inflácie a zhodnotenia počas vyplácania. Práve tie sú
   najmenej objaviteľné a klient by o nich inak nevedel. Zoznam krokov sa
   preto neurčuje dopredu, ale počíta sa nanovo po každej odpovedi: keď si
   klient zvolí kombináciu, kroky pribudnú; keď zvolí rentu bez časového
   obmedzenia, vek konca sa vynechá, lebo ho aplikácia zamkne.

   Otázky vykajú - sprievodca sa prihovára klientovi, rovnako ako vysvetlivky
   na stránke („Je to váš predpoklad"). Popisy v kartách zostávajú v prvej
   osobe („Mám 35 rokov"), lebo tam hovorí klient sám o sebe.

   Ďalej sa ide dvoma rovnocennými cestami: skutočnou zmenou zvýraznenej
   hodnoty (vtedy automaticky), alebo tlačidlom „Potvrdiť". Pri desiatich
   krokoch nemožno trvať len na zmene - klient by musel pohnúť infláciou z
   troch percent iba preto, aby sa dostal ďalej, a pokazil by si tým plán.
   Potvrdenie nie je únik: klient hodnotu videl a vedome ju necháva platiť.

   Vrstva nepočíta nič vlastné a do modelu nezapisuje - hodnoty mení sám
   klient cez pôvodné prvky aplikácie. Sprievodca ich len číta. */

(() => {
  'use strict';

  const KLUC = 'renta-uvod-a-videny';
  const $ = id => document.getElementById(id);
  const QS = new URLSearchParams(location.search);
  const REDUKOVANY = matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ------------------------------------------------------------- pomôcky */

  const vidno = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  };
  /* Prvý cieľ, ktorý je na tejto šírke naozaj vidieť. Na mobile sú míľniky
     na čiare skryté a vek sa mení dvojicou tlačidiel v karte - sprievodca
     preto ukáže tú. */
  const prvyViditelny = (...vyber) => {
    for (const najdi of vyber) {
      const el = najdi();
      if (vidno(el)) return el;
    }
    return null;
  };
  const vek = id => { const h = $(id); return h ? h.getAttribute('aria-valuenow') : null; };
  const zvolene = (box, attr) => {
    const b = document.querySelector('#' + box + ' button.on');
    return b ? b.dataset[attr] : null;
  };
  const poloha = id => { const s = $(id); return s ? s.value : null; };
  /* Predpoklady bývajú v samostatnom bloku .set aj s vysvetlením pod „i" -
     zvýrazniť treba celý blok, nie holý posuvník. */
  const blok = id => { const e = $(id); return e ? e.closest('.set') : null; };

  /* --------------------------------------------------------------- kroky */

  const KROKY = [
    {
      /* Úvod nie je modálne okno cez celú obrazovku - tým by sa varianta A
         zmenila na variantu B a zanikol by práve ten rozdiel, ktorý sa
         porovnáva. Je to ten istý pokyn v tej istej bubline, len zakotvený na
         celú čiaru života: klient hneď vidí hlavný objekt, o ktorom to je.

         Nedá sa splniť zmenou hodnoty, preto sa z neho ide výhradne
         tlačidlom - `hodnota` je zámerne nemenná. */
      id: 'uvod',
      uvodny: true,
      nadpis: 'Váš plán privátnej renty',
      /* Nadpis pomenúva, čo to je; popis hovorí, čo sa bude diať a ako dlho.
         Čas patrí sem, nie do nadpisu - tam by z neho bol sľub rýchlosti,
         ale vypustiť sa nesmie, lebo kvôli nemu úvod vznikol. */
      popis: () => 'Za necelé dve minúty uvidíte všetkých ' + pocetKrokov()
           + ' miest, kde si plán viete nastaviť - od dnešného veku po poslednú '
           + 'vyplatenú rentu. Meniť nemusíte nič, stačí potvrdiť. Späť aj koniec '
           + 'máte po ruke stále.',
      ciel: () => document.querySelector('.axis-wrap'),
      hodnota: () => 'uvod',
    },
    {
      id: 'vek',
      nadpis: 'Koľko máte dnes rokov?',
      /* Dvojica − a + pri veku je na desktope skrytá (existuje len pre dotykový
         displej), takže sa na ňu v tomto kroku nedá odkázať. Pri hodnotách
         v kartách však viditeľná je - preto „neskôr". */
      popis: 'Chyťte značku a potiahnite ju po čiare života, alebo použite šípky '
           + 'na klávesnici. Tlačidlá − a + nájdete neskôr pri hodnotách v kartách.',
      ciel: () => prvyViditelny(() => $('n-now'),
                                () => document.querySelector('#c-today .when-row')),
      hodnota: () => vek('h-now'),
    },
    {
      id: 'situacia',
      nadpis: 'Majetok budujete, alebo ho už máte?',
      popis: 'Podľa tejto voľby sa mení niekoľko ďalších otázok aj to, čo vám '
           + 'aplikácia nakoniec vypočíta.',
      ciel: () => $('tg-sit'),
      hodnota: () => zvolene('tg-sit', 'sit'),
      klikNa: () => $('tg-sit'),
    },
    {
      id: 'sposob',
      ked: () => zvolene('tg-sit', 'sit') === 'build',
      nadpis: 'Ako chcete investovať?',
      popis: 'Jednorazovo, pravidelne každý mesiac, alebo kombináciou oboch.',
      ciel: () => $('tg-mode'),
      hodnota: () => zvolene('tg-mode', 'mode'),
      klikNa: () => $('tg-mode'),
    },
    {
      id: 'combo-naraz',
      ked: () => vidno($('sl-combo-wrap')),
      nadpis: 'Koľko investujete jednorazovo?',
      popis: 'Suma, ktorú vložíte hneď. Zvyšok doplní pravidelná investícia.',
      ciel: () => $('sl-combo-wrap'),
      hodnota: () => poloha('sl-combo'),
    },
    {
      id: 'combo-smer',
      ked: () => vidno($('combo-direction')),
      nadpis: 'Pravidelnú investíciu zadáte, alebo ju má dopočítať aplikácia?',
      popis: 'Buď poviete, koľko mesačne investujete, alebo necháte aplikáciu '
           + 'spočítať, koľko by ste investovať mali.',
      ciel: () => $('combo-direction'),
      hodnota: () => zvolene('tg-combo-direction', 'comboDir'),
      klikNa: () => $('tg-combo-direction'),
    },
    {
      id: 'combo-mesacne',
      ked: () => vidno($('sl-monthly-known-wrap')),
      nadpis: 'Koľko investujete mesačne?',
      popis: 'Suma, ktorú investujete každý mesiac až do začiatku vyplácania.',
      ciel: () => $('sl-monthly-known-wrap'),
      hodnota: () => poloha('sl-monthly-known'),
    },
    {
      id: 'majetok',
      ked: () => zvolene('tg-sit', 'sit') === 'have',
      nadpis: 'Aký máte majetok na rentu?',
      popis: 'Hodnota majetku, z ktorého má renta vzísť.',
      ciel: () => document.querySelector('#blk-have label.sl'),
      hodnota: () => poloha('sl-c0'),
    },
    {
      id: 'ciel-vypoctu',
      ked: () => zvolene('tg-sit', 'sit') === 'have',
      nadpis: 'Koľko vám vyplatí, alebo ako dlho vydrží?',
      popis: 'Buď si necháte spočítať rentu z majetku, ktorý máte, alebo koľko '
           + 'rokov vydrží renta, ktorú si poviete sami.',
      ciel: () => $('tg-goal'),
      hodnota: () => zvolene('tg-goal', 'goal'),
      klikNa: () => $('tg-goal'),
    },
    {
      id: 'zhodnotenie',
      nadpis: 'S akým zhodnotením chcete počítať?',
      /* Predpoklad výnosu do historického testu nevstupuje - test beží na
         skutočných výnosoch MSCI World. Určuje len to, koľko treba investovať
         - zámerne nie „odkladať“, predvolený režim je jednorazový vklad.
         Krok preto hovorí o sume na obrazovke, nie o teste, ktorý klient
         uvidí až dole pod kalkulačkou - dovtedy by to bol odkaz naprázdno.
         Neodkazujeme ani na historické tlačidlá: sú schované v paneli za „i“
         a je na nich iba „8,3 %“, takže odkaz mieril na niečo neviditeľné.
         Kto majetok už má, nič neodkladá; jemu sa mení výsledok, nie vklad.
         Ten výsledok môže byť renta aj dĺžka vyplácania, podľa toho, na čo
         sa pýtal - preto zámerne „priaznivejší výsledok", nie „vyššia renta". */
      popis: () => zvolene('tg-sit', 'sit') === 'have'
        ? 'Podľa tohto čísla vypočítame, ako váš majetok narastie do začiatku '
          + 'vyplácania. Čím vyššie ho nastavíte, tým priaznivejší výsledok vám '
          + 'plán ukáže, ale tým viac závisí od toho, či trh taký výnos naozaj '
          + 'prinesie. Predvolených 5 % je konzervatívnejší odhad. '
          + 'Napríklad svetový akciový index priniesol za 56 rokov v priemere '
          + 'ročne 8,3 % a 11,3 % za posledných desať rokov.'
        : 'Čím vyššie zhodnotenie nastavíte, tým menej budete musieť '
          + 'investovať, ale tým viac plán závisí od toho, či trh taký výnos '
          + 'naozaj prinesie. Predvolených 5 % je konzervatívnejší odhad. '
          + 'Napríklad svetový akciový index priniesol za 56 rokov v priemere '
          + 'ročne 8,3 % a 11,3 % za posledných desať rokov.',
      ciel: () => blok('sl-vynos'),
      hodnota: () => poloha('sl-vynos'),
      /* Historické čísla pod „i" sa dajú kliknúť, ale kým hodnotu nezmenia,
         krok sa neposúva - klient si ich chcel len pozrieť. */
    },
    {
      id: 'zaciatok',
      nadpis: 'Kedy chcete začať s vyplácaním?',
      /* Kto majetok už má, nič neodkladá - „koľko vás to stojí" by mu
         nesedelo. Jemu sa posunom mení výsledok, nie náklad. */
      popis: () => zvolene('tg-sit', 'sit') === 'have'
        ? 'Posuňte druhý míľnik. Uvidíte hneď, ako sa tým mení výsledok.'
        : 'Posuňte druhý míľnik. Uvidíte hneď, koľko vás taký začiatok stojí.',
      ciel: () => prvyViditelny(() => $('n-start'),
                                () => document.querySelector('#c-start .when-row')),
      hodnota: () => vek('h-start'),
    },
    {
      id: 'renta',
      ked: () => vidno($('sl-rent-wrap')),
      nadpis: 'Koľko chcete vyplácať mesačne?',
      popis: 'V dnešných cenách - infláciu si aplikácia dopočíta sama.',
      ciel: () => $('sl-rent-wrap'),
      hodnota: () => poloha('sl-rent'),
    },
    {
      id: 'inflacia',
      nadpis: 'Rátate s ročnou infláciou?',
      popis: 'Prepínač ju vypne alebo zapne, posuvník mení jej výšku. Práve ona '
           + 'rozhoduje, čo vaša renta reálne kúpi v čase, keď ju začnete čerpať.',
      ciel: () => blok('in-inflon'),
      hodnota: () => ($('in-inflon') ? $('in-inflon').checked : '') + '|' + poloha('sl-infl'),
    },
    {
      id: 'zhodnotenie-renta',
      nadpis: 'Aké ročné zhodnotenie očakávate počas vyplácania?',
      popis: 'Kým majetok budujete, môžete si dovoliť výkyvy. Keď z neho žijete, '
           + 'čas na čakanie nemáte - preto sa tu počíta opatrnejšie.',
      ciel: () => blok('sl-vynos-rent'),
      hodnota: () => poloha('sl-vynos-rent'),
    },
    {
      id: 'dlzka',
      /* Pri hotovom majetku a otázke „ako dlho vydrží" aplikácia prepínač
         skryje - dĺžku si vtedy dopočítava sama. */
      ked: () => vidno($('tg-pension')),
      nadpis: 'Chcete rentu na určitý čas, alebo nekonečnú?',
      popis: 'Pri rente bez časového obmedzenia sa vypláca len výnos, takže '
           + 'majetok by mal zostať zachovaný. Predpokladá to, že sa zvolené '
           + 'zhodnotenie naozaj dostaví.',
      ciel: () => $('tg-pension'),
      hodnota: () => zvolene('tg-pension', 'pension'),
      klikNa: () => $('tg-pension'),
    },
    {
      id: 'koniec',
      /* Pri nekonečnej rente a v odvodených scenároch aplikácia míľnik zamkne -
         nemá zmysel pýtať sa na vek, ktorý sa nedá nastaviť. Kontroluje sa
         samotný zámok, nie len prepínač: zamknúť ho vie viac stavov. */
      ked: () => {
        const h = document.querySelector('.handle[data-key="end"]');
        return !!h && h.dataset.locked !== '1'
          && zvolene('tg-pension', 'pension') !== 'perpetuity';
      },
      nadpis: 'V akom veku má vyplácanie skončiť?',
      popis: 'Posledný míľnik. Presný vek sa vopred vedieť nedá - preto sa dá '
           + 'kedykoľvek zmeniť a plán sa okamžite prepočíta.',
      ciel: () => prvyViditelny(() => $('n-end'),
                                () => document.querySelector('#c-end .when-row')),
      hodnota: () => vek('h-end'),
    },
  ];

  /* Zoznam sa počíta nanovo pri každom kroku - vetvenie sa mení podľa toho,
     čo klient práve odpovedal. */
  const zoznam = () => KROKY.filter(k => !k.ked || k.ked());
  /* Úvod sa nečísluje - „Krok 1 z 11" by klientovi sľuboval o jedno
     nastavenie viac, než ich naozaj je. */
  const kroky = () => zoznam().filter(k => !k.uvodny);
  const pocetKrokov = () => kroky().length;

  /* ---------------------------------------------------------------- stav */

  let bezi = false, aktualny = null, snimka = null, cielEl = null;
  let smycka = 0, cakanie = 0;
  /* História drží len kroky, ktoré sa naozaj zobrazili - preskočené (mimo
     vetvenia alebo neviditeľné) do nej nepatria, inak by sa klient tlačidlom
     Späť vracal na prázdno. */
  const historia = [];
  /* Kroky v poradí, v akom ich klient naozaj videl. Slúžia na dve veci: hľadá
     sa podľa nich ďalší nezobrazený krok a číslujú sa podľa nich aj kroky.
     Číslovať podľa poradia v zozname sa nedá - po prepnutí vetvy pribudnú
     otázky vyššie v zozname a počítadlo by skočilo dozadu (5 → 3 → 4). */
  const videne = [];
  /* Kroky, z ktorých sa klient vrátil tlačidlom Späť. Tlačidlo Potvrdiť ho na
     ne vráti naspäť, presne ako tlačidlo dopredu v prehliadači. */
  const dopredu = [];
  let vrstva, tien, prstenec, bublina, elNadpis, elPopis, elPocitadlo, elPas, tlSpat, tlDalej;
  let pilulka = null;
  const obnovPilulku = () => {
    if (!pilulka) return;
    pilulka.textContent = bezi ? 'Ukončiť sprievodcu' : 'Sprievodca';
  };

  /* ------------------------------------------------------------- stavba */

  function postav() {
    vrstva = document.createElement('div');
    vrstva.className = 'za-vrstva';
    vrstva.hidden = true;

    tien = document.createElement('div');
    tien.className = 'za-tien';
    prstenec = document.createElement('div');
    prstenec.className = 'za-prstenec';

    bublina = document.createElement('div');
    bublina.className = 'za-bublina';
    bublina.setAttribute('role', 'dialog');
    bublina.setAttribute('aria-live', 'polite');
    bublina.setAttribute('aria-label', 'Krátke zaškolenie');

    elPocitadlo = document.createElement('span');
    elPocitadlo.className = 'za-pocitadlo';
    elNadpis = document.createElement('h2');
    elNadpis.className = 'za-nadpis';
    elPopis = document.createElement('p');
    elPopis.className = 'za-popis';

    elPas = document.createElement('div');
    elPas.className = 'za-pas';
    elPas.appendChild(document.createElement('i'));

    const pata = document.createElement('div');
    pata.className = 'za-pata';

    tlSpat = document.createElement('button');
    tlSpat.type = 'button';
    tlSpat.className = 'za-koniec';
    tlSpat.textContent = 'Späť';
    tlSpat.addEventListener('click', spat);

    const ukoncit = document.createElement('button');
    ukoncit.type = 'button';
    ukoncit.className = 'za-koniec';
    ukoncit.textContent = 'Ukončiť sprievodcu';
    ukoncit.addEventListener('click', () => koniec(false));

    tlDalej = document.createElement('button');
    tlDalej.type = 'button';
    tlDalej.className = 'za-dalej';
    tlDalej.textContent = 'Potvrdiť';
    tlDalej.addEventListener('click', () => { if (bezi) { clearTimeout(cakanie); cakanie = 0; dalej(); } });

    pata.append(tlSpat, ukoncit, tlDalej);
    bublina.append(elPocitadlo, elPas, elNadpis, elPopis, pata);
    vrstva.append(tien, prstenec, bublina);
    document.body.appendChild(vrstva);
  }

  function postavPilulku() {
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'za-znovu';
    p.textContent = 'Sprievodca';
    p.addEventListener('click', () => (bezi ? koniec(false) : start()));
    document.body.appendChild(p);
    /* Tá istá pilulka sprievodcu spúšťa aj ukončuje - musí to povedať, inak
       klient nevie, čo klik urobí. */
    pilulka = p;
    obnovPilulku();
    sledujOknoRodica();
  }

  /* Vo vloženom ráme sa position:fixed neviaže na obrazovku klienta, ale na
     rám - a ten je vysoký 1700 px a zamknutý na 0,0. Pilulka preto skončila
     na y≈1684, teda až pod koncom aplikácie: klient ju uvidel jedine vtedy,
     keď doscroloval úplne dole. Rám nemá ako zistiť, kam sa rodič posunul
     (iná doména), takže mu to rodič sám posiela - rovnaký kanál ako
     ph-renta-scroll, len opačným smerom. Kým prvá správa nepríde (priame
     otvorenie aplikácie, staršia stránka bez odosielateľa), zostáva pôvodné
     fixed umiestnenie - tam funguje správne. */
  /* Jediné miesto, kde sa počúva rodičovo okno. Odoberateľov je viac -
     pilulka sa podľa neho umiestňuje a sprievodca podľa neho vie, kedy je
     aplikácia naozaj pred návštevníkom - a musia dostávať tú istú hodnotu. */
  const odberatelia = [];
  let oknoRodica = null;
  let kanalOtvoreny = false;

  function naOknoRodica(fn) {
    odberatelia.push(fn);
    if (oknoRodica) fn(oknoRodica.top, oknoRodica.height);
    if (kanalOtvoreny || window.parent === window) return;
    kanalOtvoreny = true;
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || d.type !== 'ph-renta-viewport') return;
      if (typeof d.top !== 'number' || typeof d.height !== 'number') return;
      oknoRodica = { top: d.top, height: d.height };
      document.documentElement.classList.add('za-ram');
      odberatelia.forEach(f => f(d.top, d.height));
    });
    /* Rodič posiela pri scrolle a pri zmene veľkosti. Rám sa však načíta až
       keď k nemu návštevník doscrolluje, takže posledný scroll býva už za
       nami a ďalší nemusí prísť - polohu si preto vypýtame sami. */
    window.parent.postMessage({ type: 'ph-renta-viewport-prosim' }, '*');
  }

  function sledujOknoRodica() {
    naOknoRodica((top, height) => {
      if (!pilulka) return;
      const okraj = 16;
      const spodok = top + height - okraj - pilulka.offsetHeight;
      const strop = okraj;
      const dno = document.documentElement.scrollHeight - okraj - pilulka.offsetHeight;
      pilulka.style.top = Math.round(Math.max(strop, Math.min(spodok, dno))) + 'px';
    });
  }

  /* ---------------------------------------------------------- umiestnenie */

  /* Zapisuje sa len vtedy, keď sa geometria naozaj zmenila - inak by sa pri
     zápise v každom snímku zbytočne prepisovali štýly celej bubliny. */
  let posledna = '';

  function umiestni() {
    if (!cielEl) return;
    const r0 = cielEl.getBoundingClientRect();
    if (r0.width < 1 && r0.height < 1) return;

    const o = 9;
    const t = Math.round(r0.top - o), l = Math.round(r0.left - o);
    const w = Math.round(r0.width + o * 2), h = Math.round(r0.height + o * 2);

    const bh = bublina.offsetHeight, bw = bublina.offsetWidth;
    const vh = innerHeight, vw = innerWidth, medzera = 16;

    /* Keď zvýraznený prvok leží v karte, bublina ide VEDĽA karty, nie nad ňu
       alebo pod ňu. Inak prekryje práve tie výsledky, ktoré sa daným ovládačom
       menia, a klient nevidí, čo spôsobil. */
    /* Míľnik na osi nie je v karte, takže by bublina padla „hore" - rovno na
       kartu, ktorej hodnotu klient práve nastavuje (namerané až 82 % prekrytia
       poslednej karty). Míľnik sa preto mapuje na svoju kartu a bublina ide
       vedľa nej rovnako ako pri ovládačoch vnútri karty. */
    const KARTA_MILNIKA = { 'n-now': 'c-today', 'n-start': 'c-start', 'n-end': 'c-end' };
    const uzol = cielEl.closest ? cielEl.closest('.node') : null;
    const karta = (cielEl.closest ? cielEl.closest('.card') : null)
      || (uzol && KARTA_MILNIKA[uzol.id] ? $(KARTA_MILNIKA[uzol.id]) : null);
    let bx, by, dole = false, bok = false;
    if (karta) {
      const kr = karta.getBoundingClientRect();
      const vpravo = kr.right + medzera + bw <= vw - 8;
      const vlavo = kr.left - medzera - bw >= 8;
      if (vpravo || vlavo) {
        bok = true;
        bx = Math.round(vpravo ? kr.right + medzera : kr.left - medzera - bw);
        by = Math.round(r0.top + r0.height / 2 - bh / 2);

        /* Karty stoja tesne vedľa seba, takže bublina po strane sadne na
           susednú - a práve tam sa často číta dôsledok práve menenej hodnoty.
           Karty sú však zarovnané spodnou hranou, takže nad tou nižšou býva
           voľná plocha. Ak sa tam bublina zmestí, ide radšej ta. */
        const sused = document.elementsFromPoint
          ? [...document.querySelectorAll('.card')].find(c => {
              if (c === karta) return false;
              const s = c.getBoundingClientRect();
              return !(s.right < bx || s.left > bx + bw);
            })
          : null;
        if (sused) {
          const sr = sused.getBoundingClientRect();
          const prekryva = !(by + bh < sr.top || by > sr.bottom);
          const nadNim = Math.round(sr.top - medzera - bh);
          if (prekryva && nadNim >= 8) by = nadNim;
        }
      }
    }
    if (!bok) {
      dole = t + h + medzera + bh <= vh - 8;
      /* Bublina sa musí zmestiť do okna aj vtedy, keď je cieľ pod jeho okrajom
         (vysoká karta odtlačí os nadol). */
      by = dole ? t + h + medzera : t - medzera - bh;
      bx = Math.round(r0.left + r0.width / 2 - bw / 2);
    }
    by = Math.max(8, Math.min(by, vh - bh - 8));
    bx = Math.max(12, Math.min(bx, vw - bw - 12));
    const sipka = Math.round(Math.max(16, Math.min(r0.left + r0.width / 2 - bx, bw - 16)));


    const podpis = [t, l, w, h, by, bx, dole, bok, sipka].join(':');
    if (podpis === posledna) return;
    posledna = podpis;

    for (const el of [tien, prstenec]) {
      el.style.top = t + 'px'; el.style.left = l + 'px';
      el.style.width = w + 'px'; el.style.height = h + 'px';
    }
    bublina.style.top = by + 'px';
    bublina.style.left = bx + 'px';
    bublina.dataset.smer = bok ? 'bok' : (dole ? 'dole' : 'hore');
    bublina.style.setProperty('--sipka', sipka + 'px');
  }

  /* -------------------------------------------------------------- priebeh */

  function ukaz(id, hlbka, spatny) {
    const z = zoznam();
    const k = z.find(x => x.id === id);
    /* Krok vypadol z vetvenia alebo jeho prvok nie je vidieť - ideme na ďalší.
       Hĺbka chráni pred zacyklením, keby nebolo vidieť vôbec nič. */
    if (!k) { poDalsom(id, hlbka, spatny); return; }
    cielEl = k.ciel();
    /* Nestačí, že prvok v dokumente existuje - musí byť aj vidieť. Inak by
       sprievodca položil otázku na ovládač, ktorý aplikácia v danom scenári
       skryla, a prstenec by zostal svietiť na predchádzajúcom kroku. */
    if (!vidno(cielEl)) { poDalsom(id, hlbka, spatny); return; }

    if (!spatny && aktualny && aktualny !== id) historia.push(aktualny);
    aktualny = id;
    if (!videne.includes(id)) videne.push(id);
    snimka = k.hodnota();
    const zive = zoznam();
    /* Kroky, ktoré z vetvy vypadli, sa už nerátajú - inak sľúbených desať
       narastie na konci na jedenásť. */
    const rad = videne.filter(x => x !== 'uvod' && zive.some(k => k.id === x));
    const cele = Math.max(kroky().length, rad.length);
    const poradie = rad.indexOf(k.id) + 1;
    /* Štítok nad nadpisom pomenúva mechaniku („sprievodca"), takže nadpis
       môže patriť klientovi a jeho výsledku. Zároveň spája úvod s pilulkou
       „Sprievodca" vľavo dole, ktorou sa dá spustiť znova. */
    elPocitadlo.textContent = k.uvodny ? 'Sprievodca' : 'Krok ' + poradie + ' z ' + cele;
    elPas.firstChild.style.width = k.uvodny ? '0%'
      : Math.round(poradie / cele * 100) + '%';
    elNadpis.textContent = typeof k.nadpis === 'function' ? k.nadpis() : k.nadpis;
    elPopis.textContent = typeof k.popis === 'function' ? k.popis() : k.popis;
    tlSpat.hidden = historia.length === 0;
    tlDalej.textContent = k.uvodny ? 'Začíname' : 'Potvrdiť';

    /* Karty presahujú cez okraj okna - cieľ, ktorý nie je vidieť, treba
       najprv priviesť do zorného poľa, inak by bublina ukazovala mimo. */
    /* Skok je okamžitý, nie plynulý: sprievodca preskakuje medzi vzdialenými
       miestami stránky a dlhé plynulé rolovanie by pokyn ukázalo až po ňom.
       Plynulé rolovanie sa navyše v nečinnej karte vôbec nespustí a cieľ by
       zostal mimo obrazovky. Prechod prekryje prelnutie bubliny. */
    const r = cielEl.getBoundingClientRect();
    if (window.parent === window && (r.top < 70 || r.bottom > innerHeight - 70))
      cielEl.scrollIntoView({ block: 'center', behavior: 'auto' });

    /* Prelínanie je zámerne ozdoba nad pokojovým stavom, nie cesta doň:
       kľudová hodnota je plná viditeľnosť. Keby sa skrývalo triedou alebo
       prechodom, stačilo by jedno neprehraté prelnutie a sprievodca by
       zostal neviditeľný. */
    posledna = '';
    umiestni();
    requestAnimationFrame(umiestni);
    /* Vo vloženom ráme sa NESMIE rozhodovať podľa innerHeight: rám má výšku
       celého obsahu (rodič mu ju nastavuje), takže odtiaľto vyzerá všetko ako
       viditeľné. Polohu preto hlásime pri každom kroku a scrolluje rodič -
       jediný, kto pozná skutočné okno. Posielame ROZSAH cez cieľ aj bublinu:
       pri míľnikoch leží bublina pri karte hore a prstenec na osi o stovky
       pixelov nižšie, takže scrollovanie na jediný bod druhý z nich vytlačí
       z obrazovky. Sami scrollovať nemôžeme - rám je zamknutý na 0,0 a rodič
       je na inej doméne. */
    if (window.parent !== window) requestAnimationFrame(() => {
      const c = cielEl.getBoundingClientRect();
      const bb = bublina.getBoundingClientRect();
      window.parent.postMessage({
        type: 'ph-renta-scroll',
        top: Math.round(Math.min(c.top, bb.top) + window.scrollY),
        bottom: Math.round(Math.max(c.bottom, bb.bottom) + window.scrollY)
      }, '*');
    });
    if (!REDUKOVANY) {
      [tien, prstenec, bublina].forEach(el => {
        if (el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease' });
      });
    }

    /* Fokus ide na skutočný prvok, takže sa krok dá splniť aj z klávesnice.
       V úvode je cieľom celá čiara života - fokus preto patrí tlačidlu
       „Začíname", nie prvému míľniku, ktorý sa ešte nerieši. */
    const fok = k.uvodny ? tlDalej
      : (cielEl.matches('button,input')
          ? cielEl : cielEl.querySelector('button:not([disabled]),input:not([disabled])'));
    if (fok) { try { fok.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* Posun na krok nasledujúci za daným id v aktuálnom vetvení. */
  function poDalsom(id, hlbka, spatny) {
    const d = (hlbka || 0) + 1;
    if (d > KROKY.length + 2) { koniec(true); return; }
    /* Dopredu sa ide rovnako ako v prehliadači: keď sa klient práve vrátil
       tlačidlom Späť, „Potvrdiť" ho vráti presne tam, odkiaľ prišiel. Inak sa
       ide na prvý krok, ktorý ešte nevidel - vďaka tomu sa po prepnutí vetvy
       dotiahnu otázky, ktoré v zozname stoja vyššie, a zároveň sa žiadny krok
       neukáže druhý raz. */
    const z = zoznam();
    while (dopredu.length) {
      const kandidat = dopredu.pop();
      if (z.some(k => k.id === kandidat)) { ukaz(kandidat, d, spatny); return; }
    }
    const dalsi = z.find(k => !videne.includes(k.id));
    if (!dalsi) { koniec(true); return; }
    ukaz(dalsi.id, d, spatny);
  }

  function dalej() { poDalsom(aktualny, 0); }

  /* Späť sa vracia na posledný zobrazený krok, ktorý v aktuálnom vetvení ešte
     existuje. Keď klient medzitým prepol napr. na „Majetok už mám“, kroky o
     spôsobe investovania z vetvenia vypadli - vrátiť sa na ne by nemalo kam. */
  function spat() {
    if (!bezi) return;
    clearTimeout(cakanie); cakanie = 0;
    const zive = zoznam().map(k => k.id);
    while (historia.length) {
      const p = historia.pop();
      if (zive.includes(p)) { if (aktualny) dopredu.push(aktualny); ukaz(p, 0, true); return; }
    }
    tlSpat.hidden = true;
  }

  /* Kontroluje sa hodnota, nie widget: klientovi sa uzná aj to, keď vek zmení
     tlačidlami v karte namiesto ťahania po čiare. */
  function skontroluj() {
    if (!bezi) return;
    const k = KROKY.find(x => x.id === aktualny);
    if (!k) return;
    /* Počítadlo sa opravuje aj počas odpočtu na posun - odpoveď mohla práve
       zmeniť vetvenie a klient by inak na poslednom kroku videl „9 z 10". */
    prepocitajPocitadlo(k);
    /* Nadpis aj popis vedia závisieť od vetvy (napr. „počas budovania" u toho,
       kto nič nebuduje). Po zmene voľby sa musia prepísať hneď. */
    if (typeof k.nadpis === 'function') {
      const t = k.nadpis();
      if (elNadpis.textContent !== t) elNadpis.textContent = t;
    }
    if (typeof k.popis === 'function') {
      const t = k.popis();
      if (elPopis.textContent !== t) elPopis.textContent = t;
    }
    if (cakanie) return;

    /* Odpoveď v predchádzajúcom kroku mohla aktuálny krok z vetvenia vyradiť
       alebo jeho prvok skryť. Vtedy sa nesmie ďalej pýtať naň - inak bublina
       hlási otázku na niečo, čo už na obrazovke nie je. */
    if (!zoznam().some(x => x.id === aktualny) || !vidno(k.ciel())) { dalej(); return; }

    if (k.hodnota() === snimka) return;
    potvrd();
  }

  /* Počet krokov sa vetvením mení; počítadlo musí sedieť okamžite. */
  function prepocitajPocitadlo(k) {
    if (k.uvodny) return;
    const zive = zoznam();
    /* Kroky, ktoré z vetvy vypadli, sa už nerátajú - inak sľúbených desať
       narastie na konci na jedenásť. */
    const rad = videne.filter(x => x !== 'uvod' && zive.some(k => k.id === x));
    const cele = Math.max(kroky().length, rad.length);
    const poradie = rad.indexOf(k.id) + 1;
    if (poradie < 1) return;
    const popis = 'Krok ' + poradie + ' z ' + cele;
    if (elPocitadlo.textContent === popis) return;
    elPocitadlo.textContent = popis;
    elPas.firstChild.style.width = Math.round(poradie / cele * 100) + '%';
  }

  function potvrd() {
    /* Krátka pauza, nech klient stihne vidieť, že jeho zmena zabrala. */
    cakanie = setTimeout(() => { cakanie = 0; if (bezi) dalej(); }, 460);
  }

  function naKlik(e) {
    if (!bezi || cakanie) return;
    const k = KROKY.find(x => x.id === aktualny);
    if (!k || !k.klikNa) return;
    const box = k.klikNa();
    if (box && box.contains(e.target) && e.target.closest('button')) potvrd();
  }

  function naKlaves(e) {
    if (bezi && e.key === 'Escape') { e.preventDefault(); koniec(false); }
  }

  /* ----------------------------------------------------------- štart/koniec */

  function start() {
    if (bezi) return;
    bezi = true;
    /* Bez vyčistenia by sa po reštarte objavilo „Späť" už v úvode a skočilo
       na krok, na ktorom klient skončil minule. */
    historia.length = 0;
    videne.length = 0;
    dopredu.length = 0;
    aktualny = null;
    vrstva.hidden = false;
    obnovPilulku();
    document.addEventListener('click', naKlik, true);
    addEventListener('keydown', naKlaves);
    const tik = () => {
      if (!bezi) return;
      umiestni();
      skontroluj();
      smycka = requestAnimationFrame(tik);
    };
    smycka = requestAnimationFrame(tik);
    ukaz(KROKY[0].id, 0);
  }

  function koniec(dokoncene) {
    if (!bezi) return;
    bezi = false;
    cancelAnimationFrame(smycka);
    clearTimeout(cakanie); cakanie = 0;
    document.removeEventListener('click', naKlik, true);
    removeEventListener('keydown', naKlaves);
    vrstva.hidden = true;
    cielEl = null;
    obnovPilulku();
    try { localStorage.setItem(KLUC, '1'); } catch (e) {}
    if (dokoncene) hotovo();
  }

  /* Aplikácia zostáva presne v stave, ktorý si klient sám nastavil - vrstva
     na konci nič neprepisuje ani neresetuje. */
  function hotovo() {
    /* Kto prešiel sprievodcu a všetko iba potvrdil, nezmenil ani jeden vstup -
       pás by mu preto zostal skrytý, hoci si plán prešiel celý. */
    if (window.odomkniPas) window.odomkniPas();
    const t = document.createElement('div');
    t.className = 'za-hotovo';
    t.setAttribute('role', 'status');
    t.innerHTML = '<strong>Prešli sme všetko, čo si viete nastaviť.</strong> '
                + 'Odteraz meňte čokoľvek - každá zmena sa prepočíta hneď.';
    document.body.appendChild(t);
    if (!REDUKOVANY && t.animate) t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    setTimeout(() => {
      if (!REDUKOVANY && t.animate)
        t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
      setTimeout(() => t.remove(), 420);
    }, 7000);
  }

  /* ------------------------------------------------------------- spustenie */

  function pripoj() {
    postav();
    postavPilulku();

    if (QS.has('bez-uvodu')) return;
    let videne = false;
    try { videne = localStorage.getItem(KLUC) === '1'; } catch (e) {}
    if (videne && !QS.has('uvod')) return;

    /* Karty sa po načítaní ešte dosúvajú - sprievodca počká, nech prstenec
       nesadne na miesto, z ktorého sa prvok o chvíľu odsunie. */
    const odklad = QS.has('uvod') ? 200 : 1400;

    /* Aplikácia nemusí byť pri načítaní na obrazovke - na webe pod ňou stojí
       článok a človek k nej doscrolluje. Spustiť sprievodcu do prázdna by
       znamenalo, že ho minie: kým doscrolluje, prstenec už ukazuje na krok,
       ktorý nevidel začať. Preto čakáme, kým je aplikácia naozaj v zábere. */
    /* Pod 481 px aplikácia prepína na mobilnú mapu plánu a VŠETKY ciele
       sprievodcu (karty, os, prepínače, jazdce) sú display:none. Sprievodca by
       tam neukázal ani jeden krok a napriek tomu by sa označil za dokončený -
       zapísal by „videné" a odomkol pás bez jediného dotyku. Mobilný tok je
       samostatná úloha. */
    if (window.innerWidth <= 480) return;

    const app = document.getElementById('lp');
    let spustene = false;
    const spusti = () => {
      if (spustene) return;
      spustene = true;
      setTimeout(start, odklad);
    };

    /* Vo vloženom ráme sa na IntersectionObserver spoľahnúť NEDÁ: zorné pole
       je tam celý rám (1700 px), ktorý si rodič nastavuje na výšku obsahu,
       takže aplikácia doň zasahuje vždy - už v prvom okamihu po načítaní.
       Sprievodca sa preto spustil hneď a jeho prvý krok si vypýtal scroll,
       takže návštevníka rovno po príchode odsunul do kalkulačky. Stránka má
       pritom začať hore, pri audiu. Skutočné okno pozná jedine rodič, ktorý
       ho hlási cez ph-renta-viewport - čakáme teda na jeho slovo. */
    if (app && window.parent !== window) {
      naOknoRodica((top, height) => {
        if (spustene) return;
        /* Samotný prienik nestačí. Rám je takmer celá aplikácia, takže „pás
           cez stred" pretne aj 200 px vysoký prúžok pri spodnej hrane, keď je
           návštevník ešte v úvode - a sprievodca by naskočil skôr, než sa naň
           vôbec pozrel. Preto musí byť z rámu vidieť aj poriadny kus. */
        if (height < 450) return;
        const r = app.getBoundingClientRect();
        const hore = r.top + window.scrollY, dole = r.bottom + window.scrollY;
        const pasHore = top + height * 0.25, pasDole = top + height * 0.75;
        if (dole > pasHore && hore < pasDole) spusti();
      });

      /* Rodič hlásiť nemusí - stránka môže byť staršia, blok v nej vypnutý
         alebo prepísaný. Sprievodca sa preto nesmie na jeho správu spoliehať
         ako na jedinú cestu, inak by na takej stránke nenaskočil nikdy.
         Náhradou je vlastný dotyk: myš ani koliesko sa nad rámom nepohnú
         skôr, než sa naň človek pozrie, takže je to poctivý dôkaz, že je pri
         kalkulačke - a na rozdiel od pôvodného IntersectionObservera to
         nikoho nikam neposunie. */
      setTimeout(() => {
        if (spustene || oknoRodica) return;
        const udalosti = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown'];
        const naDotyk = () => {
          udalosti.forEach(u => document.removeEventListener(u, naDotyk));
          spusti();
        };
        udalosti.forEach(u => document.addEventListener(u, naDotyk, { passive: true }));
      }, 5000);
      return;
    }

    if (!app || !('IntersectionObserver' in window)) {
      setTimeout(start, odklad);
      return;
    }
    /* Prah sa NESMIE počítať z podielu aplikácie - tá je vyššia než obrazovka
       (na telefóne 2845 px proti 844 px), takže podiel 0,4 sa nedosiahne nikdy
       a sprievodca by sa nespustil. Namiesto toho sa sleduje, či aplikácia
       zasiahne do stredného pásu obrazovky; to platí pri každej výške. */
    const sledovac = new IntersectionObserver((zaznamy) => {
      if (zaznamy.some(z => z.isIntersecting)) {
        sledovac.disconnect();
        spusti();
      }
    }, { threshold: 0, rootMargin: '-25% 0px -25% 0px' });
    sledovac.observe(app);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', pripoj);
  else pripoj();
})();
