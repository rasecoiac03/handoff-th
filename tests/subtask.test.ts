import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";

const CREATE_SUBTASK = `
  mutation CreateSubTask($jobId: ID!, $description: String!, $deadline: String, $cost: Float) {
    createSubTask(jobId: $jobId, description: $description, deadline: $deadline, cost: $cost) {
      id description deadline cost position jobId createdAt updatedAt
    }
  }
`;

const UPDATE_SUBTASK = `
  mutation UpdateSubTask($id: ID!, $description: String, $deadline: String, $cost: Float) {
    updateSubTask(id: $id, description: $description, deadline: $deadline, cost: $cost) {
      id description deadline cost jobId createdAt updatedAt
    }
  }
`;

const DELETE_SUBTASK = `
  mutation DeleteSubTask($id: ID!) {
    deleteSubTask(id: $id)
  }
`;

const GET_JOB_WITH_SUBTASKS = `
  query Job($id: ID!) {
    job(id: $id) {
      id
      subtasks { id description deadline cost position }
    }
  }
`;

const REORDER_SUBTASKS = `
  mutation ReorderSubTasks($jobId: ID!, $orderedIds: [ID!]!) {
    reorderSubTasks(jobId: $jobId, orderedIds: $orderedIds) {
      id position
    }
  }
`;

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d";
const OTHER_USER_ID = "d4c3b2a1-f6e5-4b7a-9d8c-6d5c4b3a2f1e";
const JOB_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
const SUBTASK_ID = "e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b";

const now = new Date().toISOString();

const fakeJob = {
  id: JOB_ID,
  description: "Kitchen renovation",
  location: "SP",
  status: "PLANNING",
  cost: null,
  contractorId: USER_ID,
  currentVersion: 1,
  headVersion: 1,
  homeowners: [],
  createdAt: now,
  updatedAt: now,
};

const fakeSubtask = {
  id: SUBTASK_ID,
  jobId: JOB_ID,
  description: "Buy materials",
  deadline: null,
  cost: 500,
  position: 0,
  createdAt: now,
  updatedAt: now,
};

function makeCtx(role: "CONTRACTOR" | "HOMEOWNER" = "CONTRACTOR"): Context {
  return {
    prisma: {
      job: {
        findUnique: vi.fn().mockResolvedValue(fakeJob),
        findMany: vi.fn(),
      },
      subTask: {
        create: vi.fn().mockResolvedValue(fakeSubtask),
        findUnique: vi.fn().mockResolvedValue({ ...fakeSubtask, job: fakeJob }),
        findMany: vi.fn().mockResolvedValue([fakeSubtask]),
        update: vi.fn().mockResolvedValue(fakeSubtask),
        delete: vi.fn().mockResolvedValue(fakeSubtask),
        aggregate: vi.fn().mockResolvedValue({ _max: { position: 0 } }),
      },
      $transaction: vi.fn((calls: any[]) => Promise.all(calls)),
    },
    loaders: {
      userLoader: {
        load: vi.fn().mockResolvedValue({
          id: USER_ID,
          email: "contractor@example.com",
          role: "CONTRACTOR",
          createdAt: now,
        }),
      },
      chatLoader: { load: vi.fn().mockResolvedValue([]) },
      chatParticipantsLoader: { load: vi.fn() },
    },
    user: {
      id: USER_ID,
      email: role === "CONTRACTOR" ? "contractor@example.com" : "homeowner@example.com",
      password: "hashed",
      role,
      createdAt: new Date(),
    },
  } as unknown as Context;
}

