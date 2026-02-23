import { GraphQLError } from "graphql";
import { Job, Chat } from "@prisma/client";
import { Context } from "../context.js";
import { loginSchema } from "../validators/auth.js";
import { createJobSchema } from "../validators/job.js";
import { createChatSchema, sendMessageSchema } from "../validators/chat.js";

const DEFAULT_MESSAGE_LIMIT = 20;

function validateInput<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Validation failed";
    throw new GraphQLError(message, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}

const resolvers = {
  Query: {
    health: () => "OK",

    jobs: async (_parent: unknown, _args: unknown, ctx: Context) => {
      return ctx.prisma.job.findMany();
    },

    chats: async (
      _parent: unknown,
      args: { jobId: string },
      ctx: Context,
    ) => {
      return ctx.prisma.chat.findMany({
        where: { jobId: args.jobId },
      });
    },
  },

  Mutation: {
    login: (
      _parent: unknown,
      args: { email: string; password: string },
    ) => {
      const input = validateInput(loginSchema, args);
      return { token: `fake-token-for-${input.email}` };
    },

    createJob: async (
      _parent: unknown,
      args: { description: string; location: string; contractorId: string },
      ctx: Context,
    ) => {
      const input = validateInput(createJobSchema, args);
      return ctx.prisma.job.create({ data: input });
    },

    createChat: async (
      _parent: unknown,
      args: { jobId: string; participantIds: string[] },
      ctx: Context,
    ) => {
      const input = validateInput(createChatSchema, args);
      return ctx.prisma.chat.create({
        data: {
          jobId: input.jobId,
          participants: {
            connect: input.participantIds.map((id) => ({ id })),
          },
        },
      });
    },

    sendMessage: async (
      _parent: unknown,
      args: { chatId: string; senderId: string; content: string },
      ctx: Context,
    ) => {
      const input = validateInput(sendMessageSchema, args);
      return ctx.prisma.message.create({
        data: {
          chatId: input.chatId,
          senderId: input.senderId,
          content: input.content,
        },
      });
    },
  },

  Job: {
    contractor: (parent: Job, _args: unknown, ctx: Context) => {
      return ctx.loaders.userLoader.load(parent.contractorId);
    },

    chats: (parent: Job, _args: unknown, ctx: Context) => {
      return ctx.loaders.chatLoader.load(parent.id);
    },
  },

  Chat: {
    participants: (parent: Chat, _args: unknown, ctx: Context) => {
      return ctx.loaders.chatParticipantsLoader.load(parent.id);
    },

    messages: async (
      parent: Chat,
      args: { limit?: number; after?: string },
      ctx: Context,
    ) => {
      const take = Math.min(args.limit ?? DEFAULT_MESSAGE_LIMIT, 100);

      const messages = await ctx.prisma.message.findMany({
        where: { chatId: parent.id },
        orderBy: { createdAt: "asc" },
        take: take + 1,
        ...(args.after && {
          cursor: { id: args.after },
          skip: 1,
        }),
      });

      const hasNextPage = messages.length > take;
      const edges = messages.slice(0, take).map((msg) => ({
        cursor: msg.id,
        node: msg,
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        },
      };
    },
  },
};

export default resolvers;
