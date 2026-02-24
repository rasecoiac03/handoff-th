import DataLoader from "dataloader";
import { PrismaClient, Chat } from "@prisma/client";

export function createChatLoader(prisma: PrismaClient) {
  return new DataLoader<string, Chat[]>(async (jobIds) => {
    const chats = await prisma.chat.findMany({
      where: { jobId: { in: [...jobIds] } },
    });

    const chatMap = new Map<string, Chat[]>();
    for (const chat of chats) {
      const list = chatMap.get(chat.jobId) ?? [];
      list.push(chat);
      chatMap.set(chat.jobId, list);
    }

    return jobIds.map((id) => chatMap.get(id) ?? []);
  });
}
