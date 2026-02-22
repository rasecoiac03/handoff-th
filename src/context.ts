import { PrismaClient } from "@prisma/client";
import prisma from "./db/prisma.js";

export interface Context {
  prisma: PrismaClient;
}

export async function createContext(): Promise<Context> {
  return { prisma };
}
