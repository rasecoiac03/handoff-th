import { PrismaClient } from "@prisma/client";
import prisma from "./db/prisma.js";
import { createLoaders, Loaders } from "./loaders/index.js";

export interface Context {
  prisma: PrismaClient;
  loaders: Loaders;
}

export async function createContext(): Promise<Context> {
  return {
    prisma,
    loaders: createLoaders(prisma),
  };
}
