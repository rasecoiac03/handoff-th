import { Job } from "@prisma/client";
import { Context } from "../context.js";
import { authResolvers } from "../modules/auth/resolvers.js";
import { jobResolvers } from "../modules/jobs/resolvers.js";
import { historyResolvers } from "../modules/jobs/history.js";
import { messageResolvers } from "../modules/messages/resolvers.js";
import { subscriptionResolvers } from "../modules/messages/subscriptions.js";
import { subtaskResolvers } from "../modules/subtasks/resolvers.js";

const fieldResolvers = {
  Job: {
    contractor: (parent: Job, _args: unknown, ctx: Context) => {
      return ctx.loaders.userLoader.load(parent.contractorId);
    },

    chats: (parent: Job, _args: unknown, ctx: Context) => {
      return ctx.loaders.chatLoader.load(parent.id);
    },

    homeowners: async (parent: Job, _args: unknown, ctx: Context) => {
      const job = await ctx.prisma.job.findUnique({
        where: { id: parent.id },
        include: { homeowners: true },
      });
      return job?.homeowners ?? [];
    },
  },
};

const resolvers = {
  Query: {
    health: () => "OK",
    ...jobResolvers.Query,
    ...historyResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...jobResolvers.Mutation,
    ...historyResolvers.Mutation,
    ...messageResolvers.Mutation,
    ...subtaskResolvers.Mutation,
  },
  Job: {
    ...fieldResolvers.Job,
    ...subtaskResolvers.Job,
  },
  Chat: {
    ...messageResolvers.Chat,
  },
  Message: {
    ...messageResolvers.Message,
  },
  JobRevision: {
    ...historyResolvers.JobRevision,
  },
  Subscription: {
    ...subscriptionResolvers.Subscription,
  },
};

export default resolvers;
