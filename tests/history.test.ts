import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";
import { createSnapshot } from "../src/modules/jobs/history.js";

const JOB_HISTORY = `
  query JobHistory($jobId: ID!) {
    jobHistory(jobId: $jobId) {
      id version snapshot createdAt
      changedBy { id email }
    }
  }
`;

const UNDO_JOB = `mutation UndoJob($jobId: ID!) { undoJob(jobId: $jobId) { id currentVersion headVersion description status } }`;
const REDO_JOB = `mutation RedoJob($jobId: ID!) { redoJob(jobId: $jobId) { id currentVersion headVersion description status } }`;
const UPDATE_JOB = `
  mutation UpdateJob($id: ID!, $description: String) {
    updateJob(id: $id, description: $description) {
      id currentVersion headVersion description
    }
  }
`;

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d";
const HOMEOWNER_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const JOB_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

const fakeRevisions = [
  {
    id: "rev-1",
    jobId: JOB_ID,
    version: 1,
    snapshot: {
      description: "Original",
      location: "SP",
      status: "PLANNING",
      cost: null,
      updatedAt: new Date().toISOString(),
    },
    changedById: USER_ID,
    createdAt: new Date(),
  },
  {
    id: "rev-2",
    jobId: JOB_ID,
    version: 2,
    snapshot: {
      description: "Updated",
      location: "SP",
      status: "IN_PROGRESS",
      cost: 5000,
      updatedAt: new Date().toISOString(),
    },
    changedById: USER_ID,
    createdAt: new Date(),
  },
];

