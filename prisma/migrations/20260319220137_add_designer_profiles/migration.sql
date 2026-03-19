-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "designerId" TEXT;

-- CreateTable
CREATE TABLE "designers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "banner" TEXT,
    "description" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designers_slug_key" ON "designers"("slug");

-- CreateIndex
CREATE INDEX "projects_designerId_idx" ON "projects"("designerId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "designers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
