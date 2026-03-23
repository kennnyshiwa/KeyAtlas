export const SITE_NAME = "KeyAtlas";

export function getSiteUrl() {
  const url =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000";

  // Enforce HTTPS in production (skip localhost)
  if (url.startsWith("http://") && !url.includes("localhost")) {
    return "https://" + url.slice("http://".length);
  }

  return url;
}
