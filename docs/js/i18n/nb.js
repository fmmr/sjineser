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

  statsComingSoon: 'Statistikk kommer snart.',
};

const dateFormat = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });

/** "2026-10-14" → "14. okt." */
export function formatDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return dateFormat.format(new Date(year, month - 1, day));
}
