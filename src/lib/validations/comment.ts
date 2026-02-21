import { z } from "zod";

export const commentFormSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty").max(5000),
  parentId: z.string().optional().nullable(),
});

export type CommentFormData = z.infer<typeof commentFormSchema>;
