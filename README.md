# Sjineser 🂡

Webapp for kortspillet sjineser: registrer resultater ved bordet og se statistikk, Elo-rating og sammenligninger.

**https://sjineser.rodland.no**

- Mobil først, fungerer offline og kan installeres som app (iPhone: Safari → Del → «Legg til på Hjem-skjerm»; Android: Chrome → ⋮ → «Installer app»).
- Lagforslag før hvert sett (alle med alle, jevne lag), 2 mot 2, 3 mot 2 og 3 mot 3.
- Statistikk som små, utskiftbare moduler (plugins).
- Testmodus (`?sandbox`, eller under «Mer») med genererte data – rører aldri de ekte dataene.
- Flere ligaer: hver gruppe har sitt eget regneark og sin egen PIN, og man bytter under «Mer → Ligaer» (se `design/specs/…` §19 og «Ny liga» under).

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
- `setup()` forbereder hovedligaens ark; `resetAllData()` sletter alle data i hovedligaen, men beholder ligaens navn (brukes bare ved migrering). `authorize()` godkjenner tjenestene appen trenger (også tillatelsen til tidsutløsere) og logger hvilke ligaer som er registrert (bare id og navn) og hvor mange `sendBackups`-utløsere som finnes (0 = ikke installert).

### Ligaer

Én Apps Script-deployment kan betjene flere uavhengige **ligaer** (grupper av spillere). Hver liga har sitt eget Google-regneark og sin egen PIN.

- **Hver liga, hovedligaen inkludert, er én Script property** `LEAGUE_<id>` (`LEAGUE_main` for hovedligaen) med JSON-verdi: `{"name":"Familie","sheetId":"<regneark-id>","pin":"<pin>"}`. `sheetId` og `pin` må være ikke-tomme tekster, ellers regnes ligaen som ukjent (det samme gjelder en liga som ikke er registrert). Script properties gjelder appen som helhet; ligaens egne innstillinger ligger i arket (se «Navn» under). Forespørsler uten liga går til hovedligaen (`LEAGUE_main`), så gamle klienter virker som før. Eldre installasjoner må ha `LEAGUE_main` (opprettet én gang av den fjernede funksjonen `migrateMainLeague()`); egenskapene `SHEET_ID`, `PIN` og `NAME` leses ikke lenger. En ugyldig registrering logges som feilet av `prepareLeagues()`.
- **Navn:** `name` i registreringen er valgfritt og bare startverdien (standard er id-en, `Sjineser` for hovedligaen). Navnet som gjelder står i arkets fane **Settings** (`key`, `value`, én innstilling per rad; i dag bare raden `name`). Klargjøringen legger inn raden hvis den mangler og overskriver aldri et eksisterende navn; et tomt navn regnes som fraværende. Navnet endres med skrivehandlingen `setLeagueName` (PIN kreves, 1–40 tegn, ingen linjeskift eller kontrolltegn) eller direkte i arket. Bare kjente nøkler leses, og fanen sendes aldri ut som helhet.
- **Liga-id** er små bokstaver, tall og `-`, 3–40 tegn, og må starte med bokstav eller tall (`/^[a-z0-9][a-z0-9-]{2,39}$/`). `main` er hovedligaen. Appen velger liga med `?l=<id>` (GET) eller `league` i POST-kroppen. Ukjent eller ugyldig id gir feilen `Unknown league`.
- PIN-en sjekkes mot den ligaens PIN alene: hovedligaens PIN virker ikke i en annen liga, og omvendt.
- **Oppsett av ny liga:** lag et tomt regneark, del det med kontoen som eier scriptet (redigeringstilgang), legg inn `LEAGUE_<id>`, og kjør `prepareLeagues()` fra editoren. Den lager fanene og setter overskrifter og formler; tittelen på regnearket endres ikke (det krever full Drive-tilgang), så gi det gjerne navnet `sjineser_league` selv. Den logger én linje per liga (id, navn, tittel, antall spillere) og hopper videre hvis én liga er ødelagt.
- **Skjema er lazy og versjonert:** `SCHEMA_<id>` (`SCHEMA_main` for hovedligaen) husker hvilken `SCHEMA_VERSION` arket sist ble klargjort for. Er den bak, klargjør første forespørsel arket én gang (under låsen) og lagrer versjonen; ellers leses bare denne ene egenskapen. Endrer vi arkoppsettet, øker vi `SCHEMA_VERSION` i `Code.js` (versjon 2 la til fanen Settings, så hver liga klargjøres på nytt én gang ved neste bruk).
- **Kveldsoppsummering på e-post:** sendes fra eierens konto (`To` = eier, `CC` = spillerne), i andre ligaer med ligaens navn (fra Settings) som avsender. Maks 3 ekte utsendelser per dag **per liga** (`SUMMARY_SENDS` for hovedligaen, `SUMMARY_SENDS_<id>` for de andre). Testutsending til én spiller finnes bare i hovedligaen. Spillere uten gyldig adresse hoppes over; svaret sier hvor mange som fikk den (`recipients`) og hvor mange aktive som manglet adresse (`missing`).
- **Sikkerhetskopi og gjenoppretting:** skrivehandlingen `exportData` (PIN kreves) gir ligaens hele data som én JSON-fil (`format: "sjineser-backup"`, `version: 1`), **med spillernes e-postadresser**, derfor krever den PIN, i motsetning til vanlig lesing. `restoreData({ backup })` leser en slik fil inn i en **tom** liga (ingen rader i Players, Nights, Matches eller Games; ellers `conflict` / `League is not empty`). Hele filen valideres med de vanlige skrivereglene før noe skrives (ellers `invalid` med en kort grunn), og navnet i Settings røres ikke. Maks 500 spillere, 2000 kvelder, 10000 sett og 60000 spill.
- **Ukentlig sikkerhetskopi på e-post:** `sendBackups()` sender én e-post til eieren av scriptet (og bare eieren, fordi kopiene har e-postadresser) med én JSON-fil per registrert liga og en tekst med antall spillere, kvelder, sett og spill per liga, eller «feilet: …» for en liga som ikke lot seg lese. Kjør `installBackupTrigger()` fra editoren én gang for å få den hver mandag mellom 06 og 07 (den er idempotent); `removeBackupTrigger()` fjerner den. Kjør `authorize()` først etter oppdateringen, slik at Google ber om tillatelsen til tidsutløsere. Disse funksjonene ligger ikke i `HANDLERS`, så nettet kommer ikke til dem.
