import { GraphQLError } from "graphql";
import { Chat } from "@prisma/client";
import { Context } from "../../context.js";
import { requireAuth, requireJobAccess } from "../auth/guard.js";
import { validateInput } from "../../utils/validation.js";
import { sendMessageSchema } from "./validators.js";

const DEFAULT_MESSAGE_LIMIT = 20;

export const messageResolvers = {
  Mutation: {
    sendMessage: async (
      _parent: unknown,
      args: { jobId: string; content: string },
      ctx: Context,
    ) => {
      const user = requireAuth(ctx);
      const input = validateInput(sendMessageSchema, args);

      const job = await ctx.prisma.job.findUnique({
        where: { id: input.jobId },
        include: { homeowners: { select: { id: true } } },
      });

      if (!job) {
        throw new GraphQLError("Job not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      requireJobAccess(user, job);

      let chat = await ctx.prisma.chat.findFirst({
        where: { jobId: input.jobId },
      });

      if (!chat) {
        chat = await ctx.prisma.chat.create({
          data: {
            jobId: input.jobId,
            participants: { connect: { id: user.id } },
          },
        });
      }

      return ctx.prisma.message.create({
        data: {
          chatId: chat.id,
          senderId: user.id,
          content: input.content,
        },
      });
    },
  },

  Chat: {
    participants: (parent: Chat, _args: unknown, ctx: Context) => {
      return ctx.loaders.chatParticipantsLoader.load(parent.id);
    },

    messages: async (parent: Chat, args: { limit?: number; after?: string }, ctx: Context) => {
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
