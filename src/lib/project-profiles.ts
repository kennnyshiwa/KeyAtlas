export interface ProjectProfilesLike {
  profile?: string | null;
  profiles?: string[] | null;
}

export function normalizeProjectProfiles(
  profiles: readonly string[] | null | undefined,
  legacyProfile?: string | null,
): string[] {
  const values = [
    ...(Array.isArray(profiles) ? profiles : []),
    ...(legacyProfile ? [legacyProfile] : []),
  ];

  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function getProjectProfiles(project: ProjectProfilesLike): string[] {
  return normalizeProjectProfiles(project.profiles, project.profile);
}

export function getPrimaryProjectProfile(project: ProjectProfilesLike): string | null {
  return getProjectProfiles(project)[0] ?? null;
}
