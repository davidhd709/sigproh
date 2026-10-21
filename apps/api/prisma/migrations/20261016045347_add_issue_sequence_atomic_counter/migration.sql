-- CreateTable
CREATE TABLE "issue_sequences" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_sequences_organizationId_idx" ON "issue_sequences"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_sequences_organizationId_year_key" ON "issue_sequences"("organizationId", "year");

-- AddForeignKey
ALTER TABLE "issue_sequences" ADD CONSTRAINT "issue_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
