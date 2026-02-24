import { z } from "zod";

export const createJobSchema = z.object({
  description: z
    .string()
    .min(1, "Description is required")
    .max(1000, "Description must be at most 1000 characters"),
  location: z.string().min(1, "Location is required"),
});

export const updateJobSchema = z.object({
  id: z.uuid({ message: "id must be a valid UUID" }),
  description: z.string().min(1).max(1000).optional(),
  location: z.string().min(1).optional(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "COMPLETED", "CANCELED"]).optional(),
  cost: z.number().min(0, "Cost must be positive").optional().nullable(),
});

export const addHomeownerSchema = z.object({
  jobId: z.uuid({ message: "jobId must be a valid UUID" }),
  homeownerId: z.uuid({ message: "homeownerId must be a valid UUID" }),
});
