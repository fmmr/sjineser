/** All user-visible Norwegian text. */
export const t = {
  appName: 'Sjineser',
  homeLink: 'Sjineser, til forsiden',
  theme: { light: 'Lyst tema' },
  tabs: { play: 'Spill', stats: 'Statistikk' },
  loading: 'Laster …',
  offline: 'Får ikke kontakt med serveren. Viser lagrede data.',

  noNights: 'Ingen kvelder ennå.',
  nightOf: (date) => `Kveld ${date}`,
  continueNight: 'Fortsett kvelden',
  newNight: 'Ny kveld',
  nightAlreadyStarted: 'Kvelden i dag er allerede startet.',

  choosePlayers: 'Hvem spiller i kveld?',
  newPlayerPlaceholder: 'Ny spiller',
  addPlayer: 'Legg til',
  startNight: 'Start kvelden',
  minPlayers: (n, min) => `Velg minst ${min} spillere (${n} valgt)`,

  newMatch: 'Ny kamp',
  pickTeams: 'Trykk på en spiller for å flytte: benk → Lag A → Lag B',
  sides: { bench: 'Benk', A: 'Lag A', B: 'Lag B' },
  startMatch: 'Start kampen',
  abandon: {
    title: 'Avbryte kampen?',
    message: (a, b) => `Kampen står ${a}–${b}. Den blir avbrutt, og en ny kamp startes.`,
    confirm: 'Avbryt og start ny',
    cancel: 'Fortsett kampen',
  },

  matchTitle: (n) => `Kamp ${n}`,
  noMatch: 'Ingen kamp i gang.',
  results: { A: 'Lag A vant', D: 'Uavgjort', B: 'Lag B vant' },
  resultShort: { A: 'A', D: 'U', B: 'B' },
  draws: (n) => `Uavgjort: ${n}`,
  undo: 'Angre',
  and: ' og ',
  matchWon: (names, wins, losses) => `${names} vinner ${wins}–${losses}!`,
  nextMatch: 'Neste kamp',

  unsynced: (n) => `${n} ikke lagret`,
  pinNeeded: 'PIN trengs',
  pin: { title: 'PIN', message: 'Skriv inn PIN for å lagre resultater', label: 'PIN', save: 'Lagre' },
  sheet: { cancel: 'Avbryt' },
  matchTaken: (n) => `Noen andre startet kamp ${n}. Henter siste data.`,
  rejected: { conflict: 'En endring kolliderte med data fra en annen telefon. Henter siste data.', invalid: 'En endring ble avvist. Henter siste data.' },

  errors: {
    empty: 'Skriv inn et navn',
    comma: 'Navn kan ikke inneholde komma',
    plus: 'Navn kan ikke inneholde +',
    duplicate: 'Spilleren finnes allerede',
    invalid: 'Ugyldig valg',
    conflict: 'Kolliderer med eksisterende data',
    noNight: 'Start en kveld først',
    noMatch: 'Ingen kamp i gang',
    nothingToUndo: 'Ingenting å angre',
  },

  proposal: {
    bench: (names, reason) => `Står over: ${names} – ${reason}`,
    benchPlain: (names) => `Står over: ${names}`,
    split: (rule) => `Lagforslag: ${rule.toLowerCase()}`,
    splitTie: 'Lagforslag: alle oppsett er like gode',
    useProposal: 'Bruk forslaget',
  },
  ratingLabel: (rating, provisional) => (provisional ? `${rating} · ny` : String(rating)),

  rules: {
    fewestTonight: { title: 'Færrest kamper i kveld', description: 'De som har spilt færrest kamper i kveld, spiller først.', benchReason: 'har spilt flest kamper i kveld' },
    mostSitOutsSeason: { title: 'Flest ganger på benken', description: 'Ved likhet spiller de som har stått over flest kamper denne sesongen.', benchReason: 'har stått over færrest ganger denne sesongen' },
    longestSinceLastPlayed: { title: 'Lengst siden sist', description: 'Ved likhet spiller de som har ventet lengst siden forrige kamp i kveld.', benchReason: 'spilte sist' },
    alphabetical: { title: 'Alfabetisk', description: 'Til slutt avgjøres det alfabetisk, så forslaget alltid blir det samme.', benchReason: 'avgjort alfabetisk' },
    newPartners: { title: 'Nye makkere', description: 'Oppsett der noen allerede har vært makkere i kveld, unngås. Slik spiller alle med alle.' },
    balance: {
      title: 'Jevne lag',
      description: ({ tolerance }) => `Oppsettet med minst forskjell i lagrating velges. Forskjellen rundes ned til nærmeste ${tolerance} poeng, så små forskjeller teller likt.`,
    },
    seasonVariety: { title: 'Variasjon', description: 'Par som sjelden har spilt sammen denne sesongen, foretrekkes.' },
  },

  about: {
    teamsLink: 'Slik foreslås lag',
    teamsTitle: 'Slik foreslås lag',
    teamsIntro: 'Før hver kamp foreslår appen lag. Du kan alltid endre forslaget ved å trykke på spillerne.',
    benchHeading: '1. Hvem spiller',
    benchIntro: 'Gjelder bare når flere enn fire er med. Reglene brukes i rekkefølge; neste regel avgjør bare ved likhet.',
    splitHeading: '2. Hvem spiller sammen',
    splitIntro: 'De tre mulige lagoppsettene sammenlignes regel for regel, i denne rekkefølgen.',
    ratingLink: 'Slik fungerer rating',
    ratingTitle: 'Slik fungerer rating',
    ratingParagraphs: ({ START, K, SCALE, PROVISIONAL_GAMES }) => [
      `Alle starter på ${START} poeng. Ratingen oppdateres etter hvert spill, også i kamper som ikke ble spilt ferdig.`,
      'Et lags rating er snittet av de to spillerne. Før hvert spill regnes det ut hvor sannsynlig det er at laget vinner, ut fra forskjellen i rating.',
      `Seier teller 1, uavgjort ½ og tap 0. Endringen er ${K} × (resultat − forventet), og begge på laget får samme endring. Uavgjort mot et sterkere lag gir derfor poeng.`,
      `Med ${SCALE} poeng i forskjell er det sterke laget forventet å vinne omtrent 10 av 11 spill.`,
      `De første ${PROVISIONAL_GAMES} spillene er ratingen foreløpig og merket «ny».`,
    ],
  },

  /**
   * Per stat plugin id: { title, description? }. A description may be a function of the shared
   * params in views/stats/description-params.js ({ minGames, provisionalGames, … }).
   * The stats contract test requires a title for every stat.
   */
  stats: {
    leaderboard: { title: 'Rangering', description: 'Rating etter siste spill i perioden, og endring i perioden.' },
    nightsCount: { title: 'Kvelder' },
    matchesCount: { title: 'Kamper' },
    gamesCount: { title: 'Spill' },
    drawRate: { title: 'Uavgjort-andel' },
    longestMatch: { title: 'Lengste kamp', description: 'Flest spill i én kamp.' },
    longestDrawStreak: { title: 'Lengste uavgjort-rekke', description: 'Flest uavgjorte spill på rad samme kveld.' },
    cleanSweeps: { title: 'Rene seire (3–0)', description: 'Kamper vunnet 3–0 uten uavgjort.' },
    comebacks: { title: 'Comebacks (0–2 → 3–2)', description: 'Kamper vunnet 3–2 etter å ha ligget under 0–2.' },
    biggestUpset: { title: 'Største overraskelse', description: 'Største forskjell i lagrating før spillet, vunnet av det svakeste laget.' },
    rating: { title: 'Rating' },
    eloChart: { title: 'Rating over tid' },
    gamesWdl: { title: 'Spill' },
    gameWinRate: { title: 'Seier i spill' },
    matchesWdl: { title: 'Kamper', description: 'Bare ferdigspilte kamper.' },
    matchWinRate: { title: 'Seier i kamper', description: 'Bare ferdigspilte kamper.' },
    streaks: { title: 'Rekker' },
    partners: { title: 'Makkere' },
    opponents: { title: 'Motstandere' },
    bestPartner: { title: 'Beste makker', description: ({ minGames }) => `Høyest seiersandel, minst ${minGames} spill sammen.` },
    nemesis: { title: 'Erkefiende', description: ({ minGames }) => `Lavest seiersandel mot, minst ${minGames} spill.` },
    pairsTable: { title: 'Alle par' },
    pairVsPairs: { title: 'Mot andre par' },
    togetherWdl: { title: 'Sammen' },
    againstWdl: { title: 'Mot hverandre' },
  },
  /** Label cells in stat tables (format 'label'). */
  statsLabels: { streak_win: 'Seire', streak_unbeaten: 'Ubeseiret', streak_loss: 'Tap' },
  /** Stat table headers by column key; W/D/L also label win/draw/loss counts. */
  statsColumns: {
    rank: '#', player: 'Spiller', rating: 'Rating', change: 'Endring', games: 'Spill',
    partner: 'Makker', opponent: 'Motstander', pair: 'Par',
    W: 'S', D: 'U', L: 'T', winRate: 'Seier %',
    kind: 'Rekke', current: 'Nå', longest: 'Lengst',
  },
  /** Section headings on the stats pages. */
  statsSections: {
    leaderboard: 'Rangering',
    summary: 'Oppsummering',
    records: 'Rekorder',
    rating: 'Rating',
    results: 'Resultater',
    streaks: 'Rekker',
    people: 'Makkere og motstandere',
    pairs: 'Par',
    versus: 'Mot andre par',
    sideBySide: 'Side om side',
    overlay: 'Over tid',
    headToHead: 'Sammen og mot hverandre',
  },
  statsUi: {
    title: 'Statistikk',
    noData: 'Ikke nok data',
    provisional: 'ny',
    pair: (a, b) => `${a} & ${b}`,
    versus: 'mot',
    seasonLabel: 'Periode',
    thisSeason: 'Denne sesongen',
    allSeasons: 'Alle sesonger',
    season: ({ year, half }) => (half === 1 ? `Vår ${year}` : `Høst ${year}`),
    pairsLink: 'Alle par',
    back: '← Statistikk',
    compareWith: 'Sammenlign med …',
    notFound: 'Fant ikke dette i dataene.',
  },

  sandbox: { label: 'TESTMODUS', reset: 'Nullstill', resetConfirm: 'Tilbakestille testdataene?', resetMessage: 'Testdataene genereres på nytt, og endringer i testmodus forsvinner.', exit: 'Avslutt', date: 'Dato' },
};

const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const longDateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });

/** @param {string} iso YYYY-MM-DD @returns {Date} local midnight */
function localDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "2026-10-14" → "14. okt." */
export const formatDate = (iso) => dateFormat.format(localDate(iso));

/** "2025-10-14" → "14. okt. 2025" */
export const formatDateLong = (iso) => longDateFormat.format(localDate(iso));
