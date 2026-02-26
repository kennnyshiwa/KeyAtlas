import { prisma } from "@/lib/prisma";
import { PROFILE_OPTIONS } from "@/lib/constants";

export const DEFAULT_KEYCAP_PROFILES = [...PROFILE_OPTIONS];

function normalizeProfileName(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export async function listKeycapProfiles() {
  try {
    const rows = await prisma.keycapProfile.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { name: true },
    });

    const merged = Array.from(
      new Set([...DEFAULT_KEYCAP_PROFILES, ...rows.map((r) => normalizeProfileName(r.name))])
    ).sort((a, b) => a.localeCompare(b));

    return merged;
  } catch {
    return [...DEFAULT_KEYCAP_PROFILES].sort((a, b) => a.localeCompare(b));
  }
}

export async function createKeycapProfile(name: string) {
  const normalized = normalizeProfileName(name);
  if (!normalized) throw new Error("Profile name is required");

  return prisma.keycapProfile.upsert({
    where: { name: normalized },
    create: { name: normalized, active: true },
    update: { active: true },
    select: { id: true, name: true, active: true },
  });
}
