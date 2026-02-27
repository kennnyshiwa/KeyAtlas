-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WATCHLIST_MATCH';

-- AlterEnum
ALTER TYPE "NotificationPreferenceType" ADD VALUE 'WATCHLIST_MATCHES';

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_notifications" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedFilterId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "watchlist_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_filters_userId_idx" ON "saved_filters"("userId");

-- CreateIndex
CREATE INDEX "saved_filters_notify_idx" ON "saved_filters"("notify");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_notifications_savedFilterId_projectId_userId_key" ON "watchlist_notifications"("savedFilterId", "projectId", "userId");

-- CreateIndex
CREATE INDEX "watchlist_notifications_userId_projectId_idx" ON "watchlist_notifications"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_notifications" ADD CONSTRAINT "watchlist_notifications_savedFilterId_fkey" FOREIGN KEY ("savedFilterId") REFERENCES "saved_filters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
