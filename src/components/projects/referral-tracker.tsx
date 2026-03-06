"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function ReferralTracker({ slug }: { slug: string }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;

    const key = `ka_ref_sent_${slug}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;

    const utmSource = searchParams.get("utm_source") ?? undefined;
    const utmCampaign = searchParams.get("utm_campaign") ?? undefined;

    fetch(`/api/v1/projects/${slug}/referral`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref, utmSource, utmCampaign }),
    }).catch(() => {});

    if (typeof window !== "undefined") {
      sessionStorage.setItem(key, "1");
    }
  }, [searchParams, slug]);

  return null;
}
