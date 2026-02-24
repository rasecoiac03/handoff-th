import { z } from "zod";

export const sendMessageSchema = z.object({
  jobId: z.uuid({ message: "jobId must be a valid UUID" }),
  content: z.string().min(1, "Message content is required"),
});
