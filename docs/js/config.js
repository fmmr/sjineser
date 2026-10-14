/** Apps Script web app URL (public; the PIN is the secret). Empty → app runs offline-only. */
export const API_URL = 'https://script.google.com/macros/s/AKfycbxpv9FXkBnnYOSRVSkzz_oUzzYLrsMTP9WCjbLf-GVz95eU8xwq9B7q2ZN8ALiEquVi/exec';

/** How often an open match screen checks for results entered on other phones. */
export const POLL_MS = 5000;

/** Ignore a second tap on the match screen this soon after the first, so a double tap does not record two games. */
export const TAP_COOLDOWN_MS = 800;

/** Shorter in sandbox mode, where test data is entered quickly on purpose. */
export const SANDBOX_TAP_COOLDOWN_MS = 150;

/** Source code (about page). */
export const REPO_URL = 'https://github.com/fmmr/sjineser/';

/** The Google Sheet holding the data (about page); opens only for people it is shared with. */
export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/170on0ejd0VDtE9G3fg8fNirwNvpRsbzm6odd-EuA7Wk/edit';
