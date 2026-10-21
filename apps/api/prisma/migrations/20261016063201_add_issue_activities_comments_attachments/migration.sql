-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDIENTE', 'EN_CURSO', 'BLOQUEADA', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EvidenceStage" AS ENUM ('INICIAL', 'EJECUCION', 'FINAL', 'SOPORTE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IssueEventType" ADD VALUE 'ACTIVIDAD_CREADA';
ALTER TYPE "IssueEventType" ADD VALUE 'ACTIVIDAD_ASIGNADA';
ALTER TYPE "IssueEventType" ADD VALUE 'ACTIVIDAD_REASIGNADA';
ALTER TYPE "IssueEventType" ADD VALUE 'ACTIVIDAD_ESTADO';
ALTER TYPE "IssueEventType" ADD VALUE 'COMENTARIO_AGREGADO';
ALTER TYPE "IssueEventType" ADD VALUE 'EVIDENCIA_ADJUNTADA';

-- CreateTable
CREATE TABLE "issue_activities" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDIENTE',
    "statusReason" TEXT,
    "assignedUserId" TEXT,
    "createdById" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_comments" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "activityId" TEXT,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_attachments" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "activityId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "stage" "EvidenceStage" NOT NULL DEFAULT 'SOPORTE',
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_activities_issueId_idx" ON "issue_activities"("issueId");

-- CreateIndex
CREATE INDEX "issue_activities_assignedUserId_idx" ON "issue_activities"("assignedUserId");

-- CreateIndex
CREATE INDEX "issue_activities_status_idx" ON "issue_activities"("status");

-- CreateIndex
CREATE INDEX "issue_comments_issueId_idx" ON "issue_comments"("issueId");

-- CreateIndex
CREATE INDEX "issue_comments_activityId_idx" ON "issue_comments"("activityId");

-- CreateIndex
CREATE INDEX "issue_comments_userId_idx" ON "issue_comments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_attachments_storageKey_key" ON "issue_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "issue_attachments_issueId_idx" ON "issue_attachments"("issueId");

-- CreateIndex
CREATE INDEX "issue_attachments_activityId_idx" ON "issue_attachments"("activityId");

-- CreateIndex
CREATE INDEX "issue_attachments_uploadedById_idx" ON "issue_attachments"("uploadedById");

-- CreateIndex
CREATE INDEX "issue_attachments_stage_idx" ON "issue_attachments"("stage");

-- AddForeignKey
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_activities" ADD CONSTRAINT "issue_activities_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "issue_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "issue_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
