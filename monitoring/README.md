# Samoopravný dohľad na MacBooku Air

LaunchAgent každých šesť hodín spustí deterministické testy finančného jadra,
konzistencie výstupov, priameho zadávania a reálne browserové scenáre na desktope
aj mobile. Model sa pri úspešnom behu vôbec nepoužíva.

Po dvakrát reprodukovanom technickom zlyhaní vznikne izolovaný git worktree.
Codex v ňom smie opraviť iba jednoznačnú technickú chybu a musí pridať regresný
test. Nasadenie je možné iba vtedy, keď prejde celá lokálna sada a `origin/main`
sa medzitým nezmenil. Finančná metodika, CMA dáta, právne texty, formuláre,
bezpečnostné hranice a tento monitor sú z automatických opráv vylúčené.

Stav je uložený v `~/.local/state/strategia-renty-self-heal/state.json`.

Manuálne overenie:

```bash
python3 monitoring/air_self_heal.py --self-test
python3 monitoring/air_self_heal.py --no-repair
```
