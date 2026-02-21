-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "profile" TEXT,
ADD COLUMN     "shipped" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "projects_profile_idx" ON "projects"("profile");

-- CreateIndex
CREATE INDEX "projects_shipped_idx" ON "projects"("shipped");
