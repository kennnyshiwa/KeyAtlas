/**
 * Cloudflare Turnstile verification for anti-bot/anti-abuse.
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  error?: string;
}

/**
 * Verify a Turnstile token with Cloudflare.
 *
 * Behaviour when env vars are missing:
 * - Production: fail closed (reject)
 * - Development: allow with console warning
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  remoteIp?: string
): Promise<TurnstileResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === "production";

  if (!secretKey) {
    if (isProduction) {
      return { success: false, error: "Turnstile not configured" };
    }
    console.warn("[security] Turnstile secret key not configured — allowing in development");
    return { success: true };
  }

  if (!token) {
    return { success: false, error: "Verification token required" };
  }

  try {
    const body: Record<string, string> = {
      secret: secretKey,
      response: token,
    };
    if (remoteIp) body.remoteip = remoteIp;

    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    const data = await res.json();

    if (data.success) {
      return { success: true };
    }

    return {
      success: false,
      error: "Verification failed. Please try again.",
    };
  } catch {
    return { success: false, error: "Verification service unavailable" };
  }
}
