import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";

const JOBS_QUERY = `query { jobs { id description status } }`;

const JOB_QUERY = `query Job($id: ID!) { job(id: $id) { id description status } }`;

const UPDATE_JOB = `
  mutation UpdateJob($id: ID!, $status: JobStatus, $cost: Float) {
    updateJob(id: $id, status: $status, cost: $cost) {
      id status cost
    }
  }
`;

const DELETE_JOB = `mutation DeleteJob($id: ID!) { deleteJob(id: $id) }`;

const ADD_HOMEOWNER = `
  mutation AddHomeowner($jobId: ID!, $homeownerId: ID!) {
    addHomeownerToJob(jobId: $jobId, homeownerId: $homeownerId) {
      id
    }
  }
`;

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d";
const HOMEOWNER_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const JOB_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

const fakeJob = {
  id: JOB_ID,
  description: "Kitchen renovation",
  location: "São Paulo, SP",
  status: "PLANNING",
  cost: null,
  contractorId: USER_ID,
  currentVersion: 1,
  headVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const txJobRevisionDeleteMany = vi.fn();

function makeCtx(role: "CONTRACTOR" | "HOMEOWNER" = "CONTRACTOR"): Context {
  txJobRevisionDeleteMany.mockReset();
  return {
    prisma: {
      job: {
        findMany: vi.fn().mockResolvedValue([fakeJob]),
        findUnique: vi.fn().mockResolvedValue({ ...fakeJob, homeowners: [{ id: USER_ID }] }),
        update: vi.fn().mockResolvedValue({ ...fakeJob, status: "IN_PROGRESS", cost: 10000 }),
        delete: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      chat: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        deleteMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: any) => any) =>
        fn({
          job: {
            delete: vi.fn(),
            update: vi.fn().mockResolvedValue({
              ...fakeJob,
              status: "IN_PROGRESS",
              cost: 10000,
              currentVersion: 2,
              headVersion: 2,
            }),
          },
          chat: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
          message: { deleteMany: vi.fn() },
          jobRevision: { deleteMany: txJobRevisionDeleteMany, create: vi.fn() },
          subTask: { findMany: vi.fn().mockResolvedValue([]) },
        }),
      ),
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

describe("jobs query", () => {
  it("returns jobs for a contractor", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation({ query: JOBS_QUERY }, { contextValue: ctx });

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect(res.body.singleResult.data?.jobs).toHaveLength(1);
    }

    expect(ctx.prisma.job.findMany).toHaveBeenCalledWith({
      where: { contractorId: USER_ID },
    });
  });

  it("returns assigned jobs for a homeowner", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER");

    const res = await server.executeOperation({ query: JOBS_QUERY }, { contextValue: ctx });

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
    }

    expect(ctx.prisma.job.findMany).toHaveBeenCalledWith({
      where: { homeowners: { some: { id: USER_ID } } },
    });
  });

  it("rejects unauthenticated requests", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = { ...makeCtx(), user: null } as unknown as Context;

    const res = await server.executeOperation({ query: JOBS_QUERY }, { contextValue: ctx });

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    }
  });
});

describe("job query", () => {
  it("returns a job the user has access to", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      { query: JOB_QUERY, variables: { id: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect((res.body.singleResult.data?.job as any)?.id).toBe(JOB_ID);
    }
  });

  it("rejects access to a job the user is not associated with", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER");
    ctx.user!.id = "unrelated-homeowner-id";
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeJob,
      homeowners: [],
    });

    const res = await server.executeOperation(
      { query: JOB_QUERY, variables: { id: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});

describe("updateJob mutation", () => {
  it("updates a job owned by the contractor", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      {
        query: UPDATE_JOB,
        variables: { id: JOB_ID, status: "IN_PROGRESS", cost: 10000 },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect((res.body.singleResult.data?.updateJob as any)?.status).toBe("IN_PROGRESS");
    }
  });

  it("rejects update by a non-owner contractor", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeJob,
      contractorId: "someone-else",
    });

    const res = await server.executeOperation(
      { query: UPDATE_JOB, variables: { id: JOB_ID, status: "IN_PROGRESS" } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});

describe("deleteJob mutation", () => {
  it("deletes a job owned by the contractor", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      { query: DELETE_JOB, variables: { id: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect(res.body.singleResult.data?.deleteJob).toBe(true);
    }

    expect(txJobRevisionDeleteMany).toHaveBeenCalledWith({
      where: { jobId: JOB_ID },
    });
  });

  it("deletes a job with associated chats and messages", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const txChatDeleteMany = vi.fn();
    const txMessageDeleteMany = vi.fn();
    (ctx.prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (tx: Record<string, unknown>) => unknown) =>
        fn({
          job: { delete: vi.fn() },
          chat: {
            findMany: vi.fn().mockResolvedValue([{ id: "chat-1" }, { id: "chat-2" }]),
            deleteMany: txChatDeleteMany,
          },
          message: { deleteMany: txMessageDeleteMany },
          jobRevision: { deleteMany: vi.fn() },
        }),
    );

    const res = await server.executeOperation(
      { query: DELETE_JOB, variables: { id: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
    }

    expect(txMessageDeleteMany).toHaveBeenCalledWith({
      where: { chatId: { in: ["chat-1", "chat-2"] } },
    });
    expect(txChatDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["chat-1", "chat-2"] } },
    });
  });

  it("rejects deletion of a non-existent job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      { query: DELETE_JOB, variables: { id: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });
});

describe("addHomeownerToJob mutation", () => {
  it("adds a homeowner to a job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: HOMEOWNER_ID,
      email: "homeowner@example.com",
      role: "HOMEOWNER",
    });

    (ctx.prisma.job.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeJob,
      homeowners: [{ id: HOMEOWNER_ID }],
    });

    const res = await server.executeOperation(
      {
        query: ADD_HOMEOWNER,
        variables: { jobId: JOB_ID, homeownerId: HOMEOWNER_ID },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect((res.body.singleResult.data?.addHomeownerToJob as any)?.id).toBe(JOB_ID);
    }
  });

  it("rejects when job does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      { query: ADD_HOMEOWNER, variables: { jobId: JOB_ID, homeownerId: HOMEOWNER_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });

  it("rejects when contractor does not own the job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeJob,
      contractorId: "other-contractor",
    });

    const res = await server.executeOperation(
      { query: ADD_HOMEOWNER, variables: { jobId: JOB_ID, homeownerId: HOMEOWNER_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });

  it("rejects adding a user with wrong role", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: HOMEOWNER_ID,
      email: "another-contractor@example.com",
      role: "CONTRACTOR",
    });

    const res = await server.executeOperation(
      {
        query: ADD_HOMEOWNER,
        variables: { jobId: JOB_ID, homeownerId: HOMEOWNER_ID },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
  });
});
