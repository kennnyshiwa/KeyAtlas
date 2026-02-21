export const SITE_NAME = "KeyAtlas";

export function getSiteUrl() {
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  );
}
