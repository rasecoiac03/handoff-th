-- AlterTable
ALTER TABLE "SubTask" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: assign positions based on createdAt order within each job
UPDATE "SubTask" t
SET "position" = sub.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "jobId" ORDER BY "createdAt") - 1 AS rn
  FROM "SubTask"
) sub
WHERE t."id" = sub."id";

-- CreateIndex
CREATE INDEX "SubTask_jobId_position_idx" ON "SubTask"("jobId", "position");
