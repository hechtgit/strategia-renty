# Stratégia privátnej renty

Aplikácia a modelácia pre stránku
[hechtberger.com/strategia-privatnej-renty](https://www.hechtberger.com/strategia-privatnej-renty).

## Čo je čo

| Súbor | Rola |
|---|---|
| `cara-zivota-master.html` | **Zdroj aplikácie.** Samostatná stránka aj s úvodom a hero obrazom, aby sa v nej dalo pracovať priamo v prehliadači. Tu sa edituje. |
| `vysledok-master.html` | **Zdroj modelácie** — stránky, na ktorú vedie odkaz z e-mailu. Tu sa edituje. |
| `zostav.py` | Prevedie oba mastre na nasadzované súbory. |
| `cara-zivota.html` | Vygenerované. Vkladá sa do Squarespace cez `<iframe>`. **Needitovať.** |
| `vysledok.html` | Vygenerované. Otvára si ju klient z e-mailu. **Needitovať.** |
| `index.html` | Pôvodná verzia kalkulačky. Drží živú stránku, kým sa nová nezverejní. **Nemeniť.** |
| `hero-privatna-renta.jpg` | Obraz pre úvod aplikácie aj modelácie. |
| `squarespace-injection.html` | **Zdrojová kópia** kódu vloženého v Squarespace (Page Settings → Advanced). Squarespace nie je verzionovaný — po každej zmene tam ju sem prekopíruj a commitni. Bez tohto kódu tok nefunguje. |

## Ako spraviť zmenu

```bash
python3 zostav.py
```

1. Uprav **master** (`cara-zivota-master.html` alebo `vysledok-master.html`).
2. Spusti `zostav.py`.
3. Commitni a pushni.
4. V Squarespace v Page Settings → Advanced zvýš `?v=…` pri `cara-zivota.html`.
   Bez toho si prehliadače podržia starú verziu.
5. Rovnaký obsah ulož do `squarespace-injection.html` a commitni — inak sa
   zdrojová kópia rozíde s tým, čo naozaj beží na stránke.

GitHub Pages nasadzuje zhruba minútu, kým sa nová verzia objaví na `hechtgit.github.io`.

## Prečo je to rozdelené

Aplikácia beží v `<iframe>` na GitHub Pages, nie priamo v Squarespace. Dôvody:

- **Boldem kontroluje Referer.** Konfiguračný endpoint `front.boldem.cz/api/forms/get`
  odpovie iba pôvodu `hechtgit.github.io`; z `hechtberger.com` vráti
  „Referer and website URL mismatch". Zber kontaktov teda musí bežať odtiaľto.
- **Audio prehrávač** (`adam-player.js` z repozitára `hechtgit/adam-audio`) sa
  zachytáva o kotvu v úvode stránky. Úvod preto zostáva v Squarespace a do aplikácie
  sa neprenáša. Prehrávač sem nikdy nekopíruj — vznikli by dva.
- **Hlavičku a pätičku** dodáva Squarespace.

`zostav.py` na to dohliada: ak by sa niektorý z týchto blokov dostal do
nasadzovaného súboru, build spadne.

## Prečo majú aplikácia a modelácia rovnaké čísla

Modelácia si scenár číta z adresy (rovnaké kľúče, aké zapisuje aplikácia) a počíta
ho **tým istým kódom**: `zostav.py` vystrihne finančné jadro z mastera aplikácie
medzi značkami `JADRO:ZAČIATOK` a `JADRO:KONIEC` a vloží ho do modelácie.

Z toho plynú dve pravidlá:

- Do jadra nepatrí nič, čo sa dotýka DOM — build to kontroluje a spadne.
- Názvy parametrov v adrese sú zmluva navonok. Po premenovaní prestanú sedieť
  odkazy, ktoré klienti už dostali e-mailom.

## Pomenovanie míľnikov

**Dnes / Začiatok čerpania / Koniec čerpania** — zhodné v aplikácii, v modelácii,
v PDF aj v scenári pre audio. Pri zmene treba prepísať všetky štyri výstupy naraz,
inak si klient prečíta v e-maile iné názvy, než videl na obrazovke.

## Zber kontaktov

Meno, priezvisko a e-mail idú do Boldemu (`uc=208268`, formulár
`dd1af774-e0b8-4e6b-b309-ef3ce906a2ac`, scenárové pole `cc_3659`) spolu s odkazom na
prepočítaný scenár a jeho krátkym zhrnutím.

Odpoveď Boldemu vyhodnocuje `boldemOdmietol()`. Riadi sa jedným pravidlom: klientovi
nikdy nepovedať, že modelácia odišla, keď neodišla. Boldem vie odpovedať stavom 200
aj pri odmietnutí, takže sa hľadá výslovne záporný signál v tele odpovede.