function makeCtx(role: "CONTRACTOR" | "HOMEOWNER" = "CONTRACTOR", userId = USER_ID): Context {
  return {
    prisma: {
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID,
          description: "Updated",
          location: "SP",
          status: "IN_PROGRESS",
          cost: 5000,
          contractorId: USER_ID,
          currentVersion: 2,
          headVersion: 2,
          homeowners: [{ id: HOMEOWNER_ID }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      jobRevision: {
        findMany: vi.fn().mockResolvedValue(fakeRevisions),
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: any) => any) =>
        fn({
          job: {
            update: vi.fn().mockResolvedValue({
              id: JOB_ID,
              description: "Original",
              location: "SP",
              status: "PLANNING",
              cost: null,
              contractorId: USER_ID,
              currentVersion: 1,
              headVersion: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          },
          jobRevision: {
            findUnique: vi.fn().mockResolvedValue(fakeRevisions[0]),
            deleteMany: vi.fn(),
            create: vi.fn(),
          },
          subTask: {
            deleteMany: vi.fn(),
            create: vi.fn(),
          },
        }),
      ),
    },
    loaders: {
      userLoader: {
        load: vi.fn().mockResolvedValue({
          id: USER_ID,
          email: "contractor@example.com",
          role: "CONTRACTOR",
          createdAt: new Date().toISOString(),
        }),
      },
      chatLoader: { load: vi.fn() },
      chatParticipantsLoader: { load: vi.fn() },
    },
    user: {
      id: userId,
      email: role === "CONTRACTOR" ? "contractor@example.com" : "homeowner@example.com",
      password: "hashed",
      role,
      createdAt: new Date(),
    },
  } as unknown as Context;
}

describe("jobHistory query", () => {
  it("returns revisions for an authorized user", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      { query: JOB_HISTORY, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      const history = res.body.singleResult.data?.jobHistory as any[];
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
    }
  });

  it("allows homeowners with access to view history", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER", HOMEOWNER_ID);

    const res = await server.executeOperation(
      { query: JOB_HISTORY, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
    }
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      { query: JOB_HISTORY, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });

  it("rejects unauthenticated requests", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = { ...makeCtx(), user: null } as unknown as Context;

    const res = await server.executeOperation(
      { query: JOB_HISTORY, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects unauthorized users", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER", "unrelated-user-id");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: JOB_ID,
      contractorId: USER_ID,
      homeowners: [],
    });

    const res = await server.executeOperation(
      { query: JOB_HISTORY, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});

describe("undoJob mutation", () => {
  it("reverts to previous snapshot", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      { query: UNDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      const job = res.body.singleResult.data?.undoJob as any;
      expect(job.currentVersion).toBe(1);
      expect(job.description).toBe("Original");
    }
  });

  it("throws when already at version 1", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: JOB_ID,
      contractorId: USER_ID,
      currentVersion: 1,
      headVersion: 1,
    });

    const res = await server.executeOperation(
      { query: UNDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
  });

  it("rejects non-owner contractors", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: JOB_ID,
      contractorId: "someone-else",
      currentVersion: 2,
      headVersion: 2,
    });

    const res = await server.executeOperation(
      { query: UNDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      { query: UNDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });

  it("rejects homeowners", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER", HOMEOWNER_ID);

    const res = await server.executeOperation(
      { query: UNDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});

describe("redoJob mutation", () => {
  it("advances to next snapshot", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: JOB_ID,
      contractorId: USER_ID,
      currentVersion: 1,
      headVersion: 2,
    });

    (ctx.prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (tx: any) => any) =>
        fn({
          job: {
            update: vi.fn().mockResolvedValue({
              id: JOB_ID,
              description: "Updated",
              location: "SP",
              status: "IN_PROGRESS",
              cost: 5000,
              contractorId: USER_ID,
              currentVersion: 2,
              headVersion: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          },
          jobRevision: {
            findUnique: vi.fn().mockResolvedValue(fakeRevisions[1]),
          },
          subTask: {
            deleteMany: vi.fn(),
            create: vi.fn(),
          },
        }),
    );

    const res = await server.executeOperation(
      { query: REDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      const job = res.body.singleResult.data?.redoJob as any;
      expect(job.currentVersion).toBe(2);
      expect(job.description).toBe("Updated");
    }
  });

  it("throws when already at head version", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      { query: REDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      { query: REDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });

  it("rejects non-owner contractors", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: JOB_ID,
      contractorId: "someone-else",
      currentVersion: 1,
      headVersion: 2,
    });

    const res = await server.executeOperation(
      { query: REDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });

  it("rejects homeowners", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER", HOMEOWNER_ID);

    const res = await server.executeOperation(
      { query: REDO_JOB, variables: { jobId: JOB_ID } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});

describe("updateJob clears redo stack", () => {
  it("clears future revisions when updating from a non-head version", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: JOB_ID,
      description: "Original",
      location: "SP",
      status: "PLANNING",
      cost: null,
      contractorId: USER_ID,
      currentVersion: 1,
      headVersion: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const txDeleteMany = vi.fn();
    const txCreate = vi.fn();
    (ctx.prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (fn: (tx: any) => any) =>
        fn({
          job: {
            update: vi.fn().mockResolvedValue({
              id: JOB_ID,
              description: "New update",
              location: "SP",
              status: "PLANNING",
              cost: null,
              contractorId: USER_ID,
              currentVersion: 2,
              headVersion: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          },
          jobRevision: {
            deleteMany: txDeleteMany,
            create: txCreate,
          },
          subTask: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        }),
    );

    const res = await server.executeOperation(
      { query: UPDATE_JOB, variables: { id: JOB_ID, description: "New update" } },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      const job = res.body.singleResult.data?.updateJob as any;
      expect(job.currentVersion).toBe(2);
      expect(job.headVersion).toBe(2);
    }

    expect(txDeleteMany).toHaveBeenCalledWith({
      where: { jobId: JOB_ID, version: { gt: 1 } },
    });

    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: JOB_ID,
          version: 2,
          changedById: USER_ID,
        }),
      }),
    );
  });
});

describe("createSnapshot", () => {
  it("extracts the correct fields from a job", () => {
    const now = new Date();
    const job = {
      id: "job-1",
      description: "Kitchen reno",
      location: "São Paulo",
      status: "PLANNING",
      cost: 15000,
      contractorId: "user-1",
      currentVersion: 1,
      headVersion: 1,
      createdAt: now,
      updatedAt: now,
    } as any;

    const snapshot = createSnapshot(job, []);

    expect(snapshot).toEqual({
      description: "Kitchen reno",
      location: "São Paulo",
      status: "PLANNING",
      cost: 15000,
      updatedAt: now.toISOString(),
      subtasks: [],
    });
    expect(snapshot).not.toHaveProperty("id");
    expect(snapshot).not.toHaveProperty("contractorId");
    expect(snapshot).not.toHaveProperty("createdAt");
  });

  it("handles Date updatedAt", () => {
    const date = new Date("2026-01-15T10:00:00Z");
    const job = {
      description: "Test",
      location: "RJ",
      status: "IN_PROGRESS",
      cost: null,
      updatedAt: date,
    } as any;

    const snapshot = createSnapshot(job, []);
    expect(snapshot.updatedAt).toBe("2026-01-15T10:00:00.000Z");
  });

  it("handles string updatedAt", () => {
    const job = {
      description: "Test",
      location: "RJ",
      status: "COMPLETED",
      cost: 500,
      updatedAt: "2026-02-20T12:00:00.000Z",
    } as any;

    const snapshot = createSnapshot(job, []);
    expect(snapshot.updatedAt).toBe("2026-02-20T12:00:00.000Z");
  });

  it("serializes null cost correctly", () => {
    const job = {
      description: "Test",
      location: "SP",
      status: "PLANNING",
      cost: null,
      updatedAt: new Date(),
    } as any;

    const snapshot = createSnapshot(job, []);
    expect(snapshot.cost).toBeNull();
  });

  it("includes subtasks in the snapshot", () => {
    const now = new Date();
    const job = {
      description: "Test",
      location: "SP",
      status: "PLANNING",
      cost: null,
      updatedAt: now,
    } as any;

    const subtasks = [
      {
        id: "st-1",
        jobId: "job-1",
        description: "Buy materials",
        deadline: new Date("2026-03-01T00:00:00Z"),
        cost: 500,
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "st-2",
        jobId: "job-1",
        description: "Schedule crew",
        deadline: null,
        cost: null,
        position: 1,
        createdAt: now,
        updatedAt: now,
      },
    ] as any[];

    const snapshot = createSnapshot(job, subtasks);

    expect(snapshot.subtasks).toEqual([
      { description: "Buy materials", deadline: "2026-03-01T00:00:00.000Z", cost: 500, position: 0 },
      { description: "Schedule crew", deadline: null, cost: null, position: 1 },
    ]);
  });
});
