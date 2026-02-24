import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";
import { messageResolvers } from "../src/modules/messages/resolvers.js";

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

  it("rejects when job does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      { query: SEND_MESSAGE, variables: { jobId: JOB_ID, content: "Hello!" } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });
});

describe("Chat.messages resolver", () => {
  function makeChatCtx() {
    return {
      prisma: {
        message: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        job: {
          findFirst: vi.fn().mockResolvedValue({ id: JOB_ID, description: "Kitchen renovation" }),
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
        role: "CONTRACTOR",
        createdAt: new Date(),
      },
    } as unknown as Context;
  }

  const chatParent = { id: CHAT_ID, jobId: JOB_ID, createdAt: new Date() };

  it("returns most recent messages in chronological order", async () => {
    const ctx = makeChatCtx();
    const now = Date.now();
    const msgs = [
      { id: "m3", chatId: CHAT_ID, senderId: USER_ID, content: "C", createdAt: new Date(now) },
      {
        id: "m2",
        chatId: CHAT_ID,
        senderId: USER_ID,
        content: "B",
        createdAt: new Date(now - 1000),
      },
      {
        id: "m1",
        chatId: CHAT_ID,
        senderId: USER_ID,
        content: "A",
        createdAt: new Date(now - 2000),
      },
    ];
    (ctx.prisma.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(msgs);

    const result = await messageResolvers.Chat.messages(chatParent, { limit: 2 }, ctx);

    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].node.content).toBe("B");
    expect(result.edges[1].node.content).toBe("C");
    expect(result.pageInfo.hasPreviousPage).toBe(true);
    expect(result.pageInfo.startCursor).toBe("m2");
  });

  it("passes before cursor to prisma", async () => {
    const ctx = makeChatCtx();
    (ctx.prisma.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await messageResolvers.Chat.messages(chatParent, { limit: 10, before: "cursor-id" }, ctx);

    expect(ctx.prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "cursor-id" },
        skip: 1,
      }),
    );
  });

  it("returns empty edges with null startCursor", async () => {
    const ctx = makeChatCtx();
    (ctx.prisma.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await messageResolvers.Chat.messages(chatParent, {}, ctx);

    expect(result.edges).toHaveLength(0);
    expect(result.pageInfo.hasPreviousPage).toBe(false);
    expect(result.pageInfo.startCursor).toBeNull();
  });

  it("enriches messages with jobId and jobDescription", async () => {
    const ctx = makeChatCtx();
    const msg = {
      id: "m1",
      chatId: CHAT_ID,
      senderId: USER_ID,
      content: "Hi",
      createdAt: new Date(),
    };
    (ctx.prisma.message.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([msg]);

    const result = await messageResolvers.Chat.messages(chatParent, {}, ctx);

    expect(result.edges[0].node.jobId).toBe(JOB_ID);
    expect(result.edges[0].node.jobDescription).toBe("Kitchen renovation");
  });
});

describe("Message.sender resolver", () => {
  it("loads sender via userLoader", () => {
    const ctx = makeCtx();
    const fakeUser = { id: USER_ID, email: "test@test.com", role: "CONTRACTOR" };
    (ctx.loaders.userLoader.load as ReturnType<typeof vi.fn>).mockReturnValue(fakeUser);

    const parent = { id: "m1", senderId: USER_ID, content: "Hi", createdAt: new Date() };
    const result = messageResolvers.Message.sender(parent as never, {}, ctx);

    expect(ctx.loaders.userLoader.load).toHaveBeenCalledWith(USER_ID);
    expect(result).toEqual(fakeUser);
  });
});
