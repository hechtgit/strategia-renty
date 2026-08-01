#!/usr/bin/env python3
"""Zostaví cara-zivota.html (verziu pre iframe) z master súboru aplikácie.

Master súbor je samostatná stránka — dá sa otvoriť priamo v prehliadači aj s úvodom
a hero obrazom, takže sa v ňom pohodlne pracuje. Do Squarespace sa ale vkladá cez
iframe, kde úvod, hero aj audio dodáva samotná stránka. Tento skript preto z mastera
odstráni všetko, čo patrí Squarespace, a doplní hlásenie výšky rodičovskému oknu.

Použitie:
    python3 zostav.py [cesta/k/masteru.html]

Bez argumentu si vezme cestu z premennej MASTER nižšie. Po zostavení treba súbor
commitnúť a v code bloku stránky zvýšiť ?v=… (cache-buster), inak si prehliadače
podržia starú verziu.
"""
import re
import sys
from pathlib import Path

MASTER = Path('/Users/hecht/.codex/visualizations/2026/07/31/'
              '019fb8e0-fb5d-7a72-a1b6-68903debfb3f/cara-zivota-codex-21-brand.html')
VYSTUP = Path(__file__).with_name('cara-zivota.html')

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


if __name__ == '__main__':
    master = Path(sys.argv[1]) if len(sys.argv) > 1 else MASTER
    if not master.is_file():
        sys.exit(f'CHYBA: master súbor neexistuje: {master}')
    out = zostav(master)
    VYSTUP.write_text(out, encoding='utf-8')
    print(f'OK {VYSTUP} ({len(out)} B) ← {master.name}')
