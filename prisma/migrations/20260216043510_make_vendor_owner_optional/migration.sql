-- DropForeignKey
ALTER TABLE "vendors" DROP CONSTRAINT "vendors_ownerId_fkey";

-- DropIndex
DROP INDEX "vendors_ownerId_key";

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "ownerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "vendors_ownerId_idx" ON "vendors"("ownerId");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
