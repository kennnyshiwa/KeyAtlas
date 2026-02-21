-- CreateEnum
CREATE TYPE "ProjectHeroTextAlign" AS ENUM ('LEFT', 'CENTER', 'RIGHT');

-- CreateEnum
CREATE TYPE "ProjectHeroSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'FULL');

-- AlterTable
ALTER TABLE "project_images" ADD COLUMN     "linkUrl" TEXT,
ADD COLUMN     "openInNewTab" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "heroBgColor" TEXT,
ADD COLUMN     "heroSize" "ProjectHeroSize" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "heroTextAlign" "ProjectHeroTextAlign" NOT NULL DEFAULT 'LEFT',
ADD COLUMN     "heroTextColor" TEXT;
