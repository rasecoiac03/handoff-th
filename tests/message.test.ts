import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";

const SEND_MESSAGE = `
  mutation SendMessage($jobId: ID!, $content: String!) {
    sendMessage(jobId: $jobId, content: $content) {
      id
      content
      senderId
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
        create: vi.fn().mockResolvedValue({
          id: "msg-001",
          chatId: CHAT_ID,
          senderId: USER_ID,
          content: "Hello!",
          createdAt: new Date().toISOString(),
        }),
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

describe("sendMessage mutation", () => {
  it("sends a message as the job contractor", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      {
        query: SEND_MESSAGE,
        variables: { jobId: JOB_ID, content: "Hello!" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect(res.body.singleResult.data?.sendMessage).toMatchObject({
        content: "Hello!",
        senderId: USER_ID,
      });
    }
  });

  it("creates a chat if none exists", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.chat.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (ctx.prisma.chat.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "new-chat-id",
      jobId: JOB_ID,
    });

    const res = await server.executeOperation(
      {
        query: SEND_MESSAGE,
        variables: { jobId: JOB_ID, content: "First message" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
    }
    expect(ctx.prisma.chat.create).toHaveBeenCalled();
  });

  it("rejects unauthenticated users", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = { ...makeCtx(), user: null } as unknown as Context;

    const res = await server.executeOperation(
      {
        query: SEND_MESSAGE,
        variables: { jobId: JOB_ID, content: "Hello!" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects users without access to the job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER");
    ctx.user!.id = "unrelated-user-id";

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeJob,
      contractorId: "other-contractor",
      homeowners: [],
    });

    const res = await server.executeOperation(
      {
        query: SEND_MESSAGE,
        variables: { jobId: JOB_ID, content: "Hello!" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});
