import { describe, it, expect, vi } from "vitest";
import { ApolloServer } from "@apollo/server";
import bcrypt from "bcryptjs";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";
import { signToken, verifyToken } from "../src/modules/auth/jwt.js";
import { Context } from "../src/context.js";

const LOGIN = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
    }
  }
`;

function createMockContext(overrides: Partial<Context["prisma"]> = {}): Context {
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      job: { findMany: vi.fn() },
      ...overrides,
    },
    loaders: {
      userLoader: { load: vi.fn() },
      chatLoader: { load: vi.fn() },
      chatParticipantsLoader: { load: vi.fn() },
    },
    user: null,
  } as unknown as Context;
}

describe("JWT utilities", () => {
  it("signs and verifies a token", () => {
    const token = signToken("user-123");
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user-123");
  });

  it("returns null for an invalid token", () => {
    const payload = verifyToken("invalid-garbage-token");
    expect(payload).toBeNull();
  });
});

describe("login mutation", () => {
  it("returns a token with valid credentials", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext();
    const hashed = await bcrypt.hash("changeme", 10);

    (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d",
      email: "contractor@example.com",
      password: hashed,
      role: "CONTRACTOR",
      createdAt: new Date(),
    });

    const response = await server.executeOperation(
      {
        query: LOGIN,
        variables: { email: "contractor@example.com", password: "changeme" },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeUndefined();
      const token = (response.body.singleResult.data?.login as { token: string })?.token;
      expect(token).toBeDefined();
      expect(verifyToken(token)?.sub).toBe("a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d");
    }
  });

  it("rejects wrong password", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext();
    const hashed = await bcrypt.hash("changeme", 10);

    (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d",
      email: "contractor@example.com",
      password: hashed,
      role: "CONTRACTOR",
      createdAt: new Date(),
    });

    const response = await server.executeOperation(
      {
        query: LOGIN,
        variables: { email: "contractor@example.com", password: "wrong" },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeDefined();
      expect(response.body.singleResult.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects non-existent user", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext();

    (ctx.prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const response = await server.executeOperation(
      {
        query: LOGIN,
        variables: { email: "nobody@example.com", password: "changeme" },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeDefined();
      expect(response.body.singleResult.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
    }
  });

  it("rejects invalid email format", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    const ctx = createMockContext();

    const response = await server.executeOperation(
      {
        query: LOGIN,
        variables: { email: "not-an-email", password: "changeme" },
      },
      { contextValue: ctx },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeDefined();
      expect(response.body.singleResult.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    }
  });
});
