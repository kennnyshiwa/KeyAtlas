-- DropIndex
DROP INDEX "idx_project_links_geekhack_url";

-- AlterTable
ALTER TABLE "designers" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "designers_ownerId_idx" ON "designers"("ownerId");

-- AddForeignKey
ALTER TABLE "designers" ADD CONSTRAINT "designers_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
