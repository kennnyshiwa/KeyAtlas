import type { ProjectFormData } from "@/lib/validations/project";

export type PublishValidationError = {
  id: string;
  message: string;
};

type PublishValidationInput = Pick<
  ProjectFormData,
  "title" | "slug" | "description" | "heroImage" | "status" | "gbStartDate" | "projectVendors"
>;

export function getProjectPublishValidationErrors(
  formData: PublishValidationInput
): PublishValidationError[] {
  const errors: PublishValidationError[] = [];

  if (!formData.title.trim()) errors.push({ id: "title", message: "Title is required" });
  if (!formData.slug.trim()) errors.push({ id: "slug", message: "Slug is required" });
  if (!(formData.description ?? "").trim()) errors.push({ id: "description", message: "Description is required" });
  if (!(formData.heroImage ?? "").trim()) errors.push({ id: "hero-image", message: "Hero image is required" });

  if (formData.status === "GROUP_BUY") {
    if (!(formData.projectVendors ?? []).filter((pv) => pv.vendorId).length) {
      errors.push({ id: "vendors", message: "At least one vendor is required for Group Buy" });
    }
    if (!formData.gbStartDate) {
      errors.push({ id: "gbStartDate", message: "GB start date is required for Group Buy" });
    }
  }

  return errors;
}
