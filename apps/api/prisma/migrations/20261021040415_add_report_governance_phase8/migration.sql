-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "pdfSha256" TEXT,
ADD COLUMN     "pdfStorageKey" TEXT,
ADD COLUMN     "propertyConfigVersion" INTEGER,
ADD COLUMN     "templateVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "institutional_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Plantilla Institucional Estándar',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "headerTitle" TEXT NOT NULL DEFAULT 'EG S.A.S. — PLATAFORMA SIGPROH',
    "headerSubtitle" TEXT NOT NULL DEFAULT 'GESTIÓN Y CONTROL DE NOVEDADES OPERATIVAS',
    "primaryColor" TEXT NOT NULL DEFAULT '#1E3A8A',
    "secondaryColor" TEXT NOT NULL DEFAULT '#2563EB',
    "footerText" TEXT NOT NULL DEFAULT 'Documento oficial generado por la Plataforma SIGPROH — EG S.A.S.',
    "mandatorySections" TEXT[] DEFAULT ARRAY['header', 'metadata', 'kpis', 'audit']::TEXT[],
    "allowedOptionalSections" TEXT[] DEFAULT ARRAY['introduction', 'issuesList', 'activities', 'evidences', 'observations', 'recommendations', 'finalComments']::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutional_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_report_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "customSubtitle" TEXT,
    "contactInfo" TEXT,
    "address" TEXT,
    "optionalSectionsOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_report_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_versions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "pdfStorageKey" TEXT,
    "pdfSha256" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_reviews" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "reportVersion" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReportStatus" NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_distributions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "reportVersion" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "distributedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institutional_templates_organizationId_idx" ON "institutional_templates"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "institutional_templates_organizationId_version_key" ON "institutional_templates"("organizationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "property_report_configs_propertyId_key" ON "property_report_configs"("propertyId");

-- CreateIndex
CREATE INDEX "property_report_configs_propertyId_idx" ON "property_report_configs"("propertyId");

-- CreateIndex
CREATE INDEX "report_versions_reportId_idx" ON "report_versions"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_reportId_versionNumber_key" ON "report_versions"("reportId", "versionNumber");

-- CreateIndex
CREATE INDEX "report_reviews_reportId_idx" ON "report_reviews"("reportId");

-- CreateIndex
CREATE INDEX "report_reviews_reviewerId_idx" ON "report_reviews"("reviewerId");

-- CreateIndex
CREATE INDEX "report_distributions_reportId_idx" ON "report_distributions"("reportId");

-- CreateIndex
CREATE INDEX "report_distributions_distributedById_idx" ON "report_distributions"("distributedById");

-- AddForeignKey
ALTER TABLE "institutional_templates" ADD CONSTRAINT "institutional_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutional_templates" ADD CONSTRAINT "institutional_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_report_configs" ADD CONSTRAINT "property_report_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_report_configs" ADD CONSTRAINT "property_report_configs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_report_configs" ADD CONSTRAINT "property_report_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_distributions" ADD CONSTRAINT "report_distributions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_distributions" ADD CONSTRAINT "report_distributions_distributedById_fkey" FOREIGN KEY ("distributedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
