import { GraphQLError } from "graphql";
import { Job } from "@prisma/client";
import { Context } from "../../context.js";
import { requireContractor } from "../auth/guard.js";
import { validateInput } from "../../utils/validation.js";
import {
  createSubTaskSchema,
  updateSubTaskSchema,
  deleteSubTaskSchema,
  reorderSubTasksSchema,
} from "./validators.js";

export const subtaskResolvers = {
  Job: {
    subtasks: (parent: Job, _args: unknown, ctx: Context) => {
      return ctx.prisma.subTask.findMany({
        where: { jobId: parent.id },
        orderBy: { position: "asc" },
      });
    },
  },

  Mutation: {
    createSubTask: async (
      _parent: unknown,
      args: { jobId: string; description: string; deadline?: string; cost?: number },
      ctx: Context,
    ) => {
      const user = requireContractor(ctx);
      const input = validateInput(createSubTaskSchema, args);

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (job.contractorId !== user.id) {
        throw new GraphQLError("You can only add subtasks to your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const maxResult = await ctx.prisma.subTask.aggregate({
        where: { jobId: input.jobId },
        _max: { position: true },
      });
      const nextPosition = (maxResult._max.position ?? -1) + 1;

      return ctx.prisma.subTask.create({
        data: {
          jobId: input.jobId,
          description: input.description,
          deadline: input.deadline,
          cost: input.cost,
          position: nextPosition,
        },
      });
    },

    updateSubTask: async (
      _parent: unknown,
      args: { id: string; description?: string; deadline?: string; cost?: number },
      ctx: Context,
    ) => {
      const user = requireContractor(ctx);
      const input = validateInput(updateSubTaskSchema, args);

      const subtask = await ctx.prisma.subTask.findUnique({
        where: { id: input.id },
        include: { job: true },
      });

      if (!subtask) {
        throw new GraphQLError("Subtask not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (subtask.job.contractorId !== user.id) {
        throw new GraphQLError("You can only update subtasks on your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const { id, ...data } = input;
      const updateData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );

      return ctx.prisma.subTask.update({
        where: { id },
        data: updateData,
      });
    },

    deleteSubTask: async (
      _parent: unknown,
      args: { id: string },
      ctx: Context,
    ) => {
      const user = requireContractor(ctx);
      const input = validateInput(deleteSubTaskSchema, args);

      const subtask = await ctx.prisma.subTask.findUnique({
        where: { id: input.id },
        include: { job: true },
      });

      if (!subtask) {
        throw new GraphQLError("Subtask not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (subtask.job.contractorId !== user.id) {
        throw new GraphQLError("You can only delete subtasks on your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      await ctx.prisma.subTask.delete({ where: { id: input.id } });

      return true;
    },

    reorderSubTasks: async (
      _parent: unknown,
      args: { jobId: string; orderedIds: string[] },
      ctx: Context,
    ) => {
      const user = requireContractor(ctx);
      const input = validateInput(reorderSubTasksSchema, args);

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (job.contractorId !== user.id) {
        throw new GraphQLError("You can only reorder subtasks on your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const existing = await ctx.prisma.subTask.findMany({
        where: { jobId: input.jobId },
        select: { id: true },
      });

      const existingIds = new Set(existing.map((s) => s.id));
      const orderedSet = new Set(input.orderedIds);

      if (existingIds.size !== orderedSet.size || ![...existingIds].every((id) => orderedSet.has(id))) {
        throw new GraphQLError(
          "orderedIds must contain exactly all subtask IDs for the job",
          { extensions: { code: "BAD_USER_INPUT" } },
        );
      }

      return ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.subTask.update({
            where: { id },
            data: { position: index },
          }),
        ),
      );
    },
  },
};
