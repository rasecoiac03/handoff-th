import { Context } from "../context.js";

const resolvers = {
  Query: {
    health: () => "OK",

    jobs: async (_parent: unknown, _args: unknown, ctx: Context) => {
      return ctx.prisma.job.findMany();
    },
  },

  Mutation: {
    login: (
      _parent: unknown,
      args: { email: string; password: string },
    ) => {
      return { token: `fake-token-for-${args.email}` };
    },

    createJob: async (
      _parent: unknown,
      args: { description: string; location: string; contractorId: string },
      ctx: Context,
    ) => {
      return ctx.prisma.job.create({
        data: {
          description: args.description,
          location: args.location,
          contractorId: args.contractorId,
        },
      });
    },
  },
};

export default resolvers;
