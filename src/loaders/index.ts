import { PrismaClient } from "@prisma/client";
import { createUserLoader } from "./userLoader.js";
import { createChatLoader } from "./chatLoader.js";
import { createChatParticipantsLoader } from "./chatParticipantsLoader.js";

export function createLoaders(prisma: PrismaClient) {
  return {
    userLoader: createUserLoader(prisma),
    chatLoader: createChatLoader(prisma),
    chatParticipantsLoader: createChatParticipantsLoader(prisma),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
