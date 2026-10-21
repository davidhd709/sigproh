-- CreateEnum
CREATE TYPE "ReportScope" AS ENUM ('PROPIEDAD', 'INTERNA', 'CONSOLIDADO');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('BORRADOR', 'EN_REVISION', 'DEVUELTO', 'APROBADO');

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "scope" "ReportScope" NOT NULL,
    "title" TEXT NOT NULL,
    "propertyId" TEXT,
    "internalAreaId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "cutoffDate" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'BORRADOR',
    "version" INTEGER NOT NULL DEFAULT 1,
    "introduction" TEXT,
    "observations" TEXT,
    "recommendations" TEXT,
    "finalComments" TEXT,
    "selectedAttachmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "showIntroduction" BOOLEAN NOT NULL DEFAULT true,
    "showKpis" BOOLEAN NOT NULL DEFAULT true,
    "showIssuesList" BOOLEAN NOT NULL DEFAULT true,
    "showActivities" BOOLEAN NOT NULL DEFAULT true,
    "showEvidences" BOOLEAN NOT NULL DEFAULT true,
    "showPendingIssues" BOOLEAN NOT NULL DEFAULT true,
    "showObservations" BOOLEAN NOT NULL DEFAULT true,
    "showRecommendations" BOOLEAN NOT NULL DEFAULT true,
    "showFinalComments" BOOLEAN NOT NULL DEFAULT true,
    "operationalData" JSONB,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_organizationId_idx" ON "reports"("organizationId");

-- CreateIndex
CREATE INDEX "reports_scope_idx" ON "reports"("scope");

-- CreateIndex
CREATE INDEX "reports_propertyId_idx" ON "reports"("propertyId");

-- CreateIndex
CREATE INDEX "reports_internalAreaId_idx" ON "reports"("internalAreaId");

-- CreateIndex
CREATE INDEX "reports_createdById_idx" ON "reports"("createdById");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reports_organizationId_code_key" ON "reports"("organizationId", "code");

-- CreateIndex
CREATE INDEX "report_sequences_organizationId_idx" ON "report_sequences"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "report_sequences_organizationId_year_key" ON "report_sequences"("organizationId", "year");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_internalAreaId_fkey" FOREIGN KEY ("internalAreaId") REFERENCES "internal_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_sequences" ADD CONSTRAINT "report_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
