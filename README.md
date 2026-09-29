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
| `pdf.js` | Zloží modeláciu do PDF priamo v prehliadači. Čísla číta z vykreslenej stránky, neprepočítava ich. |
| `renta-flow-10of10.css`, `renta-flow-10of10.js` | Kanonická obsahová a vizuálna vrstva nadväzujúcich modulov hlavnej kalkulačky. |
| `vysledok-10of10.css`, `vysledok-10of10.js` | Kanonická vrstva výsledkovej stránky: jednotný dizajn, zrozumiteľné vysvetlenia a scenárové výnimky. |
| `pdf-alternativa.js` | Kanonické klientské PDF; rozširuje základný generátor bez duplicitného prepočítavania čísel. |
| `pdf-font.js` | Písmo pre PDF — Asap (OFL) orezaný na použité znaky vrátane slovenskej diakritiky. Vygenerované, needitovať. |
| `jspdf.min.js` | Knižnica jsPDF 2.5.2, vendorovaná (žiadne CDN). |
| `squarespace-injection.html` | **Zdrojová kópia** kódu vloženého v Squarespace (Page Settings → Advanced). Squarespace nie je verzionovaný — po každej zmene tam ju sem prekopíruj a commitni. Bez tohto kódu tok nefunguje. |
| `preview-local.html` | Lokálny vizuálny náhľad v rovnakom obale, fontoch a s rovnakým Adam prehrávačom ako ostrá Squarespace stránka. Nie je deploy artefakt. |

## Ako spraviť zmenu

```bash
python3 zostav.py
node scripts/build-renta-core-browser.mjs   # pás „X z 800" používa dist/, nie master
node audit-financne-jadro.mjs
node audit-konzistencia-kanalov.mjs
node audit-pdf-alternativa.mjs
node tests/pdf-layout.mjs
node tests/balik-pred-kampanou.mjs
python3 tests/e2e_balik.py --target local   # skutočný rám v Squarespace + PDF
```

Pri zmene `shared/renta-core.js` treba zostaviť aj `dist/` a zvýšiť `?v=` pri
jeho načítaní v masteri — inak prehliadač počíta pás so starým jadrom.

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

## PDF

Tlačidlo *Stiahnuť modeláciu v PDF* nespúšťa tlač — zloží súbor v prehliadači
a stiahne ho. Na telefóne bola tlačová ponuka funkčná, ale klient z nej PDF musel
ešte vylúpiť; súbor je to, čo naozaj chce.

Generátor, písmo a knižnica (spolu ~440 kB) sa načítajú **až po ťuknutí** —
väčšina návštevníkov PDF nechce. Keby sa generátor nenačítal, tlačidlo spadne
na tlač — ale iba pri platnom výsledku.

Čísla, ktoré PDF nesmie mať inak než výpočet (obe sadzby pred poplatkom aj po
ňom, veky, vypočítaný koniec renty, platnosť), berie zo štruktúrovaných údajov
`PH_VYSLEDOK`, ktoré modelácia vystaví pri výpočte — nie regulárnym výrazom
z textu. Keď chýbajú alebo sú neplatné (NaN, varovanie jadra), export sa
zastaví so správou a nespadne ani na tlač; `?tlac=1` neplatný výsledok
nevytlačí. Pätička oboch strán nesie celé upozornenie o riziku (viacriadkovo,
s rezervovanou výškou) a pri projekcii na prvej strane stojí „Modelový
výpočet, nie predpoveď ani záruka.". Schválená referencia rozloženia je
`tests/fixtures/modelacia-referencna.pdf`.

## Odoslanie modelácie a stav e-mailu

Modelácia sa otvorí vždy — aj keď zlyhá overenie prehliadača, medzičlánok
alebo e-mail, aj keď prehliadač zablokuje či klient zavrie nové okno (vtedy sa
ponúkne priamo v aplikácii, bez straty plánu). Stav e-mailu je pravdivý:
„poslali sme" iba vtedy, keď medzičlánok potvrdil prijatie do fronty; inak
„nepodarilo sa potvrdiť / neodoslali sme — PDF si stiahnite teraz". Opakovanie
si vždy vypýta nový token overenia. Medzičlánok (NanoClaw
`tools/renta-boldem-relay`) drží atómový stav pokusu, takže opakovanie ani
súbeh nepošlú e-mail dvakrát.

## Meranie

`udalosti.js` posiela na medzičlánok päť anonymných udalostí (začal, videl
výsledok, odoslal, PDF, rezervácia) — iba názov a stránku, bez súm, e-mailu,
URL či identifikátorov; každú najviac raz za načítanie. Pri zapnutom „Do Not
Track" / GPC nemeria. Odkazy na rezerváciu nesú `?src=renta`.

Čísla sa do PDF **neprepočítavajú**, čítajú sa z už vykreslenej modelácie. PDF
teda nemá ako ukázať niečo iné, než čo má klient pred očami.

Písmo je orezané na znaky, ktoré dokument používa — vrátane `ľ ť ď ň ĺ ŕ` a
nezlomiteľnej medzery z formátovania čísel. Pri zmene textov, ktoré by priniesli
nový znak, treba `pdf-font.js` vygenerovať znova.

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
