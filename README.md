# Sjineser 🂡

Webapp for kortspillet sjineser: registrer resultater ved bordet og se statistikk, Elo-rating og sammenligninger.

**https://sjineser.rodland.no**

- Mobil først, fungerer offline og kan installeres som app (iPhone: Safari → Del → «Legg til på Hjem-skjerm»; Android: Chrome → ⋮ → «Installer app»).
- Lagforslag før hvert sett (alle med alle, jevne lag), 2 mot 2, 3 mot 2 og 3 mot 3.
- Statistikk som små, utskiftbare moduler (plugins).
- Testmodus (`?sandbox`, eller under «Mer») med genererte data – rører aldri de ekte dataene.

## Slik er det bygget

- **Ren HTML/CSS/JavaScript** (ES-moduler), ingen byggesteg og ingen avhengigheter i appen. Det som ligger i `docs/` er det som kjører.
- **Data i et Google-regneark**, bak et lite Apps Script-API (`apps-script/Code.js`). Lesing er åpen; endringer krever en delt PIN.
- **Publisert med GitHub Pages** fra `docs/` på `main`.

```
docs/            appen (publiseres)
  js/domain/     ren logikk: regler, Elo, lagforslag, statistikk
  js/state/      kø for endringer (offline), store, handlinger
  js/api/        kontakt med Apps Script
  js/views/      skjermbilder
apps-script/     backend (Google Apps Script)
scripts/         stamp (versjon/offline-cache) og import av historikk
tests/           tester (node --test)
design/          spesifikasjon, planer og idéliste
```

Detaljert design: `design/specs/2026-10-14-sjineser-design.md`.

## Utvikling

Krever Node 22+ (bare for tester og skript) og Python 3 (lokal server).

```bash
npm test          # alle tester
npm run serve     # lokal server på http://localhost:8000
npm run stamp     # oppdater versjon og offline-cache etter endringer i docs/ (testene minner deg på det)
```

**Ny statistikk:** én fil i `docs/js/domain/stats/catalog/`, én linje i `registry.js`, tekst i `docs/js/i18n/nb.js` og id-en i en sideliste i `docs/js/views/stats/pages.js`. Se `design/stats-ideas.md`.

## Backend og PIN

- Apps Script-prosjektet pushes med [clasp](https://github.com/google/clasp) fra `apps-script/` (`clasp push`, deretter `clasp create-deployment -i <deployment-id>`).
- `SHEET_ID` og `PIN` ligger i prosjektets **Script properties** (Project Settings), ikke i koden.
- `setup()` lager arkfanene; `resetAllData()` sletter alle data (brukes bare ved migrering).
