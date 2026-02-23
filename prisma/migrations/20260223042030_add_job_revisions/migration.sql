-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "headVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "JobRevision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobRevision_jobId_version_key" ON "JobRevision"("jobId", "version");

-- AddForeignKey
ALTER TABLE "JobRevision" ADD CONSTRAINT "JobRevision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRevision" ADD CONSTRAINT "JobRevision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
