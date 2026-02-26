import { GraphQLError } from "graphql";
import { Prisma } from "@prisma/client";
import { Context } from "../../context.js";
import { requireAuth, requireContractor, requireJobAccess } from "../auth/guard.js";
import { validateInput } from "../../utils/validation.js";
import { createJobSchema, updateJobSchema, addHomeownerSchema } from "./validators.js";
import { createSnapshot } from "./history.js";

export const jobResolvers = {
  Query: {
    jobs: async (_parent: unknown, _args: unknown, ctx: Context) => {
      const user = requireAuth(ctx);

      if (user.role === "CONTRACTOR") {
        return ctx.prisma.job.findMany({
          where: { contractorId: user.id },
        });
      }

      return ctx.prisma.job.findMany({
        where: { homeowners: { some: { id: user.id } } },
      });
    },

    job: async (_parent: unknown, args: { id: string }, ctx: Context) => {
      const user = requireAuth(ctx);

      const job = await ctx.prisma.job.findUnique({
        where: { id: args.id },
        include: { homeowners: { select: { id: true } } },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      requireJobAccess(user, job);
      return job;
    },
  },

  Mutation: {
    createJob: async (
      _parent: unknown,
      args: { description: string; location: string },
      ctx: Context,
    ) => {
      const user = requireContractor(ctx);
      const input = validateInput(createJobSchema, args);

      return ctx.prisma.$transaction(async (tx) => {
        const job = await tx.job.create({
          data: {
            description: input.description,
            location: input.location,
            contractorId: user.id,
          },
        });

        await tx.chat.create({
          data: {
            jobId: job.id,
            participants: { connect: { id: user.id } },
          },
        });

        await tx.jobRevision.create({
          data: {
            jobId: job.id,
            version: 1,
            snapshot: createSnapshot(job, []) as Prisma.InputJsonValue,
            changedById: user.id,
          },
        });

        return job;
      });
    },

    updateJob: async (
      _parent: unknown,
      args: { id: string; description?: string; location?: string; status?: string; cost?: number },
      ctx: Context,
    ) => {
      const user = requireContractor(ctx);
      const input = validateInput(updateJobSchema, args);

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.id },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (job.contractorId !== user.id) {
        throw new GraphQLError("You can only update your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const { id, ...data } = input;
      const updateData = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      );

      return ctx.prisma.$transaction(async (tx) => {
        if (job.currentVersion < job.headVersion) {
          await tx.jobRevision.deleteMany({
            where: { jobId: id, version: { gt: job.currentVersion } },
          });
        }

        const newVersion = job.currentVersion + 1;

        const updatedJob = await tx.job.update({
          where: { id },
          data: {
            ...updateData,
            currentVersion: newVersion,
            headVersion: newVersion,
          },
        });

        const subtasks = await tx.subTask.findMany({ where: { jobId: id } });

        await tx.jobRevision.create({
          data: {
            jobId: id,
            version: newVersion,
            snapshot: createSnapshot(updatedJob, subtasks) as Prisma.InputJsonValue,
            changedById: user.id,
          },
        });

        return updatedJob;
      });
    },

    deleteJob: async (_parent: unknown, args: { id: string }, ctx: Context) => {
      const user = requireContractor(ctx);

      const job = await ctx.prisma.job.findUnique({
        where: { id: args.id },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (job.contractorId !== user.id) {
        throw new GraphQLError("You can only delete your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        const chats = await tx.chat.findMany({
          where: { jobId: args.id },
          select: { id: true },
        });
        const chatIds = chats.map((c) => c.id);

        if (chatIds.length > 0) {
          await tx.message.deleteMany({ where: { chatId: { in: chatIds } } });
          await tx.chat.deleteMany({ where: { id: { in: chatIds } } });
        }

        await tx.jobRevision.deleteMany({ where: { jobId: args.id } });
        await tx.job.delete({ where: { id: args.id } });
      });

      return true;
    },

    addHomeownerToJob: async (
      _parent: unknown,
      args: { jobId: string; homeownerId: string },
      ctx: Context,
    ) => {
      const user = requireContractor(ctx);
      const input = validateInput(addHomeownerSchema, args);

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (job.contractorId !== user.id) {
        throw new GraphQLError("You can only modify your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const homeowner = await ctx.prisma.user.findUnique({
        where: { id: input.homeownerId },
      });

      if (!homeowner || homeowner.role !== "HOMEOWNER") {
        throw new GraphQLError("Homeowner not found or invalid role", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return ctx.prisma.job.update({
        where: { id: input.jobId },
        data: {
          homeowners: { connect: { id: input.homeownerId } },
        },
      });
    },
  },
};
