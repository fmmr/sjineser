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
- Alt som er hemmelig ligger i prosjektets **Script properties** (Project Settings), ikke i koden.
- `setup()` forbereder hovedligaens ark; `resetAllData()` sletter alle data i hovedligaen (brukes bare ved migrering). `authorize()` godkjenner tjenestene appen trenger og logger hvilke ligaer som er registrert (bare id og navn).

### Ligaer

Én Apps Script-deployment kan betjene flere uavhengige **ligaer** (grupper av spillere). Hver liga har sitt eget Google-regneark og sin egen PIN.

- **Hovedligaen** er den vi alltid har hatt: `SHEET_ID` (regnearkets id) og `PIN`, valgfritt `NAME` (visningsnavn, standard `Sjineser`). Forespørsler uten liga går hit, så gamle klienter virker som før.
- **Andre ligaer** registreres ved å legge inn en Script property `LEAGUE_<id>` med JSON-verdi: `{"name":"Familie","sheetId":"<regneark-id>","pin":"<pin>"}`. Alle tre feltene må være ikke-tomme tekster, ellers regnes ligaen som ukjent.
- **Liga-id** er små bokstaver, tall og `-`, 3–40 tegn, og må starte med bokstav eller tall (`/^[a-z0-9][a-z0-9-]{2,39}$/`). `main` er hovedligaen. Appen velger liga med `?l=<id>` (GET) eller `league` i POST-kroppen. Ukjent eller ugyldig id gir feilen `Unknown league`.
- PIN-en sjekkes mot den ligaens PIN alene: hovedligaens PIN virker ikke i en annen liga, og omvendt.
- **Oppsett av ny liga:** lag et tomt regneark, del det med kontoen som eier scriptet (redigeringstilgang), legg inn `LEAGUE_<id>`, og kjør `prepareLeagues()` fra editoren. Den lager fanene, setter overskrifter og formler og gir et regneark uten navn tittelen `sjineser_league` (en tittel du har valgt selv beholdes). Den logger én linje per liga (id, navn, tittel, antall spillere) og hopper videre hvis én liga er ødelagt.
- **Skjema er lazy og versjonert:** `SCHEMA_<id>` (`SCHEMA_main` for hovedligaen) husker hvilken `SCHEMA_VERSION` arket sist ble klargjort for. Er den bak, klargjør første forespørsel arket én gang (under låsen) og lagrer versjonen; ellers leses bare denne ene egenskapen. Endrer vi arkoppsettet, øker vi `SCHEMA_VERSION` i `Code.js`.
- **Kveldsoppsummering på e-post:** sendes fra eierens konto (`To` = eier, `CC` = spillerne), i andre ligaer med ligaens navn som avsender. Maks 3 ekte utsendelser per dag **per liga** (`SUMMARY_SENDS` for hovedligaen, `SUMMARY_SENDS_<id>` for de andre). Testutsending til én spiller finnes bare i hovedligaen. Spillere uten gyldig adresse hoppes over; svaret sier hvor mange som fikk den (`recipients`) og hvor mange aktive som manglet adresse (`missing`).
