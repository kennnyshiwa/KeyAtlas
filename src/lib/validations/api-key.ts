import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Name too long"),
});

export type CreateApiKeyData = z.infer<typeof createApiKeySchema>;
