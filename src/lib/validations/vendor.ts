import { z } from "zod";

export const vendorFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1, "Slug is required").max(100),
  logo: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  storefrontUrl: z.string().url().optional().or(z.literal("")).nullable(),
  verified: z.boolean().default(false),
  regionsServed: z.array(z.string()).default([]),
});

export type VendorFormData = z.infer<typeof vendorFormSchema>;
