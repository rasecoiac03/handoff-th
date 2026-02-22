import "dotenv/config";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import typeDefs from "./schema.js";
import resolvers from "./resolvers/index.js";
import { createContext } from "./context.js";

const server = new ApolloServer({ typeDefs, resolvers });

async function main() {
  const port = Number(process.env.PORT) || 4000;

  const { url } = await startStandaloneServer(server, {
    listen: { port },
    context: createContext,
  });

  console.log(`Server ready at ${url}`);
}

main();
