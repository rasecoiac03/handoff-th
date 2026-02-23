import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("changeme", 10);

  const contractor = await prisma.user.upsert({
    where: { email: "contractor@example.com" },
    update: { password: hashedPassword },
    create: {
      email: "contractor@example.com",
      password: hashedPassword,
      role: "CONTRACTOR",
    },
  });

  const homeowner = await prisma.user.upsert({
    where: { email: "homeowner@example.com" },
    update: { password: hashedPassword },
    create: {
      email: "homeowner@example.com",
      password: hashedPassword,
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

  await prisma.jobRevision.create({
    data: {
      jobId: job.id,
      version: 1,
      snapshot: {
        description: job.description,
        location: job.location,
        status: job.status,
        cost: job.cost,
        updatedAt: job.updatedAt,
      },
      changedById: contractor.id,
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
  console.log({ contractor: contractor.email, homeowner: homeowner.email, jobId: job.id });
  console.log("Password for both users: changeme");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
