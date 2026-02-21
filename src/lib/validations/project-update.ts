import { z } from "zod";

export const projectUpdateFormSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(1, "Content is required"),
});

export type ProjectUpdateFormData = z.infer<typeof projectUpdateFormSchema>;