describe("createSubTask mutation", () => {
  it("creates a subtask when authenticated as contractor", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      {
        query: CREATE_SUBTASK,
        variables: { jobId: JOB_ID, description: "Buy materials", cost: 500 },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect(res.body.singleResult.data?.createSubTask).toMatchObject({
        id: SUBTASK_ID,
        description: "Buy materials",
        cost: 500,
        jobId: JOB_ID,
      });
    }

    expect(ctx.prisma.subTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId: JOB_ID,
        description: "Buy materials",
        cost: 500,
      }),
    });
  });

  it("returns NOT_FOUND when job does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      {
        query: CREATE_SUBTASK,
        variables: { jobId: JOB_ID, description: "Buy materials" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });

  it("rejects homeowners", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER");

    const res = await server.executeOperation(
      {
        query: CREATE_SUBTASK,
        variables: { jobId: JOB_ID, description: "Buy materials" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });

  it("rejects empty description", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      {
        query: CREATE_SUBTASK,
        variables: { jobId: JOB_ID, description: "" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
  });

  it("rejects negative cost", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      {
        query: CREATE_SUBTASK,
        variables: { jobId: JOB_ID, description: "Buy materials", cost: -10 },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
  });
});

describe("updateSubTask mutation", () => {
  it("updates a subtask with partial data", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");
    const updatedSubtask = { ...fakeSubtask, description: "Buy premium materials" };

    (ctx.prisma.subTask.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedSubtask);

    const res = await server.executeOperation(
      {
        query: UPDATE_SUBTASK,
        variables: { id: SUBTASK_ID, description: "Buy premium materials" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect(res.body.singleResult.data?.updateSubTask).toMatchObject({
        id: SUBTASK_ID,
        description: "Buy premium materials",
      });
    }

    expect(ctx.prisma.subTask.update).toHaveBeenCalledWith({
      where: { id: SUBTASK_ID },
      data: { description: "Buy premium materials" },
    });
  });

  it("returns NOT_FOUND when subtask does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.subTask.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      {
        query: UPDATE_SUBTASK,
        variables: { id: SUBTASK_ID, description: "Updated" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });

  it("rejects update when contractor does not own the parent job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.subTask.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeSubtask,
      job: { ...fakeJob, contractorId: OTHER_USER_ID },
    });

    const res = await server.executeOperation(
      {
        query: UPDATE_SUBTASK,
        variables: { id: SUBTASK_ID, description: "Updated" },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});

describe("deleteSubTask mutation", () => {
  it("deletes a subtask successfully", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      {
        query: DELETE_SUBTASK,
        variables: { id: SUBTASK_ID },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      expect(res.body.singleResult.data?.deleteSubTask).toBe(true);
    }

    expect(ctx.prisma.subTask.delete).toHaveBeenCalledWith({
      where: { id: SUBTASK_ID },
    });
  });

  it("returns NOT_FOUND when subtask does not exist", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.subTask.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await server.executeOperation(
      {
        query: DELETE_SUBTASK,
        variables: { id: SUBTASK_ID },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });

  it("rejects delete when contractor does not own the parent job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.subTask.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeSubtask,
      job: { ...fakeJob, contractorId: OTHER_USER_ID },
    });

    const res = await server.executeOperation(
      {
        query: DELETE_SUBTASK,
        variables: { id: SUBTASK_ID },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});

describe("Job.subtasks field resolver", () => {
  it("returns subtasks for a job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const res = await server.executeOperation(
      {
        query: GET_JOB_WITH_SUBTASKS,
        variables: { id: JOB_ID },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      const job = res.body.singleResult.data?.job as any;
      expect(job.subtasks).toHaveLength(1);
      expect(job.subtasks[0]).toMatchObject({
        id: SUBTASK_ID,
        description: "Buy materials",
        cost: 500,
      });
    }
  });

  it("returns empty array when job has no subtasks", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.subTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await server.executeOperation(
      {
        query: GET_JOB_WITH_SUBTASKS,
        variables: { id: JOB_ID },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      const job = res.body.singleResult.data?.job as any;
      expect(job.subtasks).toEqual([]);
    }
  });
});

const SUBTASK_ID_2 = "f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b9c";
const SUBTASK_ID_3 = "a7b8c9d0-e1f2-4a3b-8c4d-5e6f7a8b9c0d";

describe("reorderSubTasks mutation", () => {
  it("reorders subtasks successfully", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    const allSubtasks = [
      { ...fakeSubtask, id: SUBTASK_ID, position: 0 },
      { ...fakeSubtask, id: SUBTASK_ID_2, position: 1 },
      { ...fakeSubtask, id: SUBTASK_ID_3, position: 2 },
    ];

    (ctx.prisma.subTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      allSubtasks.map((s) => ({ id: s.id })),
    );

    const reordered = [
      { ...fakeSubtask, id: SUBTASK_ID_3, position: 0 },
      { ...fakeSubtask, id: SUBTASK_ID, position: 1 },
      { ...fakeSubtask, id: SUBTASK_ID_2, position: 2 },
    ];

    (ctx.prisma.$transaction as ReturnType<typeof vi.fn>).mockResolvedValue(reordered);

    const res = await server.executeOperation(
      {
        query: REORDER_SUBTASKS,
        variables: {
          jobId: JOB_ID,
          orderedIds: [SUBTASK_ID_3, SUBTASK_ID, SUBTASK_ID_2],
        },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors).toBeUndefined();
      const result = res.body.singleResult.data?.reorderSubTasks as any[];
      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ id: SUBTASK_ID_3, position: 0 });
      expect(result[1]).toMatchObject({ id: SUBTASK_ID, position: 1 });
      expect(result[2]).toMatchObject({ id: SUBTASK_ID_2, position: 2 });
    }
  });

  it("rejects when orderedIds don't match existing subtasks", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.subTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: SUBTASK_ID },
      { id: SUBTASK_ID_2 },
    ]);

    const res = await server.executeOperation(
      {
        query: REORDER_SUBTASKS,
        variables: {
          jobId: JOB_ID,
          orderedIds: [SUBTASK_ID, SUBTASK_ID_3],
        },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
  });

  it("rejects when contractor does not own the job", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("CONTRACTOR");

    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...fakeJob,
      contractorId: OTHER_USER_ID,
    });

    const res = await server.executeOperation(
      {
        query: REORDER_SUBTASKS,
        variables: { jobId: JOB_ID, orderedIds: [SUBTASK_ID] },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });

  it("rejects homeowners", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = makeCtx("HOMEOWNER");

    const res = await server.executeOperation(
      {
        query: REORDER_SUBTASKS,
        variables: { jobId: JOB_ID, orderedIds: [SUBTASK_ID] },
      },
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
      {
        query: REORDER_SUBTASKS,
        variables: { jobId: JOB_ID, orderedIds: [SUBTASK_ID] },
      },
      { contextValue: ctx },
    );

    expect(res.body.kind).toBe("single");
    if (res.body.kind === "single") {
      expect(res.body.singleResult.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    }
  });
});
