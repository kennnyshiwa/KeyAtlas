type DesignerProfileRef = {
  name: string;
  slug: string;
} | null | undefined;

type DesignerLookupClient = {
  designer: {
    findFirst: (args: {
      where: { name: { equals: string; mode: "insensitive" } };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

export function normalizeDesignerName(name?: string | null): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

export async function resolveDesignerIdByName(
  client: DesignerLookupClient,
  name?: string | null
): Promise<string | null> {
  const normalizedName = normalizeDesignerName(name);
  if (!normalizedName) return null;

  const designer = await client.designer.findFirst({
    where: { name: { equals: normalizedName, mode: "insensitive" } },
    select: { id: true },
  });

  return designer?.id ?? null;
}

export function getProjectDesignerDisplay(input: {
  designer?: string | null;
  designerProfile?: DesignerProfileRef;
}): { name: string; slug: string | null } | null {
  const designerName = normalizeDesignerName(input.designer);
  const profileName = normalizeDesignerName(input.designerProfile?.name);

  if (designerName && profileName) {
    const matchesProfile =
      designerName.localeCompare(profileName, undefined, { sensitivity: "accent" }) === 0;

    if (matchesProfile) {
      return {
        name: input.designerProfile!.name,
        slug: input.designerProfile!.slug,
      };
    }

    return { name: designerName, slug: null };
  }

  if (designerName) return { name: designerName, slug: null };
  if (input.designerProfile) {
    return {
      name: input.designerProfile.name,
      slug: input.designerProfile.slug,
    };
  }

  return null;
}
