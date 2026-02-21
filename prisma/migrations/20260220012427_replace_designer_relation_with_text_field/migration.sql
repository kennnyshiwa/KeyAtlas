/*
  Warnings:

  - You are about to drop the `designers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `project_designers` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "project_designers" DROP CONSTRAINT "project_designers_designerId_fkey";

-- DropForeignKey
ALTER TABLE "project_designers" DROP CONSTRAINT "project_designers_projectId_fkey";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "designer" TEXT;

-- DropTable
DROP TABLE "designers";

-- DropTable
DROP TABLE "project_designers";
