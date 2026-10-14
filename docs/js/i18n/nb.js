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
    bench: (names, rule) => `Står over: ${names} (${rule.toLowerCase()})`,
    split: (rule) => `Lagforslag: ${rule.toLowerCase()}`,
    splitTie: 'Lagforslag: alle oppsett er like gode',
    useProposal: 'Bruk forslaget',
  },
  provisional: 'ny',

  rules: {
    fewestTonight: { title: 'Færrest kamper i kveld', description: 'De som har spilt færrest kamper i kveld, spiller først.' },
    mostSitOutsSeason: { title: 'Flest ganger på benken', description: 'Ved likhet spiller de som har stått over flest kamper denne sesongen.' },
    longestSinceLastPlayed: { title: 'Lengst siden sist', description: 'Ved likhet spiller de som har ventet lengst siden forrige kamp i kveld.' },
    alphabetical: { title: 'Alfabetisk', description: 'Til slutt avgjøres det alfabetisk, så forslaget alltid blir det samme.' },
    newPartners: { title: 'Nye makkere', description: 'Oppsett der noen allerede har vært makkere i kveld, unngås. Slik spiller alle med alle.' },
    balance: {
      title: 'Jevne lag',
      description: ({ tolerance }) => `Oppsettet med minst forskjell i lagrating velges. Forskjeller under ${tolerance} poeng regnes som like.`,
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
};

const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });

/** "2026-10-14" → "14. okt." */
export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return dateFormat.format(new Date(year, month - 1, day));
}
