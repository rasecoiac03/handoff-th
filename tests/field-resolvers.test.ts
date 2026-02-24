import { describe, it, expect, vi } from "vitest";
import resolvers from "../src/resolvers/index.js";
import { Context } from "../src/context.js";

const USER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-1e2f3a4b5c6d";
const JOB_ID = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

function makeCtx(): Context {
  return {
    prisma: {
      job: {
        findUnique: vi.fn().mockResolvedValue({
          id: JOB_ID,
          homeowners: [{ id: "hw-1", email: "hw@example.com", role: "HOMEOWNER" }],
        }),
      },
    },
    loaders: {
      userLoader: { load: vi.fn().mockResolvedValue({ id: USER_ID, email: "c@test.com" }) },
      chatLoader: { load: vi.fn().mockResolvedValue([]) },
      chatParticipantsLoader: { load: vi.fn() },
    },
    user: {
      id: USER_ID,
      email: "contractor@example.com",
      password: "hashed",
      role: "CONTRACTOR",
      createdAt: new Date(),
    },
  } as unknown as Context;
}

const fakeJobParent = {
  id: JOB_ID,
  contractorId: USER_ID,
  description: "Kitchen renovation",
  location: "São Paulo",
  status: "PLANNING",
  cost: null,
  currentVersion: 1,
  headVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Job field resolvers", () => {
  it("contractor: loads via userLoader", async () => {
    const ctx = makeCtx();
    await resolvers.Job.contractor(fakeJobParent as never, {}, ctx);

    expect(ctx.loaders.userLoader.load).toHaveBeenCalledWith(USER_ID);
  });

  it("chats: loads via chatLoader", async () => {
    const ctx = makeCtx();
    await resolvers.Job.chats(fakeJobParent as never, {}, ctx);

    expect(ctx.loaders.chatLoader.load).toHaveBeenCalledWith(JOB_ID);
  });

  it("homeowners: fetches from prisma with include", async () => {
    const ctx = makeCtx();
    const result = await resolvers.Job.homeowners(fakeJobParent as never, {}, ctx);

    expect(ctx.prisma.job.findUnique).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      include: { homeowners: true },
    });
    expect(result).toEqual([{ id: "hw-1", email: "hw@example.com", role: "HOMEOWNER" }]);
  });

  it("homeowners: returns empty array when job not found", async () => {
    const ctx = makeCtx();
    (ctx.prisma.job.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await resolvers.Job.homeowners(fakeJobParent as never, {}, ctx);

    expect(result).toEqual([]);
  });
});
