# Promotion manifest — Stratégia privátnej renty 10/10

Tento dokument je príprava, nie súhlas s povýšením ani nasadením.

## Ochranné pravidlá

- Nepoužiť `git checkout`, `git reset`, plošné kopírovanie ani prepis celých súborov.
- Kanonické súbory už obsahujú rozpracované zmeny, ktoré treba zachovať.
- Pred každým zápisom znovu skontrolovať pracovný strom a porovnať SHA-256 s týmto manifestom.
- Povýšiť iba konkrétne schválené bloky; generované súbory vytvoriť výhradne cez `python3 zostav.py`.
- Boldem a Squarespace meniť až po samostatnom výslovnom súhlase.

## Stav pri vytvorení manifestu

| Súbor | SHA-256 |
|---|---|
| `cara-zivota-master.html` | `a703258efa179816dc49a33f55e548f697807466b14d2883a75fea9ea722151a` |
| `preview-local.html` | `6c9737b089bd901e32ffb5015ce10606244088354f365ed96ac38b1026ace883` |
| `vysledok-master.html` | `30a2fb489deb21b212b7903289a929369830dc806d6871d902532348f76bcc98` |
| `vysledok.html` | `aba7c856ea9ce0624cadb47f1f3de215eafc99ea0a09f2cb5a755767d47a2903` |
| `vysledok-redakcna-alternativa.html` | `c2137913d61f48f86b4b90bffb40f34b1753b158eb3e4a0d57d2cecdc65bbdb2` |
| `pdf-alternativa.js` | `2103a637dd8e05f440505d87b5f23aa1e2a5a0230b4dfe423acffdfb6a16ad40` |
| `landing-copy-10of10.md` | `5fe3a77a56c9fcc653eb3aaa533aefd0fb6dd6ae41d0142ec1bda056542e4414` |
| `boldem-email-10of10.md` | `db870d4d97706f87cfdd309bbc74b70dd99eef94567d1c40f21228a8ba4b2ba1` |

SHA hodnota sa po ďalšej auditnej oprave môže zmeniť; rozdiel znamená povinnosť znovu skontrolovať obsah, nie automaticky pokračovať.

## Minimálny rozsah povýšenia

### 1. Hlavná stránka a formulár

Zdroj pravdy pre text: `landing-copy-10of10.md`.

Do `cara-zivota-master.html` a následne do zdrojovej kópie Squarespace preniesť iba:

- podmienený sľub historického testu: obdobie budovania + vopred zvolený koniec čerpania,
- jednotný termín „800 modelovaných skúšok“,
- vysvetlenie, že ide o podiel skúšok v modeli, nie pravdepodobnosť,
- otázku „Kam vám máme poslať odkaz na modeláciu?“,
- zachovanie okamžitého otvorenia výsledku a e-mailu ako praktickej poistky,
- schválený právny text a odkaz na ochranu osobných údajov.

`preview-local.html` je iba kontrolný náhľad; nesmie byť jediným miestom, kde text existuje.

### 2. Výsledková stránka

Zdroj vizuálne a obsahovo schválenej alternatívy:

- `vysledok-redakcna-alternativa.html`,
- `vysledok-redakcna-alternativa-static.html` iba ako kontrolný render.

Do `vysledok-master.html` preniesť funkčne, nie plošným kopírovaním:

- jednotný dizajnový systém,
- vysvetlenie 306 384 € → 871 922 € → 268 z 800,
- explicitné rozlíšenie základného prepočtu a modelovaných skúšok,
- sekundárnu citlivosť 600/800 a 720/800,
- skrytie historického testu pri okamžitom čerpaní, perpetuite a cieli trvania,
- nominálne označenie celkových rent a aritmeticky konzistentný zobrazený rozdiel,
- responzívne zbalenie metodiky a predpokladov,
- schválený konzultačný modul.

### 3. PDF

`pdf-alternativa.js` musí byť po schválení buď:

- pridaný ako verzovaný nasadzovaný asset a načítaný z `vysledok-master.html`, alebo
- bezpečne zlúčený do `pdf.js`.

Nesmie zostať iba lokálnym súborom bez produkčnej URL. Zachovať:

- 2 strany pre scenár s historickým testom,
- 1 stranu pre scenár bez historického testu,
- presný scenárový text bez odkazu na neexistujúcu druhú stranu,
- CTA a rezervovaný footer bez kolízie.

### 4. Boldem

Zdroj pravdy: `boldem-email-10of10.md`.

Aktualizovať predmet, telo a CTA v existujúcej automatizácii. Zachovať dynamický odkaz na scenár. Nezameniť odkaz za PDF prílohu. Po zmene spraviť reálne testovacie odoslanie na kontrolnú adresu a overiť:

- doručenie,
- správny scenárový odkaz,
- otvorenie výsledku,
- stiahnutie PDF,
- rezervačný odkaz.

## Povinné gate po povýšení

```bash
python3 zostav.py
node audit-financne-jadro.mjs
node audit-pdf-alternativa.mjs
git diff --check
```

Ďalej zopakovať:

1. osem webových scenárov,
2. mobil 390 × 844 a desktop,
3. reálny dvojstranový PDF,
4. reálny jednostranový PDF pre okamžité čerpanie,
5. reálny jednostranový PDF pre perpetuitu,
6. test Boldem doručenia,
7. kontrolu verejnej URL po GitHub Pages a cache-busteri,
8. kontrolu Squarespace obalu a audio prehrávača.

Nasadenie je úspešné až vtedy, keď všetky gate prejdú na verejnej verzii, nie iba lokálne.
