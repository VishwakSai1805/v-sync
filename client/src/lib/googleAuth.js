// Google Sign-In via the OpenID Connect redirect flow (response_type=id_token).
//
// Why redirect instead of Google's embedded button: the embedded button lives in
// a third-party iframe from accounts.google.com, which ad blockers and strict
// tracking protection often block, leaving a button that does nothing. A
// top-level redirect to Google's own sign-in page is never blocked.
//
// Flow: start() -> Google sign-in page -> back to /auth/callback#id_token=...
// The ID token is then sent to POST /api/auth/google, where the server verifies
// Google's signature, audience, expiry and hosted domain (same as before).

const STORE_KEY = 'vsync_google_oidc';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const randomString = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const callbackUrl = () => `${window.location.origin}/auth/callback`;

export function startGoogleSignIn(clientId) {
  // `state` protects against CSRF on the callback; `nonce` binds the ID token
  // to this sign-in attempt so a captured token can't be replayed.
  const state = randomString();
  const nonce = randomString();
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ state, nonce }));
  } catch {
    /* private mode: the callback will report the problem */
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
    // Hint Google to show Workspace (organisation) accounts; the server enforces the exact domains.
    hd: '*',
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

function decodeJwtPayload(jwt) {
  const part = jwt.split('.')[1] || '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const json = decodeURIComponent(
    Array.from(atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
  );
  return JSON.parse(json);
}

/** Reads and validates the redirect result. Returns the ID token or throws a readable error. */
export function readGoogleCallback(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }

  const error = params.get('error');
  if (error) {
    if (error === 'access_denied') throw new Error('Google sign-in was cancelled.');
    throw new Error(`Google sign-in failed (${error}).`);
  }
  const idToken = params.get('id_token');
  if (!idToken) throw new Error('No sign-in result received from Google. Please try again.');
  if (!saved || saved.state !== params.get('state')) {
    throw new Error('This sign-in link is invalid or has expired. Please start again from the sign-in page.');
  }
  let payload;
  try {
    payload = decodeJwtPayload(idToken);
  } catch {
    throw new Error('Google returned an unreadable sign-in token.');
  }
  if (payload.nonce !== saved.nonce) throw new Error('Sign-in verification failed. Please try again.');
  return idToken;
}
