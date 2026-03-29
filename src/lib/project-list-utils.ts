import { generateDescriptionPreview } from "./description-preview";

/**
 * Add `descriptionPreview` to project list items that have a `description` field.
 * Works with any Prisma result that includes the description column.
 */
export function withDescriptionPreview<
  T extends { description?: string | null },
>(projects: T[]): (T & { descriptionPreview: string | null })[] {
  return projects.map((p) => ({
    ...p,
    descriptionPreview: generateDescriptionPreview(p.description),
  }));
}
