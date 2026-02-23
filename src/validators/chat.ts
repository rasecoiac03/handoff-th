import { z } from "zod";

export const createChatSchema = z.object({
  jobId: z.string().uuid("jobId must be a valid UUID"),
  participantIds: z
    .array(z.string().uuid("Each participantId must be a valid UUID"))
    .min(1, "At least one participant is required"),
});

export const sendMessageSchema = z.object({
  chatId: z.string().uuid("chatId must be a valid UUID"),
  senderId: z.string().uuid("senderId must be a valid UUID"),
  content: z.string().min(1, "Message content is required"),
});
