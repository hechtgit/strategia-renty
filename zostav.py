#!/usr/bin/env python3
"""Zostaví nasadzované súbory stránky Stratégia privátnej renty.

Vzniknú dva:

  cara-zivota.html   — aplikácia pre iframe v Squarespace. Master je samostatná
                       stránka aj s úvodom a hero obrazom, aby sa v nej dalo
                       pracovať priamo v prehliadači; do iframu ide bez toho,
                       čo na stránke dodáva Squarespace, a s hlásením výšky rodičovi.

  vysledok.html      — modelácia, ktorú klient dostane odkazom v e-maile. Číta scenár
                       z adresy a musí ukazovať tie isté čísla ako aplikácia. Preto sa
                       do nej vkladá finančné jadro vystrihnuté priamo z mastera
                       aplikácie (medzi značkami JADRO:ZAČIATOK a JADRO:KONIEC) —
                       matematika tak žije na jednom mieste a nemá ako sa rozísť.

Oba mastre (cara-zivota-master.html, vysledok-master.html) sú v tomto repozitári —
edituje sa vždy master, nikdy vygenerovaný súbor.

Použitie:
    python3 zostav.py [cesta/k/masteru.html]

Bez argumentu berie cara-zivota-master.html vedľa seba. Po zostavení treba súbory
commitnúť a v code bloku stránky zvýšiť ?v=… (cache-buster), inak si prehliadače
podržia starú verziu.
"""
import re
import sys
from pathlib import Path

MASTER = Path(__file__).with_name('cara-zivota-master.html')
VYSTUP = Path(__file__).with_name('cara-zivota.html')

VYSLEDOK_MASTER = Path(__file__).with_name('vysledok-master.html')
VYSLEDOK = Path(__file__).with_name('vysledok.html')

JADRO_OD = '/* JADRO:ZAČIATOK'
JADRO_PO = '/* JADRO:KONIEC */'
JADRO_MIESTO = '/* __JADRO__ */'

VYSLEDOK_HLAVICKA = """<!--
  MODELÁCIA PRIVÁTNEJ RENTY — stránka s výsledkom scenára
  ================================================================
  POZOR: vygenerované skriptom zostav.py z vysledok-master.html.
  Needituj tento súbor priamo — zmeny sa pri najbližšom zostavení stratia.

  Scenár si stránka číta z adresy (rovnaké kľúče, aké zapisuje aplikácia).
  Finančné jadro sem zostav.py prenáša z mastera aplikácie, takže čísla sú
  zhodné s tým, čo klient videl na obrazovke. Meniť ho tu nemá zmysel —
  pri najbližšom zostavení sa prepíše.

  Odkaz na túto stránku skladá aplikácia (konštanta VYSTUP_BASE) a posiela ho
  klientovi e-mailom cez Boldem.
-->
"""

HLAVICKA = """<!--
  ČIARA ŽIVOTA — aplikácia pre stránku Stratégia privátnej renty
  ================================================================
  POZOR: tento súbor je vygenerovaný skriptom zostav.py z master súboru.
  Needituj ho priamo — zmeny sa pri najbližšom zostavení stratia.
  Uprav master, spusti `python3 zostav.py`, commitni a zvýš ?v=… v code bloku stránky.

  Vkladá sa do Squarespace cez <iframe> v code bloku stránky.
  Obsahuje IBA aplikáciu: čiaru života s kartami, odoslanie modelácie,
  sekciu "Ak chcete ísť ďalej", použité predpoklady a disclaimer.

  ČO TU ZÁMERNE NIE JE a prečo:
    · úvodné texty a hero obraz  → zostávajú v Squarespace nad iframe,
      pretože audio prehrávač (adam-player.js) sa zachytáva o kotvu v úvode.
      Presunom sem by stratil svoj bod ukotvenia.
    · audio prehrávač            → dodáva ho adam-player.js z repozitára
      hechtgit/adam-audio, vkladá sa sám. Nikdy ho sem nekopírovať —
      vznikli by dva prehrávače.
    · hlavička a pätička webu    → má ich Squarespace.

  POMENOVANIE míľnikov (Dnes / Začiatok čerpania / Koniec čerpania) je
  zhodné s výsledkovou stránkou modelácie, PDF a scenárom pre audio.
  Pri zmene ho treba zmeniť vo všetkých štyroch výstupoch naraz.

  index.html vedľa je pôvodná verzia kalkulačky — nemeniť, drží živú stránku.
-->
"""

# Bloky, ktoré na stránke dodáva Squarespace. Každý sa musí nájsť práve raz —
# ak sa v masteri premenujú, zostavenie radšej spadne, než by ticho nasadilo úvod dvakrát.
ODSTRAN = [
    (r'<header class="site-top">.*?</header>\n', 'hlavička webu'),
    (r'<section class="intro-lead">.*?</section>\n', 'úvod s hero obrazom'),
    (r'<article class="intro">.*?</article>\n', 'popis aplikácie a audio'),
    (r'<div class="calculator-divider"[^>]*></div>\n', 'oddeľovač nad aplikáciou'),
]

CSS_EMBED = 'html.embedded,body.embedded{overflow:hidden;background:transparent}\n'
CSS_KOTVA = '[hidden]{display:none!important}\n'

