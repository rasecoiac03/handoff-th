import { GraphQLError } from "graphql";
import { Job, JobRevision } from "@prisma/client";
import { Context } from "../../context.js";
import { requireAuth, requireContractor, requireJobAccess } from "../auth/guard.js";

export function createSnapshot(job: Job) {
  return {
    description: job.description,
    location: job.location,
    status: job.status,
    cost: job.cost,
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : String(job.updatedAt),
  } as Record<string, unknown>;
}

export const historyResolvers = {
  Query: {
    jobHistory: async (_parent: unknown, args: { jobId: string }, ctx: Context) => {
      const user = requireAuth(ctx);

      const job = await ctx.prisma.job.findUnique({
        where: { id: args.jobId },
        include: { homeowners: { select: { id: true } } },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      requireJobAccess(user, job);

      return ctx.prisma.jobRevision.findMany({
        where: { jobId: args.jobId },
        orderBy: { version: "asc" },
      });
    },
  },

  Mutation: {
    undoJob: async (_parent: unknown, args: { jobId: string }, ctx: Context) => {
      const user = requireContractor(ctx);

      const job = await ctx.prisma.job.findUnique({
        where: { id: args.jobId },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (job.contractorId !== user.id) {
        throw new GraphQLError("You can only undo your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      if (job.currentVersion <= 1) {
        throw new GraphQLError("Nothing to undo", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const targetVersion = job.currentVersion - 1;

      return ctx.prisma.$transaction(async (tx) => {
        const revision = await tx.jobRevision.findUnique({
          where: { jobId_version: { jobId: args.jobId, version: targetVersion } },
        });

        if (!revision) {
          throw new GraphQLError("Revision not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const snapshot = revision.snapshot as Record<string, any>;

        return tx.job.update({
          where: { id: args.jobId },
          data: {
            description: snapshot.description,
            location: snapshot.location,
            status: snapshot.status,
            cost: snapshot.cost,
            currentVersion: targetVersion,
          },
        });
      });
    },

    redoJob: async (_parent: unknown, args: { jobId: string }, ctx: Context) => {
      const user = requireContractor(ctx);

      const job = await ctx.prisma.job.findUnique({
        where: { id: args.jobId },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      if (job.contractorId !== user.id) {
        throw new GraphQLError("You can only redo your own jobs", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      if (job.currentVersion >= job.headVersion) {
        throw new GraphQLError("Nothing to redo", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const targetVersion = job.currentVersion + 1;

      return ctx.prisma.$transaction(async (tx) => {
        const revision = await tx.jobRevision.findUnique({
          where: { jobId_version: { jobId: args.jobId, version: targetVersion } },
        });

        if (!revision) {
          throw new GraphQLError("Revision not found", {
            extensions: { code: "NOT_FOUND" },
          });
        }

        const snapshot = revision.snapshot as Record<string, any>;

        return tx.job.update({
          where: { id: args.jobId },
          data: {
            description: snapshot.description,
            location: snapshot.location,
            status: snapshot.status,
            cost: snapshot.cost,
            currentVersion: targetVersion,
          },
        });
      });
    },
  },

  JobRevision: {
    snapshot: (parent: JobRevision) => JSON.stringify(parent.snapshot),

    changedBy: (parent: JobRevision, _args: unknown, ctx: Context) => {
      return ctx.loaders.userLoader.load(parent.changedById);
    },
  },
};
