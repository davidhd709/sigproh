-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMINISTRADOR', 'DIRECTOR_OPERATIVO', 'GERENTE', 'AUXILIAR_GERENCIA', 'COORDINADOR_OPERATIVO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'COORDINADOR_OPERATIVO';

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "nit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_zones" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_assignments" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_areas" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area_assignments" (
    "id" TEXT NOT NULL,
    "internalAreaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_organizationId_idx" ON "properties"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "properties_organizationId_code_key" ON "properties"("organizationId", "code");

-- CreateIndex
CREATE INDEX "property_zones_propertyId_idx" ON "property_zones"("propertyId");

-- CreateIndex
CREATE INDEX "property_assignments_userId_idx" ON "property_assignments"("userId");

-- CreateIndex
CREATE INDEX "property_assignments_propertyId_idx" ON "property_assignments"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "property_assignments_propertyId_userId_key" ON "property_assignments"("propertyId", "userId");

-- CreateIndex
CREATE INDEX "internal_areas_organizationId_idx" ON "internal_areas"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "internal_areas_organizationId_code_key" ON "internal_areas"("organizationId", "code");

-- CreateIndex
CREATE INDEX "area_assignments_userId_idx" ON "area_assignments"("userId");

-- CreateIndex
CREATE INDEX "area_assignments_internalAreaId_idx" ON "area_assignments"("internalAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "area_assignments_internalAreaId_userId_key" ON "area_assignments"("internalAreaId", "userId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_zones" ADD CONSTRAINT "property_zones_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assignments" ADD CONSTRAINT "property_assignments_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_assignments" ADD CONSTRAINT "property_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_areas" ADD CONSTRAINT "internal_areas_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_assignments" ADD CONSTRAINT "area_assignments_internalAreaId_fkey" FOREIGN KEY ("internalAreaId") REFERENCES "internal_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_assignments" ADD CONSTRAINT "area_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
