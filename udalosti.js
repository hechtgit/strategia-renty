/* Anonymné udalosti lievika: začal výpočet, videl výsledok, odoslal modeláciu,
   úspešne vytvoril PDF, klikol na rezerváciu.

   Prečo takto a nie analytikou: CSP aplikácie aj modelácie cudzie skripty
   blokuje a finančné čísla klienta nesmú odísť nikam. Posiela sa iba názov
   udalosti a stránka (aplikácia / modelácia) na vlastný medzičlánok, ktorý
   zvýši denné počítadlo. Žiadne ID, cookies, URL, sumy ani e-mail — a každá
   udalosť najviac raz za načítanie stránky.

   Kto má v prehliadači zapnuté „nesledovať" (Do Not Track alebo Global Privacy
   Control), nemeriame ani takto. Lokálne náhľady a testy mimo verejnej adresy
   nemerajú nič. */
(() => {
  'use strict';
  const ADRESA = 'https://renta-boldem.renta-relay.workers.dev/udalost';
  const POVOLENE = new Set(['zacal', 'videl-vysledok', 'odoslal', 'pdf', 'rezervacia']);
  const ZDROJ = /vysledok/i.test(location.pathname) ? 'modelacia' : 'aplikacia';
  const odoslane = new Set();

  const nesledovat = () => {
    try {
      return navigator.globalPrivacyControl === true
        || navigator.doNotTrack === '1' || window.doNotTrack === '1';
    } catch (e) { return false; }
  };
  const verejnaAdresa = () => location.hostname === 'hechtgit.github.io';

  function udalost(nazov) {
    if (!POVOLENE.has(nazov) || odoslane.has(nazov)) return;
    odoslane.add(nazov);
    if (!verejnaAdresa() || nesledovat()) return;
    const telo = JSON.stringify({ u: nazov, z: ZDROJ });
    /* Beacon prežije aj odchod zo stránky (klik na rezerváciu). Reťazec ide ako
       text/plain — jednoduchá požiadavka bez predbežnej CORS otázky. */
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ADRESA, telo)) return;
    } catch (e) { /* skúsime fetch */ }
    try {
      fetch(ADRESA, { method: 'POST', body: telo, keepalive: true, mode: 'cors',
        credentials: 'omit' }).catch(() => {});
    } catch (e) { /* meranie nesmie nikdy rozbiť stránku */ }
  }
  window.PH_UDALOST = udalost;

  /* Rezervácia: každý odkaz na rezerváciu, na ktorý klient klikne. */
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href*="hechtberger.com/rezervacia"]');
    if (a) udalost('rezervacia');
  }, true);
})();
