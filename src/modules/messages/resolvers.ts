import { GraphQLError } from "graphql";
import { Chat, Message } from "@prisma/client";
import { Context } from "../../context.js";
import { requireAuth, requireJobAccess } from "../auth/guard.js";
import { validateInput } from "../../utils/validation.js";
import { sendMessageSchema } from "./validators.js";
import { pubsub, TOPIC_MESSAGE_ADDED } from "../../realtime/pubsub.js";

const DEFAULT_MESSAGE_LIMIT = 20;

type MessageWithJobInfo = Message & { jobId?: string; jobDescription?: string };

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

      const message = await ctx.prisma.message.create({
        data: {
          chatId: chat.id,
          senderId: user.id,
          content: input.content,
        },
      });

      const enriched = { ...message, jobId: input.jobId, jobDescription: job.description };

      await pubsub.publish(TOPIC_MESSAGE_ADDED(input.jobId), { messageAdded: enriched });

      return enriched;
    },
  },

  Chat: {
    participants: (parent: Chat, _args: unknown, ctx: Context) => {
      return ctx.loaders.chatParticipantsLoader.load(parent.id);
    },

    messages: async (parent: Chat, args: { limit?: number; before?: string }, ctx: Context) => {
      const take = Math.min(args.limit ?? DEFAULT_MESSAGE_LIMIT, 100);

      const rows = await ctx.prisma.message.findMany({
        where: { chatId: parent.id },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(args.before && {
          cursor: { id: args.before },
          skip: 1,
        }),
      });

      const hasPreviousPage = rows.length > take;
      const messages = rows.slice(0, take).reverse();

      const job = await ctx.prisma.job.findFirst({
        where: { chats: { some: { id: parent.id } } },
        select: { id: true, description: true },
      });

      const edges = messages.map((msg) => ({
        cursor: msg.id,
        node: { ...msg, jobId: job?.id, jobDescription: job?.description },
      }));

      return {
        edges,
        pageInfo: {
          hasPreviousPage,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
        },
      };
    },
  },

  Message: {
    sender: (parent: MessageWithJobInfo, _args: unknown, ctx: Context) => {
      return ctx.loaders.userLoader.load(parent.senderId);
    },
  },
};
