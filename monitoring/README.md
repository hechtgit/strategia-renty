# Samoopravný dohľad na MacBooku Air

LaunchAgent každých šesť hodín spustí deterministické testy finančného jadra,
konzistencie výstupov, priameho zadávania a reálne browserové scenáre na desktope
aj mobile. Model sa pri úspešnom behu vôbec nepoužíva.

Po dvakrát reprodukovanom technickom zlyhaní vznikne izolovaný git worktree.
Codex v ňom smie opraviť iba jednoznačnú technickú chybu a musí pridať regresný
test. Nasadenie je možné iba vtedy, keď prejde celá lokálna sada a `origin/main`
sa medzitým nezmenil. Finančná metodika, CMA dáta, právne texty, formuláre,
bezpečnostné hranice a tento monitor sú z automatických opráv vylúčené.

Kontroly bežia nad **nasadenou revíziou** `origin/main` v samostatnom worktree
`~/.local/state/strategia-renty-self-heal/check-worktree`. Pracovná kópia
`~/strategia-renty` sa pri kontrole nemení (do 23. 9. 2026 sa testovala zastaraná
kópia a dohľad bol 22 dní červený bez toho, aby o tom niekto vedel).

Živé kontroly (`live-http`: stránka, aplikácia a relay; `live-browser`) bežia vždy,
aj keď zlyhá lokálna kontrola. Automatická oprava sa spustí najviac trikrát na tú
istú chybu nad tou istou revíziou; potom ostane `needs_attention` a čaká na človeka.

Pri prechode do chyby, pri trvajúcej chybe raz za 24 hodín a pri návrate do
poriadku príde správa do Telegramu (kanál `health`, cez
`~/NanoClaw/agent-bridge/workers/send_telegram.py`), bez osobných údajov.

Kontrola PDF porovnáva výstup so schváleným referenčným PDF (testovací scenár,
bez osobných údajov) v `~/.local/state/strategia-renty-self-heal/reference/modelacia-referencna.pdf`;
monitor ho odovzdá cez `RENTA_PDF_REFERENCE`.

Stav je uložený v `~/.local/state/strategia-renty-self-heal/state.json`.

Manuálne overenie:

```bash
python3 monitoring/air_self_heal.py --self-test
python3 monitoring/air_self_heal.py --no-repair
python3 monitoring/air_self_heal.py --live-http-probe
```
