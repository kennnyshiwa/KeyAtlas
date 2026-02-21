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
  tags: z.array(z.string()).default([]),
  icDate: z.coerce.date().optional().nullable(),
  gbStartDate: z.coerce.date().optional().nullable(),
  gbEndDate: z.coerce.date().optional().nullable(),
  estimatedDelivery: z.coerce.date().optional().nullable(),
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
