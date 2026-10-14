/** Apps Script web app URL (public; the PIN is the secret). Empty → app runs offline-only. */
export const API_URL = 'https://script.google.com/macros/s/AKfycbxpv9FXkBnnYOSRVSkzz_oUzzYLrsMTP9WCjbLf-GVz95eU8xwq9B7q2ZN8ALiEquVi/exec';

/** How often an open match screen checks for results entered on other phones. */
export const POLL_MS = 5000;

/** Ignore a second tap on the match screen this soon after the first, so a double tap does not record two games. */
export const TAP_COOLDOWN_MS = 800;

/** Shorter in sandbox mode, where test data is entered quickly on purpose. */
export const SANDBOX_TAP_COOLDOWN_MS = 150;
