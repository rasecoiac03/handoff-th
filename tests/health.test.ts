import { describe, it, expect } from "vitest";
import { ApolloServer } from "@apollo/server";
import typeDefs from "../src/schema.js";
import resolvers from "../src/resolvers/index.js";

const HEALTH_QUERY = `query { health }`;

describe("health query", () => {
  it("returns OK", async () => {
    const server = new ApolloServer({ typeDefs, resolvers });

    const response = await server.executeOperation(
      { query: HEALTH_QUERY },
      { contextValue: { prisma: {}, loaders: {} } as any },
    );

    expect(response.body.kind).toBe("single");
    if (response.body.kind === "single") {
      expect(response.body.singleResult.errors).toBeUndefined();
      expect(response.body.singleResult.data?.health).toBe("OK");
    }
  });
});
