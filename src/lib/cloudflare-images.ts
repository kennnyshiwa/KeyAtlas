/**
 * Cloudflare Images variant helper.
 *
 * Supported variant names (must exist in Cloudflare dashboard):
 * - public: original quality
 * - thumbnail: 400px
 * - card: 800px
 * - hero: 1600px
 */
export function cfImageUrl(imageId: string, variant: string = "public"): string {
  const accountHash = process.env.CLOUDFLARE_ACCOUNT_HASH;

  if (!accountHash) {
    throw new Error("CLOUDFLARE_ACCOUNT_HASH is not configured");
  }

  return `https://imagedelivery.net/${accountHash}/${imageId}/${variant}`;
}
