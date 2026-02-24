import { GraphQLError } from "graphql";
import { Context } from "../../context.js";
import { requireAuth, requireJobAccess } from "../auth/guard.js";
import { pubsub, TOPIC_MESSAGE_ADDED } from "../../realtime/pubsub.js";

export const subscriptionResolvers = {
  Subscription: {
    messageAdded: {
      subscribe: async (_parent: unknown, args: { jobId: string }, ctx: Context) => {
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

        return pubsub.asyncIterableIterator(TOPIC_MESSAGE_ADDED(args.jobId));
      },
    },
  },
};
