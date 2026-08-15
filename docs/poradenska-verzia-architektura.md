# Poradenská verzia privátnej renty — cieľová architektúra

## Rozhodnutie

Poradenská verzia nebude pixelovou kópiou verejnej Čiary života ani samostatným
dashboardom s paralelnou metodikou. Bude profesionálnou vrstvou nad jedným
spoločným doménovým a výpočtovým jadrom.

## Aktuálny stav a rozdiely

| Oblasť | Verejná Čiara života | Dnešná poradenská verzia | Cieľ |
|---|---|---|---|
| Mentálny model | Dnes → začiatok čerpania → koniec čerpania | formulár + graf + výsledkové karty | rovnaká Čiara života v oboch vrstvách |
| Deterministický výpočet | jeden klientsky výnos, pevné poplatkové konštanty | samostatný výnos pre budovanie a rentu, editovateľné poplatky a zostatok | spoločné funkcie s parametrizovanými predpokladmi |
| Historické dáta | pole výnosov vo výsledku | druhá kópia výnosov v dashboarde | jediný JSON dataset s verziou a kontrolným súčtom |
| Simulácie | 5-ročné bloky; história pri budovaní, 4 % pri čerpaní | jednotlivé roky; portfóliové profily a história aj pri čerpaní | pomenované metodické profily nad jedným simulačným jadrom |
| Profesionálne vstupy | zámerne minimálne | servis, poplatky, zostatok, profil, stres | zachovať iba v poradenskej UX vrstve |
| Výstup | klientsky výsledok a PDF | pásmo, stres a detailné predpoklady | spoločný základ + poradenské analytické moduly |

## Hranica spoločného jadra

Spoločné jadro obsahuje:

1. dátový model scenára a validáciu,
2. mesačné sadzby, infláciu a poplatkovú logiku,
3. výpočet kapitálu, renty a doby čerpania,
4. jednotné zaokrúhľovanie,
5. jeden historický dataset, jeho verziu, zdroj a SHA-256,
6. seedovaný blokový bootstrap a konfigurovateľné metodické profily,
7. celú logiku akumulácie aj čerpania v simulácii,
8. parametrický stres test,
9. definíciu úspechu a strojovo čitateľný výsledok.

Do jadra nepatrí DOM, CSS, animácia, copy, lead formulár, Boldem, PDF renderer
ani interpretačné odporúčanie poradcu. UI rozhoduje iba o tom, ktoré funkcie
jadra sprístupní.

## Metodické profily

- **Základný plán:** deterministický výpočet podľa používateľom zadaných
  predpokladov.
- **Klientsky historický pohľad:** 800 seedovaných ciest zo súvislých
  päťročných blokov MSCI World; pri budovaní historické výnosy a pri čerpaní
  schválený plánovací predpoklad 4 % po investičných nákladoch pred infláciou.
- **Poradenská portfóliová simulácia:** konkrétna alokácia a poradenské
  predpoklady, ale rovnaký seedovaný blokový mechanizmus. Výsledok je samostatný
  analytický pohľad, nie náhrada klientskeho historického testu.
- **Stresový test:** parametrický prepad nad rovnakým scenárom.
- **CMA pohľad:** samostatný pohľad dopredu; nikdy sa nemieša s historickými
  dátami ani neoznačuje ako predpoveď.

Každý profil má vlastný identifikátor a verziu. Parametre ako počet ciest,
dĺžka bloku, výnos pri čerpaní a seed nesmú zostať skrytými konštantami v UI.

Blokový bootstrap je jediná spoločná implementácia v jadre, nie dve kópie.
Konfigurácia profilu určuje dáta aktív, alokáciu a pravidlá čerpania, ale
generátor blokov, seedovanie a ošetrenie hraníc sú spoločné. Predvolená dĺžka
bloku je päť rokov; začiatok sa losuje iba tam, kde sa celý súvislý blok zmestí
do datasetu, bez prepojenia konca série na jej začiatok. Pri viacerých aktívach
sa pre všetky aktíva vyberá ten istý časový blok, aby sa zachovala ich
historická súbežnosť. Test musí potvrdiť, že dva profily s identickou
konfiguráciou vytvoria pri rovnakom seede identické dráhy aj výsledky.

## Dve UX vrstvy

Klientska vrstva ponechá tri míľniky, minimum vstupov, základný prepočet,
historický pohľad, výsledok a PDF.

Poradenská vrstva začne rovnakou Čiarou života a rovnakým súhrnom. Postupne
sprístupní:

1. klienta a cieľ,
2. majetok a budovanie,
3. poradenské predpoklady a poplatky,
4. odolnosť plánu,
5. stresové scenáre,
6. portfólio a CMA,
7. klientsky výstup s poradenskou interpretáciou.

Pokročilé moduly sa odhaľujú postupne. Základný plán musí byť pochopiteľný aj
bez ich otvorenia.

## Regresná ochrana

Pred zmenou správania sa zachytia referenčné výsledky oboch dnešných nástrojov:

- verejná matica podporovaných scenárov,
- poradenská matica vrátane poplatkov, servisného režimu, portfóliových profilov,
  simulácie a stresu,
- presné vstupy, zaokrúhlené výstupy, seed, metodický profil a hash datasetu.

Nové jadro musí najprv reprodukovať oba pôvodné profily. Až samostatne schválená
metodická migrácia smie zmeniť poradenské výsledky.

## Migračné poradie

1. Uzamknúť túto mapu a baseline výstupy.
2. Zaviesť spoločný dataset s kontrolným súčtom.
3. Extrahovať čisté jadro a kontrakt scenára/výsledku.
4. Pridať krížové a regresné testy.
5. Migrovať poradenskú verziu bez zmeny UI.
6. Prebudovať poradenské UI podľa Čiary života.
7. Zjednotiť výsledok, PDF, terminológiu a auditnú stopu.
8. Urobiť finančný, UX, responzívny a produkčný E2E audit.

## Akceptačné kritériá

- Rovnaký scenár, predpoklady a metodický profil dajú rovnaké čísla.
- Dataset existuje iba raz a jeho hash kontrolujú testy.
- Simulácia je deterministická pri rovnakom seede.
- Klientska vrstva neodhaľuje poradenské ovládanie.
- Poradenská vrstva nestráca poplatky, servis, stres ani portfóliové pohľady.
- Desktop, notebook a tablet používajú desktopové rozloženie; mobilné iba telefón.
- Každá etapa prejde automatickými testami a Claude review.
