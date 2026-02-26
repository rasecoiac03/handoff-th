import { z } from "zod";

export const createSubTaskSchema = z.object({
  jobId: z.uuid({ message: "jobId must be a valid UUID" }),
  description: z
    .string()
    .min(1, "Description is required")
    .max(500, "Description must be at most 500 characters"),
  deadline: z.iso
    .datetime({ message: "Deadline must be a valid ISO datetime" })
    .transform((val) => new Date(val))
    .optional(),
  cost: z.number().min(0, "Cost must be non-negative").optional(),
});

export const updateSubTaskSchema = z.object({
  id: z.uuid({ message: "id must be a valid UUID" }),
  description: z.string().min(1).max(500).optional(),
  deadline: z.iso
    .datetime({ message: "Deadline must be a valid ISO datetime" })
    .transform((val) => new Date(val))
    .optional(),
  cost: z.number().min(0, "Cost must be non-negative").optional(),
});

export const deleteSubTaskSchema = z.object({
  id: z.uuid({ message: "id must be a valid UUID" }),
});

export const reorderSubTasksSchema = z.object({
  jobId: z.uuid({ message: "jobId must be a valid UUID" }),
  orderedIds: z
    .array(z.uuid({ message: "Each ID must be a valid UUID" }))
    .min(1, "orderedIds must contain at least one ID"),
});
