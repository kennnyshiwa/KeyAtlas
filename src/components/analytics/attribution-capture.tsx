"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { captureAttributionFromUrl } from "@/lib/attribution";

export function AttributionCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    captureAttributionFromUrl(searchParams);
  }, [searchParams]);

  return null;
}
