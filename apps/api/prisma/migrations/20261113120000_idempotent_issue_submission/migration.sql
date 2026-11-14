-- Reintentos seguros al registrar novedades y subir adjuntos desde el celular
ALTER TABLE "issues" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "issue_attachments" ADD COLUMN "clientFileId" TEXT;

CREATE UNIQUE INDEX "issues_organizationId_clientRequestId_key" ON "issues"("organizationId", "clientRequestId");
CREATE UNIQUE INDEX "issue_attachments_issueId_clientFileId_key" ON "issue_attachments"("issueId", "clientFileId");
