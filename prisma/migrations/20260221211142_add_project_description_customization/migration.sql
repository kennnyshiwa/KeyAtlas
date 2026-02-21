-- CreateEnum
CREATE TYPE "ProjectDescriptionTextAlign" AS ENUM ('LEFT', 'CENTER', 'RIGHT');

-- CreateEnum
CREATE TYPE "ProjectDescriptionFontScale" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "ProjectDescriptionMaxWidth" AS ENUM ('NARROW', 'MEDIUM', 'WIDE', 'FULL');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "descriptionFontScale" "ProjectDescriptionFontScale" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "descriptionMaxWidth" "ProjectDescriptionMaxWidth" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "descriptionTextAlign" "ProjectDescriptionTextAlign" NOT NULL DEFAULT 'LEFT',
ADD COLUMN     "descriptionTextColor" TEXT;
