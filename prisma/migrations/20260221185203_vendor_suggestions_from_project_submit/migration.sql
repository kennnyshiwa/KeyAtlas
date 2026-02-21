-- CreateEnum
CREATE TYPE "VendorSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "vendor_suggestions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "status" "VendorSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "submittedById" TEXT NOT NULL,
    "projectId" TEXT,
    "reviewedById" TEXT,
    "vendorId" TEXT,

    CONSTRAINT "vendor_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_suggestions_status_createdAt_idx" ON "vendor_suggestions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "vendor_suggestions_submittedById_idx" ON "vendor_suggestions"("submittedById");

-- CreateIndex
CREATE INDEX "vendor_suggestions_projectId_idx" ON "vendor_suggestions"("projectId");

-- CreateIndex
CREATE INDEX "vendor_suggestions_normalizedName_idx" ON "vendor_suggestions"("normalizedName");

-- AddForeignKey
ALTER TABLE "vendor_suggestions" ADD CONSTRAINT "vendor_suggestions_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_suggestions" ADD CONSTRAINT "vendor_suggestions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_suggestions" ADD CONSTRAINT "vendor_suggestions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_suggestions" ADD CONSTRAINT "vendor_suggestions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
