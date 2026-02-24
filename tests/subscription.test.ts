import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";
import { pubsub, TOPIC_MESSAGE_ADDED } from "../src/realtime/pubsub.js";

const SEND_MESSAGE = `
  mutation SendMessage($jobId: ID!, $content: String!) {
    sendMessage(jobId: $jobId, content: $content) {
      id content senderId createdAt
    }
  }
`;

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d";
const JOB_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
const CHAT_ID = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a";

const fakeJob = {
  id: JOB_ID,
  description: "Kitchen renovation",
  contractorId: USER_ID,
  homeowners: [{ id: USER_ID }],
};

const fakeMessage = {
  id: "msg-001",
  chatId: CHAT_ID,
  senderId: USER_ID,
  content: "Hello!",
  createdAt: new Date().toISOString(),
};

function makeCtx(role: "CONTRACTOR" | "HOMEOWNER" = "CONTRACTOR"): Context {
  return {
    prisma: {
      job: {
        findUnique: vi.fn().mockResolvedValue(fakeJob),
      },
      chat: {
        findFirst: vi.fn().mockResolvedValue({ id: CHAT_ID, jobId: JOB_ID }),
        create: vi.fn(),
      },
      message: {
        create: vi.fn().mockResolvedValue(fakeMessage),
      },
    },
    loaders: {
      userLoader: { load: vi.fn() },
      chatLoader: { load: vi.fn() },
      chatParticipantsLoader: { load: vi.fn() },
    },
    user: {
      id: USER_ID,
      email: "contractor@example.com",
      password: "hashed",
      role,
      createdAt: new Date(),
    },
  } as unknown as Context;
}

describe("sendMessage publishes to PubSub", () => {
  let publishSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    publishSpy = vi.spyOn(pubsub, "publish").mockResolvedValue(undefined as never);
  });

  it("publishes messageAdded event after sending a message", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      { query: SEND_MESSAGE, variables: { jobId: JOB_ID, content: "Hello!" } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
    }

    expect(publishSpy).toHaveBeenCalledWith(TOPIC_MESSAGE_ADDED(JOB_ID), {
      messageAdded: { ...fakeMessage, jobId: JOB_ID, jobDescription: "Kitchen renovation" },
    });
  });
});

describe("messageAdded subscription auth", () => {
  it("rejects unauthenticated users", async () => {
    const { subscriptionResolvers } = await import("../src/modules/messages/subscriptions.js");
    const subscribe = subscriptionResolvers.Subscription.messageAdded.subscribe;

    const ctx = { ...makeCtx(), user: null } as unknown as Context;

    await expect(subscribe(null, { jobId: JOB_ID }, ctx)).rejects.toThrow("Authentication");
  });

  it("rejects users without job access", async () => {
    const { subscriptionResolvers } = await import("../src/modules/messages/subscriptions.js");
    const subscribe = subscriptionResolvers.Subscription.messageAdded.subscribe;

    const ctx = makeCtx("HOMEOWNER");
    ctx.user!.id = "unrelated-user-id";
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeJob,
      contractorId: "other-contractor",
      homeowners: [],
    });

    await expect(subscribe(null, { jobId: JOB_ID }, ctx)).rejects.toThrow("You do not have access");
  });

  it("rejects when job does not exist", async () => {
    const { subscriptionResolvers } = await import("../src/modules/messages/subscriptions.js");
    const subscribe = subscriptionResolvers.Subscription.messageAdded.subscribe;

    const ctx = makeCtx("CONTRACTOR");
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(subscribe(null, { jobId: JOB_ID }, ctx)).rejects.toThrow("Job not found");
  });

  it("returns iterator for authorized users", async () => {
    const { subscriptionResolvers } = await import("../src/modules/messages/subscriptions.js");
    const subscribe = subscriptionResolvers.Subscription.messageAdded.subscribe;

    const ctx = makeCtx("CONTRACTOR");
    const iterator = await subscribe(null, { jobId: JOB_ID }, ctx);

    expect(iterator).toBeDefined();
    expect(iterator[Symbol.asyncIterator]).toBeDefined();
  });
});
