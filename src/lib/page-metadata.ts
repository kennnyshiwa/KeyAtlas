import type { Metadata } from "next";
import { getSiteUrl, SITE_NAME } from "@/lib/site";

interface BuildPageMetadataOptions {
  title: string;
  description: string;
  path: string;
}

export function buildPageMetadata({
  title,
  description,
  path,
}: BuildPageMetadataOptions): Metadata {
  const siteUrl = getSiteUrl();
  const canonical = new URL(path, siteUrl).toString();
  const fullTitle = title === SITE_NAME ? title : `${title} - ${SITE_NAME}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}
