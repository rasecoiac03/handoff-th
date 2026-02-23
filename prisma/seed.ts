import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const contractor = await prisma.user.upsert({
    where: { email: "contractor@example.com" },
    update: {},
    create: {
      email: "contractor@example.com",
      password: "changeme",
      role: "CONTRACTOR",
    },
  });

  const homeowner = await prisma.user.upsert({
    where: { email: "homeowner@example.com" },
    update: {},
    create: {
      email: "homeowner@example.com",
      password: "changeme",
      role: "HOMEOWNER",
    },
  });

  const job = await prisma.job.create({
    data: {
      description: "Full kitchen renovation",
      location: "São Paulo, SP",
      contractorId: contractor.id,
      homeowners: { connect: { id: homeowner.id } },
    },
  });

  const chat = await prisma.chat.create({
    data: {
      jobId: job.id,
      participants: {
        connect: [{ id: contractor.id }, { id: homeowner.id }],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        chatId: chat.id,
        senderId: homeowner.id,
        content: "Hi! When can we start the kitchen renovation?",
      },
      {
        chatId: chat.id,
        senderId: contractor.id,
        content: "We can start next Monday. I'll send the materials list.",
      },
    ],
  });

  console.log("Seed complete:");
  console.log({ contractor, homeowner, job, chat });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
