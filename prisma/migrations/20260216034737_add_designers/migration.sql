-- CreateTable
CREATE TABLE "designers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "avatar" TEXT,
    "bio" TEXT,
    "socialLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_designers" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "designerId" TEXT NOT NULL,

    CONSTRAINT "project_designers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designers_slug_key" ON "designers"("slug");

-- CreateIndex
CREATE INDEX "project_designers_projectId_idx" ON "project_designers"("projectId");

-- CreateIndex
CREATE INDEX "project_designers_designerId_idx" ON "project_designers"("designerId");

-- CreateIndex
CREATE UNIQUE INDEX "project_designers_projectId_designerId_key" ON "project_designers"("projectId", "designerId");

-- AddForeignKey
ALTER TABLE "project_designers" ADD CONSTRAINT "project_designers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_designers" ADD CONSTRAINT "project_designers_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "designers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
