-- CreateEnum
CREATE TYPE "ImageMirrorFailureStatus" AS ENUM ('PENDING', 'RESOLVED', 'GAVE_UP');

-- CreateTable
CREATE TABLE "image_mirror_failures" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ImageMirrorFailureStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "rewriteFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_mirror_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "image_mirror_failures_sourceUrl_key" ON "image_mirror_failures"("sourceUrl");

-- CreateIndex
CREATE INDEX "image_mirror_failures_status_nextAttemptAt_idx" ON "image_mirror_failures"("status", "nextAttemptAt");
