import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/use/ws";

import typeDefs from "./schema.js";
import resolvers from "./resolvers/index.js";
import { createContext, createWsContext } from "./context.js";

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = http.createServer(app);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: "/graphql",
});

const wsServerCleanup = useServer(
  {
    schema,
    context: async (ctx) => createWsContext(ctx.connectionParams as Record<string, unknown>),
  },
  wsServer,
);

const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await wsServerCleanup.dispose();
          },
        };
      },
    },
  ],
});

async function main() {
  const port = Number(process.env.PORT) || 4000;

  await server.start();

  app.use(
    "/graphql",
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server, { context: createContext }),
  );

  httpServer.listen(port, () => {
    console.log(`HTTP server ready at http://localhost:${port}/graphql`);
    console.log(`WS server ready at ws://localhost:${port}/graphql`);
  });
}

main();
