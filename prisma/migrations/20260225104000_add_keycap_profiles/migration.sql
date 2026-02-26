-- CreateTable
CREATE TABLE "keycap_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "keycap_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "keycap_profiles_name_key" ON "keycap_profiles"("name");
CREATE INDEX "keycap_profiles_active_name_idx" ON "keycap_profiles"("active", "name");
