import { Job } from "@prisma/client";
import { Context } from "../context.js";
import { authResolvers } from "../modules/auth/resolvers.js";
import { jobResolvers } from "../modules/jobs/resolvers.js";
import { messageResolvers } from "../modules/messages/resolvers.js";

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
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...jobResolvers.Mutation,
    ...messageResolvers.Mutation,
  },
  Job: {
    ...fieldResolvers.Job,
  },
  Chat: {
    ...messageResolvers.Chat,
  },
};

export default resolvers;
