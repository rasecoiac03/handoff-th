import { PrismaClient, User } from "@prisma/client";
import prisma from "./db/prisma.js";
import { createLoaders, Loaders } from "./loaders/index.js";
import { verifyToken } from "./modules/auth/jwt.js";

export interface Context {
  prisma: PrismaClient;
  loaders: Loaders;
  user: User | null;
}

export async function createContext({
  req,
}: {
  req: { headers: Record<string, string | string[] | undefined> };
}): Promise<Context> {
  let user: User | null = null;

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const payload = verifyToken(token);
    if (payload) {
      user = await prisma.user.findUnique({ where: { id: payload.sub } });
    }
  }

  return {
    prisma,
    loaders: createLoaders(prisma),
    user,
  };
}
