import { GraphQLError } from "graphql";
import { Job, JobRevision, SubTask } from "@prisma/client";
import { Context } from "../../context.js";
import { requireAuth, requireContractor, requireJobAccess } from "../auth/guard.js";

export function createSnapshot(job: Job, subtasks: SubTask[]) {
  return {
    description: job.description,
    location: job.location,
    status: job.status,
    cost: job.cost,
    updatedAt: job.updatedAt instanceof Date ? job.updatedAt.toISOString() : String(job.updatedAt),
    subtasks: subtasks.map((s) => ({
      description: s.description,
      deadline: s.deadline instanceof Date ? s.deadline.toISOString() : s.deadline ?? null,
      cost: s.cost,
      position: s.position,
    })),
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

        const updatedJob = await tx.job.update({
          where: { id: args.jobId },
          data: {
            description: snapshot.description,
            location: snapshot.location,
            status: snapshot.status,
            cost: snapshot.cost,
            currentVersion: targetVersion,
          },
        });

        await tx.subTask.deleteMany({ where: { jobId: args.jobId } });

        if (snapshot.subtasks && Array.isArray(snapshot.subtasks)) {
          for (let i = 0; i < snapshot.subtasks.length; i++) {
            const s = snapshot.subtasks[i];
            await tx.subTask.create({
              data: {
                jobId: args.jobId,
                description: s.description,
                deadline: s.deadline ? new Date(s.deadline) : null,
                cost: s.cost ?? null,
                position: s.position ?? i,
              },
            });
          }
        }

        return updatedJob;
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

        const updatedJob = await tx.job.update({
          where: { id: args.jobId },
          data: {
            description: snapshot.description,
            location: snapshot.location,
            status: snapshot.status,
            cost: snapshot.cost,
            currentVersion: targetVersion,
          },
        });

        await tx.subTask.deleteMany({ where: { jobId: args.jobId } });

        if (snapshot.subtasks && Array.isArray(snapshot.subtasks)) {
          for (let i = 0; i < snapshot.subtasks.length; i++) {
            const s = snapshot.subtasks[i];
            await tx.subTask.create({
              data: {
                jobId: args.jobId,
                description: s.description,
                deadline: s.deadline ? new Date(s.deadline) : null,
                cost: s.cost ?? null,
                position: s.position ?? i,
              },
            });
          }
        }

        return updatedJob;
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
