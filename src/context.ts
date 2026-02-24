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

async function resolveUserFromToken(raw: unknown): Promise<User | null> {
  if (typeof raw !== "string" || !raw.startsWith("Bearer ")) return null;
  const payload = verifyToken(raw.slice(7));
  if (!payload) return null;
  return prisma.user.findUnique({ where: { id: payload.sub } });
}

export async function createWsContext(
  connectionParams: Record<string, unknown> | undefined,
): Promise<Context> {
  const user = await resolveUserFromToken(connectionParams?.Authorization);

  return {
    prisma,
    loaders: createLoaders(prisma),
    user,
  };
}
