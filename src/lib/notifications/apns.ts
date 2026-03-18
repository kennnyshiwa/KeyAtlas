import { createSign } from "node:crypto";
import * as http2 from "node:http2";

function b64url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/* APNS JWT is valid for up to 60 min; cache and refresh at 50 min */
let cachedJwt: { token: string; expiresAt: number } | null = null;

function makeJwt() {
  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!teamId || !keyId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now) return cachedJwt.token;

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  /* ES256 JWT requires raw (r||s) IEEE P1363 encoding, not DER */
  const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

  const token = `${signingInput}.${b64url(signature)}`;
  cachedJwt = { token, expiresAt: now + 50 * 60 };
  return token;
}

function apnsHost() {
  return process.env.APNS_USE_SANDBOX === "true"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
}

/* Persistent HTTP/2 session (APNS requires h2) */
let h2Session: http2.ClientHttp2Session | null = null;

function getH2Session(): http2.ClientHttp2Session {
  if (h2Session && !h2Session.closed && !h2Session.destroyed) return h2Session;

  h2Session = http2.connect(`https://${apnsHost()}`);
  h2Session.on("error", (err) => {
    console.error("APNS h2 session error", err.message);
    h2Session = null;
  });
  h2Session.on("close", () => {
    h2Session = null;
  });
  return h2Session;
}

export async function sendAPNSNotification(params: {
  token: string;
  title: string;
  body: string;
  link?: string;
}) {
  const bundleId = process.env.APNS_BUNDLE_ID;
  const jwt = makeJwt();
  if (!bundleId || !jwt) return;

  const payload = JSON.stringify({
    aps: {
      alert: {
        title: params.title,
        body: params.body,
      },
      sound: "default",
    },
    link: params.link,
  });

  return new Promise<void>((resolve) => {
    try {
      const session = getH2Session();
      const req = session.request({
        [http2.constants.HTTP2_HEADER_METHOD]: "POST",
        [http2.constants.HTTP2_HEADER_PATH]: `/3/device/${params.token}`,
        "authorization": `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "content-type": "application/json",
      });

      let data = "";
      req.on("response", (headers) => {
        const status = headers[":status"];
        if (status !== 200) {
          req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
          req.on("end", () => {
            console.error("APNS send failed", status, data);
            resolve();
          });
        } else {
          req.on("data", () => {});
          req.on("end", () => resolve());
        }
      });

      req.on("error", (err) => {
        console.error("APNS request error", err.message);
        /* Force reconnect on next send */
        h2Session = null;
        resolve();
      });

      req.end(payload);
    } catch (err) {
      console.error("APNS send exception", err);
      resolve();
    }
  });
}