SKRIPT_EMBED = """
<script>
/* ---- Vloženie do Squarespace: hlásenie výšky rodičovi ----
   Iframe nemá vlastný scroll — o výšku sa stará rodičovská stránka. Aplikácia jej
   po každej zmene rozmeru pošle svoju skutočnú výšku a drží sa na začiatku, aby
   vnorené posúvanie nebralo scroll celej stránke. */
(()=>{
  if(window.parent===window) return;
  const lockScroll=()=>{
    try{ history.scrollRestoration='manual' }catch(e){}
    if(window.scrollX!==0||window.scrollY!==0) window.scrollTo(0,0);
  };
  const notify=()=>requestAnimationFrame(()=>{
    lockScroll();
    const h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,
                     document.body.offsetHeight,document.documentElement.offsetHeight);
    window.parent.postMessage({type:'ph-renta-height',height:Math.ceil(h),
      scrollY:Math.round(window.scrollY),h1Top:null},'*');
  });
  document.documentElement.classList.add('embedded');
  document.body.classList.add('embedded');
  lockScroll();
  addEventListener('pageshow',lockScroll);
  addEventListener('scroll',lockScroll,{passive:true});
  addEventListener('load',notify);
  addEventListener('resize',()=>{window.scrollTo(0,0);notify()});
  if('ResizeObserver' in window) new ResizeObserver(notify).observe(document.body);
  [0,100,500,1500,3000].forEach(ms=>setTimeout(notify,ms));
  setInterval(notify,1500);
})();
</script>
"""


def zostav(master: Path) -> str:
    s = master.read_text(encoding='utf-8')

    if CSS_KOTVA not in s:
        sys.exit('CHYBA: v masteri chýba kotva pre CSS vloženia (' + CSS_KOTVA.strip() + ')')
    s = s.replace(CSS_KOTVA, CSS_KOTVA + CSS_EMBED, 1)

    for vzor, popis in ODSTRAN:
        s, n = re.subn(vzor, '', s, flags=re.S)
        if n != 1:
            sys.exit(f'CHYBA: blok „{popis}" sa v masteri našiel {n}×, očakával sa práve raz.')

    if '</body>' not in s:
        sys.exit('CHYBA: v masteri chýba </body>')
    s = s.replace('</body>', SKRIPT_EMBED + '</body>', 1)

    # Poistka: to, čo dodáva Squarespace, sa sem nesmie dostať ani okľukou.
    # Kontrolujú sa značky, nie názvy tried — CSS pre odstránené sekcie v štýle
    # pokojne zostáva, spoločný štýl s masterom je zámer. Beží pred vložením
    # hlavičky, tá tieto názvy sama spomína v texte.
    for zakazane, popis in [('adam-player', 'audio prehrávač'),
                            ('<section class="intro-lead"', 'úvod s hero obrazom'),
                            ('<header class="site-top"', 'hlavička webu')]:
        if zakazane in s:
            sys.exit(f'CHYBA: vo výstupe zostal „{popis}" ({zakazane}) — patrí do Squarespace.')

    prve = s.index('\n') + 1                      # za <!doctype html>
    return s[:prve] + HLAVICKA + s[prve:]


def vystrihni_jadro(s: str) -> str:
    """Vráti kód medzi značkami JADRO — spoločnú matematiku aplikácie a modelácie."""
    try:
        i = s.index(JADRO_OD)
        j = s.index(JADRO_PO, i)
    except ValueError:
        sys.exit(f'CHYBA: v masteri chýbajú značky {JADRO_OD}… / {JADRO_PO}')
    jadro = s[i:j + len(JADRO_PO)]
    for musi_byt in ('function compute(', 'const S=', 'applyScenarioFromUrl()'):
        if musi_byt not in jadro:
            sys.exit(f'CHYBA: v jadre chýba „{musi_byt}" — sedia značky JADRO?')
    # Jadro sa vkladá do stránky, ktorá nemá DOM aplikácie. Dotyk DOM by tam spadol.
    for zakazane in ('document.', 'window.', '$('):
        if zakazane in jadro:
            sys.exit(f'CHYBA: jadro sa dotýka „{zakazane}" — musí byť bez DOM, '
                     'inak modelácia spadne.')
    return jadro


def zostav_vysledok(jadro: str) -> str:
    if not VYSLEDOK_MASTER.is_file():
        sys.exit(f'CHYBA: chýba {VYSLEDOK_MASTER}')
    s = VYSLEDOK_MASTER.read_text(encoding='utf-8')
    if s.count(JADRO_MIESTO) != 1:
        sys.exit(f'CHYBA: {VYSLEDOK_MASTER.name} musí obsahovať práve jedno {JADRO_MIESTO}')
    s = s.replace(JADRO_MIESTO, jadro, 1)
    prve = s.index('\n') + 1                      # za <!doctype html>
    return s[:prve] + VYSLEDOK_HLAVICKA + s[prve:]


if __name__ == '__main__':
    master = Path(sys.argv[1]) if len(sys.argv) > 1 else MASTER
    if not master.is_file():
        sys.exit(f'CHYBA: master súbor neexistuje: {master}')

    zdroj = master.read_text(encoding='utf-8')
    out = zostav(master)
    VYSTUP.write_text(out, encoding='utf-8')
    print(f'OK {VYSTUP.name} ({len(out)} B) ← {master.name}')

    jadro = vystrihni_jadro(zdroj)
    vys = zostav_vysledok(jadro)
    VYSLEDOK.write_text(vys, encoding='utf-8')
    print(f'OK {VYSLEDOK.name} ({len(vys)} B) ← {VYSLEDOK_MASTER.name} + jadro ({len(jadro)} B)')
