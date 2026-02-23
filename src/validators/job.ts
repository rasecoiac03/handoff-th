import { z } from "zod";

export const createJobSchema = z.object({
  description: z
    .string()
    .min(1, "Description is required")
    .max(1000, "Description must be at most 1000 characters"),
  location: z.string().min(1, "Location is required"),
  contractorId: z.string().uuid("contractorId must be a valid UUID"),
});
