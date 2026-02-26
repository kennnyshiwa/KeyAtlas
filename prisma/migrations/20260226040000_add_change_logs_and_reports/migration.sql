-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'NON_ISSUE', 'RESOLVED');

-- CreateTable
CREATE TABLE "project_change_logs" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,

    CONSTRAINT "project_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_reports" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "projectId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,

    CONSTRAINT "project_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_change_logs_projectId_createdAt_idx" ON "project_change_logs"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "project_reports_status_createdAt_idx" ON "project_reports"("status", "createdAt");
CREATE INDEX "project_reports_projectId_idx" ON "project_reports"("projectId");
CREATE INDEX "project_reports_reporterId_idx" ON "project_reports"("reporterId");

-- AddForeignKey
ALTER TABLE "project_change_logs" ADD CONSTRAINT "project_change_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_change_logs" ADD CONSTRAINT "project_change_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_reports" ADD CONSTRAINT "project_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_reports" ADD CONSTRAINT "project_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_reports" ADD CONSTRAINT "project_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
