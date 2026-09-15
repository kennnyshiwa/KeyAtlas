import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { auth } from "@/lib/auth";

/** Explicit credentials fail closed; an invalid bearer must not fall back to a cookie. */
export async function requestIdentity(req: NextRequest) {
  if (req.headers.has("authorization")) return authenticateApiKey(req);
  const session = await auth();
  if (!session?.user?.id) return null;
  // Cookie-authenticated mutations must originate from this site when Origin is supplied.
  const origin = req.headers.get("origin");
  // Next may normalize the internal request URL to localhost. Host is the
  // browser-facing authority; the deployment proxy supplies forwarded protocol.
  const protocol = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.slice(0, -1);
  const host = req.headers.get("host") ?? req.nextUrl.host;
  if (req.method !== "GET" && origin && origin !== `${protocol}://${host}`) return null;
  return session.user;
}
