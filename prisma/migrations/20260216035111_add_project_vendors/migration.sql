-- CreateTable
CREATE TABLE "project_vendors" (
    "id" TEXT NOT NULL,
    "region" TEXT,
    "storeLink" TEXT,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,

    CONSTRAINT "project_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_vendors_projectId_idx" ON "project_vendors"("projectId");

-- CreateIndex
CREATE INDEX "project_vendors_vendorId_idx" ON "project_vendors"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "project_vendors_projectId_vendorId_region_key" ON "project_vendors"("projectId", "vendorId", "region");

-- AddForeignKey
ALTER TABLE "project_vendors" ADD CONSTRAINT "project_vendors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_vendors" ADD CONSTRAINT "project_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
