import type { ProjectStatus } from "@/generated/prisma/client";
import { normalizeProjectStatus } from "@/lib/constants";

export interface SavedFilterCriteria {
  [key: string]: string | undefined;
  status?: ProjectStatus;
  category?: string;
  profile?: string;
  designer?: string;
  vendor?: string;
  q?: string;
}

export function sanitizeSavedFilterCriteria(criteria: unknown): SavedFilterCriteria {
  const raw = criteria && typeof criteria === "object"
    ? (criteria as Record<string, unknown>)
    : {};

  const status = normalizeProjectStatus(
    typeof raw.status === "string" ? raw.status : undefined
  );

  return {
    ...(status ? { status } : {}),
    ...(typeof raw.category === "string" && raw.category ? { category: raw.category } : {}),
    ...(typeof raw.profile === "string" && raw.profile ? { profile: raw.profile } : {}),
    ...(typeof raw.designer === "string" && raw.designer ? { designer: raw.designer } : {}),
    ...(typeof raw.vendor === "string" && raw.vendor ? { vendor: raw.vendor } : {}),
    ...(typeof raw.q === "string" && raw.q ? { q: raw.q } : {}),
  };
}
