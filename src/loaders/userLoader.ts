import DataLoader from "dataloader";
import { PrismaClient, User } from "@prisma/client";

export function createUserLoader(prisma: PrismaClient) {
  return new DataLoader<string, User>(async (ids) => {
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    return ids.map((id) => userMap.get(id) ?? new Error(`User ${id} not found`));
  });
}
