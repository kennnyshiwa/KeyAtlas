import { z } from "zod";

export const designerFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1, "Slug is required").max(100),
  logo: z.string().optional().nullable(),
  banner: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  websiteUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

export type DesignerFormData = z.infer<typeof designerFormSchema>;
