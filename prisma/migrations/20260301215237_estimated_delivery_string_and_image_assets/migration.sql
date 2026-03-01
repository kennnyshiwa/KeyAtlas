-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "estimatedDelivery" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "image_assets" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "image_assets_sha256_key" ON "image_assets"("sha256");

-- CreateIndex
CREATE INDEX "image_assets_uploaderId_idx" ON "image_assets"("uploaderId");

-- AddForeignKey
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
