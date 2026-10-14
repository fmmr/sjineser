import { MIN_GAMES_TOGETHER } from '../domain/stats/constants.js';

/** All user-visible Norwegian text. */
export const t = {
  appName: 'Sjineser',
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
  abandonConfirm: (a, b) => `Kampen står ${a}–${b}. Avbryte den og starte en ny?`,

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
  enterPin: 'Skriv inn PIN for å lagre resultater',
  matchTaken: (n) => `Noen andre startet kamp ${n}. Henter siste data.`,
  rejected: { conflict: 'En endring kolliderte med data fra en annen telefon. Henter siste data.', invalid: 'En endring ble avvist. Henter siste data.' },

  errors: {
    empty: 'Skriv inn et navn',
    comma: 'Navn kan ikke inneholde komma',
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

  statsComingSoon: 'Statistikk kommer snart.',
  /** Per stat plugin id: { title, description? }. The stats contract test requires a title for every stat. */
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
    bestPartner: { title: 'Beste makker', description: `Høyest seiersandel, minst ${MIN_GAMES_TOGETHER} spill sammen.` },
    nemesis: { title: 'Erkefiende', description: `Lavest seiersandel mot, minst ${MIN_GAMES_TOGETHER} spill.` },
    pairsTable: { title: 'Alle par' },
    pairVsPairs: { title: 'Mot andre par' },
    togetherWdl: { title: 'Sammen' },
    againstWdl: { title: 'Mot hverandre' },
  },
  /** Label cells in stat tables (format 'label'). */
  statsLabels: { streak_win: 'Seire', streak_unbeaten: 'Ubeseiret', streak_loss: 'Tap' },

  sandbox: { label: 'TESTMODUS', reset: 'Nullstill', resetConfirm: 'Tilbakestille testdataene?', exit: 'Avslutt', date: 'Dato' },
};

const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });

/** "2026-10-14" → "14. okt." */
export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return dateFormat.format(new Date(year, month - 1, day));
}
