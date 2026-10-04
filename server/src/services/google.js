const { OAuth2Client } = require('google-auth-library');
const config = require('../config');
const { ApiError } = require('../middleware/errors');

let client = null;

/**
 * Verifies a Google Identity Services ID token (a JWT signed by Google):
 * signature against Google's public keys, issuer, expiry, and that the
 * audience is our OAuth client ID. Returns the token payload.
 */
async function verifyGoogleIdToken(idToken) {
  if (!config.google.clientId) throw new ApiError(503, 'Google sign-in is not configured on the server');
  if (!idToken || typeof idToken !== 'string') throw new ApiError(400, 'Missing Google credential');
  client ??= new OAuth2Client(config.google.clientId);
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: config.google.clientId });
    return ticket.getPayload();
  } catch {
    throw new ApiError(401, 'Google sign-in could not be verified. Please try again.');
  }
}

module.exports = { verifyGoogleIdToken };
