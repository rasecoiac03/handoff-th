import DataLoader from "dataloader";
import { PrismaClient, User } from "@prisma/client";

export function createChatParticipantsLoader(prisma: PrismaClient) {
  return new DataLoader<string, User[]>(async (chatIds) => {
    const chats = await prisma.chat.findMany({
      where: { id: { in: [...chatIds] } },
      include: { participants: true },
    });

    const participantMap = new Map<string, User[]>();
    for (const chat of chats) {
      participantMap.set(chat.id, chat.participants);
    }

    return chatIds.map((id) => participantMap.get(id) ?? []);
  });
}
