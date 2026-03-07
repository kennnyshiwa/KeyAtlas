import { z } from "zod";

export const projectFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  slug: z.string().min(1, "Slug is required").max(200),
  description: z.string().optional(),
  category: z.enum([
    "KEYBOARDS",
    "KEYCAPS",
    "SWITCHES",
    "DESKMATS",
    "ARTISANS",
    "ACCESSORIES",
  ]),
  status: z.enum([
    "INTEREST_CHECK",
    "GROUP_BUY",
    "PRODUCTION",
    "SHIPPING",
    "EXTRAS",
    "IN_STOCK",
    "COMPLETED",
    "ARCHIVED",
  ]),
  priceMin: z.coerce.number().int().min(0).optional().nullable(),
  priceMax: z.coerce.number().int().min(0).optional().nullable(),
  currency: z.string().default("USD"),
  heroImage: z.string().optional().nullable(),
  descriptionTextAlign: z.enum(["LEFT", "CENTER", "RIGHT"]).default("LEFT"),
  descriptionFontScale: z.enum(["SMALL", "MEDIUM", "LARGE"]).default("MEDIUM"),
  descriptionTextColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a valid hex color")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  descriptionMaxWidth: z.enum(["NARROW", "MEDIUM", "WIDE", "FULL"]).default("MEDIUM"),
  tags: z.array(z.string()).default([]),
  icDate: z.coerce.date().optional().nullable(),
  gbStartDate: z.coerce.date().optional().nullable(),
  gbEndDate: z.coerce.date().optional().nullable(),
  estimatedDelivery: z.string().optional().nullable(),
  profile: z.string().max(50).optional().nullable(),
  shipped: z.boolean().default(false),
  designer: z.string().max(100).optional().nullable(),
  vendorId: z.string().optional().nullable(),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
  metaTitle: z.string().max(70).optional().nullable(),
  metaDescription: z.string().max(160).optional().nullable(),
  images: z
    .array(
      z.object({
        url: z.string(),
        alt: z.string().optional(),
        order: z.number().default(0),
        linkUrl: z.string().url().optional().nullable(),
        openInNewTab: z.boolean().default(true),
      })
    )
    .default([]),
  projectVendors: z
    .array(
      z.object({
        vendorId: z.string().min(1),
        region: z.string().optional().default(""),
        storeLink: z.string().optional().default(""),
        endDate: z.coerce.date().optional().nullable(),
        customVendorName: z.string().max(120).optional().nullable(),
        customVendorWebsite: z.string().url().optional().nullable(),
      })
    )
    .default([]),
  soundTests: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string().max(200).optional().nullable(),
        platform: z.string().max(50).optional().nullable(),
      })
    )
    .default([]),
  links: z
    .array(
      z.object({
        label: z.string().min(1),
        url: z.string().url(),
        type: z
          .enum([
            "GEEKHACK",
            "WEBSITE",
            "DISCORD",
            "INSTAGRAM",
            "REDDIT",
            "STORE",
            "OTHER",
          ])
          .default("OTHER"),
      })
    )
    .default([]),
});

export type ProjectFormData = z.infer<typeof projectFormSchema>;
