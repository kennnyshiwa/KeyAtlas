/**
 * Generates an Apple OAuth client secret (JWT) signed with the .p8 private key.
 *
 * Apple requires a freshly generated JWT as the client_secret for every token exchange.
 * The JWT must be signed with ES256 and expire within 6 months.
 *
 * Required env vars:
 *   APPLE_TEAM_ID   — Your Apple Team ID (e.g. T7DZYJXJFV)
 *   APPLE_KEY_ID    — Your Sign in with Apple key ID (e.g. 96782UF7QH)
 *   APPLE_CLIENT_ID — The Services ID used for web OAuth (e.g. io.keyatlas.web)
 *   APPLE_PRIVATE_KEY — Contents of AuthKey_<KEY_ID>.p8, with literal \n for newlines
 *                       (or the file path can be read at build time via APPLE_PRIVATE_KEY_PATH)
 */

import { SignJWT, importPKCS8 } from "jose";

export async function generateAppleClientSecret(): Promise<string> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const privateKeyRaw = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !clientId || !privateKeyRaw) {
    throw new Error(
      "[apple-secret] Missing required env vars: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY"
    );
  }

  // Support both literal \n escape sequences and real newlines
  const privateKeyPem = privateKeyRaw.replace(/\\n/g, "\n");

  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  const now = Math.floor(Date.now() / 1000);
  // Apple allows a max of 6 months (15777000 seconds); use 5 months for safety
  const exp = now + 15777000;

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(privateKey);

  return jwt;
}
