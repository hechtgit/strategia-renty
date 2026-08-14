# Stratégia privátnej renty — release audit 10/10

Stav: lokálne kanonické súbory sú po schválenom povýšení pripravené na samostatné schválenie nasadenia. GitHub Pages, Squarespace ani Boldem neboli zmenené.

## Overený rozsah

- kalkulačka: `cara-zivota-master.html`, `renta-flow-10of10.css`, `renta-flow-10of10.js`
- výsledok: `vysledok-master.html`, `vysledok-10of10.css`, `vysledok-10of10.js`
- PDF: `pdf.js`, `pdf-alternativa.js`
- e-mailový návrh: `boldem-email-10of10.md`
- generované artefakty: `cara-zivota.html`, `vysledok.html`

## Finančné a metodické kontroly

Príkaz:

```bash
node audit-financne-jadro.mjs
```

Výsledok: 8/8 scenárov prešlo — jednorazový vklad, pravidelné investovanie, kombinácia, hotový majetok s výškou renty, hotový majetok s dĺžkou čerpania, renta bez časového obmedzenia, okamžité čerpanie a výpočet bez inflácie.

Overené boli aj ochrany vstupov, neudržateľná perpetuita, hraničné výpočty, reprodukovateľnosť modelu, monotónnosť a hranice 600/800 a 720/800.

Každá z 800 modelovaných skúšok vzniká spojením súvislých päťročných blokov výnosov MSCI World Net Total Return v EUR z rokov 1970–2025 do novej modelovanej kombinácie. História sa používa iba počas budovania majetku. Po začatí renty sa používa plánovací výnos 4 % ročne po investičných nákladoch, pred infláciou. Podiel úspešných skúšok nie je odhad pravdepodobnosti budúceho úspechu.

## Výsledková stránka

Pre všetkých osem scenárov bolo overené:

- žiadne `NaN`, `undefined` ani `Infinity`,
- žiadny horizontálny overflow,
- žiadne duplicitné „z 800 z 800“,
- historická sekcia sa zobrazí iba pri období budovania a vopred zvolenom konci čerpania,
- pri okamžitom čerpaní, rente bez časového obmedzenia a cieli „ako dlho majetok vydrží“ sa historický test nezobrazí.

Referenčný scenár vysvetľuje tri rozdielne čísla:

- 306 384 € — dnešný jednorazový vklad,
- 871 922 € — potrebný kapitál v 65 rokoch podľa základného prepočtu,
- 268 z 800 — počet modelovaných skúšok, v ktorých kapitál pokryl všetky plánované výplaty,
- približne 735 000 € a 1 115 000 € — zaokrúhlené ilustračné úrovne citlivosti, nie odporúčané investičné ciele.

## PDF

Reálne PDF boli vytvorené kliknutím v prehliadači, nielen testovacím generátorom.

- štandardný scenár: 2 strany A4 vrátane historickej metodiky a konzultačného CTA,
- okamžité čerpanie: 1 strana a explicitné vysvetlenie, prečo sa historický test nezobrazuje,
- renta bez časového obmedzenia: 1 strana a rovnaké scenárové vysvetlenie,
- bez klipovania, pretečenia, kolízií alebo chýbajúcich strán,
- zobrazená aritmetika sedí: 2 072 852 € − 306 384 € = 1 766 468 €.

Referenčný finálny PDF: `/Users/hecht/Downloads/modelacia-privatnej-renty (18).pdf`.

## Stav e-mailu a zostávajúce gate

`boldem-email-10of10.md` je lokálny kanonický návrh. Existujúca automatizácia Boldem nebola zmenená ani otestovaná odoslaním.

Po samostatnom schválení nasadenia zostáva:

1. nahrať kanonické artefakty na GitHub Pages a overiť verejné assety,
2. aktualizovať cache-buster a zdrojovú kópiu Squarespace injection,
3. vložiť schválený text do existujúcej Boldem automatizácie,
4. vykonať reálne testovacie odoslanie a overiť e-mailový odkaz, výsledok, PDF a rezervačný odkaz,
5. skontrolovať verejnú stránku vrátane Squarespace obalu a Adam audio prehrávača.

Tieto kroky sú nasadenie a vyžadujú osobitné výslovné schválenie.
