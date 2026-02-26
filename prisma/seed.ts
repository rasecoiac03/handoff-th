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

  const subtasks = await Promise.all([
    prisma.subTask.create({
      data: {
        jobId: job.id,
        description: "Purchase kitchen cabinets",
        deadline: new Date("2026-04-01"),
        cost: 3500,
        position: 0,
      },
    }),
    prisma.subTask.create({
      data: {
        jobId: job.id,
        description: "Install countertops",
        deadline: new Date("2026-04-15"),
        cost: 2000,
        position: 1,
      },
    }),
    prisma.subTask.create({
      data: {
        jobId: job.id,
        description: "Plumbing and electrical work",
        deadline: null,
        cost: null,
        position: 2,
      },
    }),
  ]);

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
        subtasks: subtasks.map((st) => ({
          description: st.description,
          deadline: st.deadline?.toISOString() ?? null,
          cost: st.cost,
          position: st.position,
        })),
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
  console.log({ contractor: contractor.email, homeowner: homeowner.email, jobId: job.id, subtasks: subtasks.length });
  console.log("Password for both users: changeme");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
