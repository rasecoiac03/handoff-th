import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";

const CREATE_JOB = `
  mutation CreateJob($description: String!, $location: String!) {
    createJob(description: $description, location: $location) {
      id
      description
      location
      status
    }
  }
`;

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d";

const txJobRevisionCreate = vi.fn();

function createMockContext(role: "CONTRACTOR" | "HOMEOWNER" = "CONTRACTOR"): Context {
  txJobRevisionCreate.mockReset();
  return {
    prisma: {
      job: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      chat: {
        create: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: any) => any) =>
        fn({
          job: {
            create: vi.fn().mockResolvedValue({
              id: "b3e2c1d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
              description: "Kitchen renovation",
              location: "São Paulo, SP",
              status: "PLANNING",
              cost: null,
              contractorId: USER_ID,
              currentVersion: 1,
              headVersion: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          },
          chat: { create: vi.fn() },
          jobRevision: { create: txJobRevisionCreate },
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

describe("createJob mutation", () => {
  it("creates a job when authenticated as contractor", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext("CONTRACTOR");

    const response = await server.executeOperation(
      {
        query: CREATE_JOB,
        variables: {
          description: "Kitchen renovation",
          location: "São Paulo, SP",
        },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeUndefined();
      expect(response.body.singleResult.data?.createJob).toMatchObject({
        description: "Kitchen renovation",
        location: "São Paulo, SP",
        status: "PLANNING",
      });
    }

    expect(txJobRevisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          changedById: USER_ID,
          snapshot: expect.objectContaining({
            description: "Kitchen renovation",
            location: "São Paulo, SP",
            status: "PLANNING",
            cost: null,
          }),
        }),
      }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = { ...createMockContext(), user: null } as unknown as Context;

    const response = await server.executeOperation(
      {
        query: CREATE_JOB,
        variables: {
          description: "Kitchen renovation",
          location: "São Paulo, SP",
        },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeDefined();
      expect(response.body.singleResult.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects homeowners from creating jobs", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext("HOMEOWNER");

    const response = await server.executeOperation(
      {
        query: CREATE_JOB,
        variables: {
          description: "Kitchen renovation",
          location: "São Paulo, SP",
        },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeDefined();
      expect(response.body.singleResult.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    }
  });
});
