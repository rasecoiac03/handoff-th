import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";

const CREATE_JOB = `
  mutation CreateJob($description: String!, $location: String!, $contractorId: String!) {
    createJob(description: $description, location: $location, contractorId: $contractorId) {
      id
      description
      location
      status
    }
  }
`;

function createMockContext(): Context {
  return {
    prisma: {
      job: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
    loaders: {
      userLoader: { load: vi.fn() },
      chatLoader: { load: vi.fn() },
      chatParticipantsLoader: { load: vi.fn() },
    },
  } as unknown as Context;
}

describe("createJob mutation", () => {
  it("creates a job with valid input", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext();

    const fakeJob = {
      id: "b3e2c1d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      description: "Kitchen renovation",
      location: "São Paulo, SP",
      status: "PLANNING",
      cost: null,
      contractorId: "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (ctx.prisma.job.create as ReturnType<typeof vi.fn>).mockResolvedValue(fakeJob);

    const response = await server.executeOperation(
      {
        query: CREATE_JOB,
        variables: {
          description: "Kitchen renovation",
          location: "São Paulo, SP",
          contractorId: "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d",
        },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeUndefined();
      expect(response.body.singleResult.data?.createJob).toMatchObject({
        id: fakeJob.id,
        description: "Kitchen renovation",
        location: "São Paulo, SP",
        status: "PLANNING",
      });
    }

    expect(ctx.prisma.job.create).toHaveBeenCalledWith({
      data: {
        description: "Kitchen renovation",
        location: "São Paulo, SP",
        contractorId: "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d",
      },
    });
  });

  it("rejects invalid input", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext();

    const response = await server.executeOperation(
      {
        query: CREATE_JOB,
        variables: {
          description: "",
          location: "São Paulo, SP",
          contractorId: "not-a-uuid",
        },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeDefined();
      expect(response.body.singleResult.errors?.[0]?.extensions?.code).toBe(
        "BAD_USER_INPUT",
      );
    }
  });
});
