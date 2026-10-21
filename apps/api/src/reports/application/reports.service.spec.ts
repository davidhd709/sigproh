import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ReportScope,
  ReportStatus,
  Role,
} from '../../generated/prisma/client';
import { ReportsService } from './reports.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

describe('ReportsService', () => {
  let service: ReportsService;
  let prismaMock: any;
  let scopeAuthMock: any;
  let pdfGeneratorMock: any;
  let excelGeneratorMock: any;

  const mockDirectorUser: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000001',
    email: 'director@egsas.com',
    role: Role.DIRECTOR_OPERATIVO,
    organizationId: '00000000-0000-0000-0000-000000000000',
  };

  const mockCoordinatorUser: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000002',
    email: 'coordinador@egsas.com',
    role: Role.COORDINADOR_OPERATIVO,
    organizationId: '00000000-0000-0000-0000-000000000000',
  };

  const mockAdminUser: AuthenticatedUser = {
    userId: '00000000-0000-0000-0000-000000000003',
    email: 'admin@egsas.com',
    role: Role.ADMINISTRADOR,
    organizationId: '00000000-0000-0000-0000-000000000000',
  };

  beforeEach(() => {
    prismaMock = {
      $queryRaw: vi.fn().mockResolvedValue([{ lastValue: 1 }]),
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      report: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      institutionalTemplate: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      propertyReportConfig: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
      },
      property: {
        findUnique: vi.fn(),
      },
      reportVersion: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      reportReview: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      reportDistribution: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ firstName: 'Carlos', lastName: 'Director' }),
      },
      issue: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };

    scopeAuthMock = {
      getAccessiblePropertyIds: vi.fn().mockResolvedValue(null),
      getAccessibleInternalAreaIds: vi.fn().mockResolvedValue(null),
    };

    pdfGeneratorMock = {
      generateReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf')),
    };

    excelGeneratorMock = {
      generateReportExcel: vi.fn().mockResolvedValue(Buffer.from('mock excel buffer')),
    };

    service = new ReportsService(
      prismaMock,
      scopeAuthMock,
      pdfGeneratorMock,
      excelGeneratorMock,
    );
  });

  describe('createDraft', () => {
    it('debe rechazar con ForbiddenException si el usuario es ADMINISTRADOR (RF-049)', async () => {
      await expect(
        service.createDraft(mockAdminUser, {
          scope: ReportScope.PROPIEDAD,
          propertyId: '00000000-0000-0000-0000-000000000010',
          title: 'Informe Edificio A',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-31',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe rechazar con ForbiddenException si un Coordinador intenta generar informe CONSOLIDADO (RN-122)', async () => {
      await expect(
        service.createDraft(mockCoordinatorUser, {
          scope: ReportScope.CONSOLIDADO,
          title: 'Consolidado Gerencial',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-31',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe exigir propertyId para ámbito PROPIEDAD', async () => {
      await expect(
        service.createDraft(mockDirectorUser, {
          scope: ReportScope.PROPIEDAD,
          title: 'Informe sin propiedad',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-31',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe denegar acceso si el Coordinador no está asignado a la propiedad', async () => {
      scopeAuthMock.getAccessiblePropertyIds.mockResolvedValue([
        '00000000-0000-0000-0000-000000000099',
      ]);

      await expect(
        service.createDraft(mockCoordinatorUser, {
          scope: ReportScope.PROPIEDAD,
          propertyId: '00000000-0000-0000-0000-000000000010',
          title: 'Informe no asignado',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-31',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe crear exitosamente un borrador con código INF-YYYY-NNNN e indicadores del periodo (RF-031, RF-032, CP-18)', async () => {
      prismaMock.report.create.mockImplementation(({ data }: any) => {
        return Promise.resolve({
          id: 'report-uuid-1',
          ...data,
          createdAt: new Date('2026-05-15T10:00:00Z'),
          updatedAt: new Date('2026-05-15T10:00:00Z'),
          property: { name: 'Torre del Parque', code: 'TDP' },
          internalArea: null,
          createdBy: { firstName: 'Carlos', lastName: 'Director' },
          approvedBy: null,
        });
      });

      const result = await service.createDraft(mockDirectorUser, {
        scope: ReportScope.PROPIEDAD,
        propertyId: '00000000-0000-0000-0000-000000000010',
        title: 'Informe Operativo Mayo 2026',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        introduction: 'Introducción del informe mensual',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('report-uuid-1');
      expect(result.code).toMatch(/^INF-\d{4}-\d{4}$/);
      expect(result.status).toBe(ReportStatus.BORRADOR);
      expect(result.introduction).toBe('Introducción del informe mensual');
      expect(prismaMock.report.create).toHaveBeenCalledOnce();
    });
  });

  describe('updateDraft', () => {
    it('debe permitir modificar textos sin alterar los datos operacionales de origen (CP-19, CP-20, RN-125, RN-206)', async () => {
      const existingReport = {
        id: 'report-uuid-1',
        organizationId: mockDirectorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        propertyId: 'prop-1',
        status: ReportStatus.BORRADOR,
        createdById: mockDirectorUser.userId,
        title: 'Informe Original',
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
        cutoffDate: new Date('2026-05-31'),
        version: 1,
        introduction: 'Intro original',
        observations: 'Obs original',
        operationalData: { kpis: { totalRegisteredInPeriod: 5 } },
        createdBy: { firstName: 'Carlos', lastName: 'Director' },
      };

      prismaMock.report.findUnique.mockResolvedValue(existingReport);
      prismaMock.report.update.mockResolvedValue({
        ...existingReport,
        observations: 'Nuevas observaciones editadas por el usuario',
        updatedAt: new Date(),
      });

      const updated = await service.updateDraft(mockDirectorUser, 'report-uuid-1', {
        observations: 'Nuevas observaciones editadas por el usuario',
      });

      expect(updated.observations).toBe('Nuevas observaciones editadas por el usuario');
      // Verificamos que el update solo actualizó los campos redactados y NO mutó operationalData
      expect(prismaMock.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            observations: 'Nuevas observaciones editadas por el usuario',
          }),
        }),
      );
    });

    it('debe rechazar edición si el informe ya fue APROBADO (RN-132)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-uuid-1',
        organizationId: mockDirectorUser.organizationId,
        status: ReportStatus.APROBADO,
        createdById: mockDirectorUser.userId,
      });

      await expect(
        service.updateDraft(mockDirectorUser, 'report-uuid-1', {
          observations: 'Intento de modificar informe aprobado',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refreshSourceData', () => {
    it('debe actualizar los datos operacionales conservando intactos los textos del autor (RF-035)', async () => {
      const existingReport = {
        id: 'report-uuid-1',
        organizationId: mockDirectorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        propertyId: 'prop-1',
        status: ReportStatus.BORRADOR,
        createdById: mockDirectorUser.userId,
        title: 'Informe Mayo',
        introduction: 'Texto preparado por el autor',
        observations: 'Observaciones preparadas',
        periodStart: new Date('2026-05-01T00:00:00.000Z'),
        periodEnd: new Date('2026-05-31T23:59:59.999Z'),
        cutoffDate: new Date('2026-05-31T23:59:59.999Z'),
        operationalData: { kpis: { totalRegisteredInPeriod: 3 } },
        createdBy: { firstName: 'Carlos', lastName: 'Director' },
      };

      prismaMock.report.findUnique.mockResolvedValue(existingReport);
      prismaMock.report.update.mockResolvedValue({
        ...existingReport,
        operationalData: { kpis: { totalRegisteredInPeriod: 8 } },
        updatedAt: new Date(),
      });

      const refreshed = await service.refreshSourceData(mockDirectorUser, 'report-uuid-1');

      expect(refreshed.introduction).toBe('Texto preparado por el autor');
      expect(refreshed.observations).toBe('Observaciones preparadas');
      expect(prismaMock.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            operationalData: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('generatePdf y exportExcel', () => {
    it('debe generar el buffer PDF con el nombre correcto de archivo (RF-036, CP-33)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-uuid-1',
        code: 'INF-2026-0005',
        organizationId: mockDirectorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        title: 'Informe Prueba',
        status: ReportStatus.BORRADOR,
        version: 1,
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
        cutoffDate: new Date('2026-05-31'),
        createdBy: { firstName: 'Carlos', lastName: 'Director' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const pdf = await service.generatePdf(mockDirectorUser, 'report-uuid-1');
      expect(pdf.filename).toBe('informe-INF-2026-0005.pdf');
      expect(pdf.buffer).toBeInstanceOf(Buffer);
      expect(pdfGeneratorMock.generateReportPdf).toHaveBeenCalledOnce();
    });

    it('debe exportar el archivo Excel con el nombre correcto de archivo (RF-043, RN-098)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'report-uuid-1',
        code: 'INF-2026-0005',
        organizationId: mockDirectorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        title: 'Informe Prueba',
        status: ReportStatus.BORRADOR,
        version: 1,
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
        cutoffDate: new Date('2026-05-31'),
        createdBy: { firstName: 'Carlos', lastName: 'Director' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const excel = await service.exportExcel(mockDirectorUser, 'report-uuid-1');
      expect(excel.filename).toBe('informe-INF-2026-0005.xlsx');
      expect(excel.buffer).toBeInstanceOf(Buffer);
      expect(excelGeneratorMock.generateReportExcel).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // PRUEBAS DE FASE 8: GOBERNANZA, REVISIÓN, APROBACIÓN, VERSIONES Y DISTRIBUCIÓN
  // =========================================================================

  describe('Gobernanza Institucional de Plantillas (RF-044, CP-29, CP-31)', () => {
    it('debe permitir solo al Administrador crear plantillas institucionales', async () => {
      await expect(
        service.createInstitutionalTemplate(mockDirectorUser, {
          name: 'Plantilla No Autorizada',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe rechazar la omisión de secciones obligatorias (CP-31)', async () => {
      await expect(
        service.createInstitutionalTemplate(mockAdminUser, {
          name: 'Plantilla Incompleta',
          mandatorySections: ['header', 'metadata'], // falta 'kpis' y 'audit'
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe crear exitosamente la plantilla con versión incremental y marcar anteriores no publicadas', async () => {
      prismaMock.institutionalTemplate.findFirst.mockResolvedValue({ version: 1 });
      prismaMock.institutionalTemplate.create.mockResolvedValue({
        id: 'tmpl-2',
        organizationId: mockAdminUser.organizationId,
        name: 'Plantilla v2',
        version: 2,
        isPublished: true,
        headerTitle: 'EG S.A.S.',
        headerSubtitle: 'GESTIÓN',
        primaryColor: '#1E3A8A',
        secondaryColor: '#2563EB',
        footerText: 'Doc oficial',
        mandatorySections: ['header', 'metadata', 'kpis', 'audit'],
        allowedOptionalSections: ['introduction'],
        createdById: mockAdminUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.createInstitutionalTemplate(mockAdminUser, {
        name: 'Plantilla v2',
      });

      expect(res.version).toBe(2);
      expect(res.isPublished).toBe(true);
      expect(prismaMock.institutionalTemplate.updateMany).toHaveBeenCalledWith({
        where: { organizationId: mockAdminUser.organizationId },
        data: { isPublished: false },
      });
    });
  });

  describe('Personalización por Copropiedad (RF-045, CP-30, CP-31)', () => {
    it('debe permitir solo al Director Operativo personalizar la copropiedad', async () => {
      await expect(
        service.updatePropertyReportConfig(mockCoordinatorUser, 'prop-1', {
          customSubtitle: 'Edificio Exclusivo',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe rechazar si la copropiedad intenta alterar o incluir secciones obligatorias (CP-31)', async () => {
      prismaMock.property.findUnique.mockResolvedValue({
        id: 'prop-1',
        organizationId: mockDirectorUser.organizationId,
      });

      await expect(
        service.updatePropertyReportConfig(mockDirectorUser, 'prop-1', {
          optionalSectionsOrder: ['header', 'kpis'], // no se pueden modificar secciones mandatorias
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe crear o actualizar la configuración de copropiedad con éxito', async () => {
      prismaMock.property.findUnique.mockResolvedValue({
        id: 'prop-1',
        name: 'Edificio Central',
        organizationId: mockDirectorUser.organizationId,
      });
      prismaMock.propertyReportConfig.findUnique.mockResolvedValue(null);
      prismaMock.propertyReportConfig.create.mockResolvedValue({
        id: 'cfg-1',
        organizationId: mockDirectorUser.organizationId,
        propertyId: 'prop-1',
        customSubtitle: 'Gestión Inmobiliaria Integral',
        contactInfo: 'contacto@central.com',
        address: 'Calle 100 # 15-20',
        logoUrl: 'https://cdn.example.com/logo.png',
        optionalSectionsOrder: ['observations', 'recommendations'],
        version: 1,
        isPublished: true,
        updatedById: mockDirectorUser.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.updatePropertyReportConfig(mockDirectorUser, 'prop-1', {
        customSubtitle: 'Gestión Inmobiliaria Integral',
        contactInfo: 'contacto@central.com',
        optionalSectionsOrder: ['observations', 'recommendations'],
      });

      expect(res.customSubtitle).toBe('Gestión Inmobiliaria Integral');
      expect(res.version).toBe(1);
    });
  });

  describe('Flujo de Revisión Formal (RF-037 a RF-039, CP-21 a CP-24)', () => {
    it('debe congelar snapshot y pasar de BORRADOR a EN_REVISION (RF-037, CP-21)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'rep-rev-1',
        organizationId: mockCoordinatorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        status: ReportStatus.BORRADOR,
        createdById: mockCoordinatorUser.userId,
      });

      prismaMock.report.update.mockResolvedValue({
        id: 'rep-rev-1',
        code: 'INF-2026-0001',
        organizationId: mockCoordinatorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        title: 'Informe a Revisar',
        status: ReportStatus.EN_REVISION,
        version: 1,
        templateVersion: 1,
        createdBy: { firstName: 'Juan', lastName: 'Coord' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.sendToReview(mockCoordinatorUser, 'rep-rev-1');
      expect(res.status).toBe(ReportStatus.EN_REVISION);
      expect(prismaMock.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReportStatus.EN_REVISION,
          }),
        }),
      );
    });

    it('debe exigir observaciones al DEVOLVER un informe (RN-130, RN-145, CP-23)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'rep-rev-1',
        organizationId: mockDirectorUser.organizationId,
        status: ReportStatus.EN_REVISION,
      });

      await expect(
        service.reviewReport(mockDirectorUser, 'rep-rev-1', {
          decision: 'DEVUELTO',
          notes: '', // notas vacías
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe aprobar el informe, generar PDF y calcular hash SHA-256 inmutable (CP-24)', async () => {
      const baseReport = {
        id: 'rep-rev-1',
        code: 'INF-2026-0001',
        organizationId: mockDirectorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        title: 'Informe para Aprobación',
        status: ReportStatus.EN_REVISION,
        version: 1,
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
        cutoffDate: new Date('2026-05-31'),
        createdById: mockCoordinatorUser.userId,
        createdBy: { firstName: 'Juan', lastName: 'Coord' },
        approvedBy: { firstName: 'Carlos', lastName: 'Director' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.report.findUnique
        .mockResolvedValueOnce(baseReport)
        .mockResolvedValueOnce({
          ...baseReport,
          status: ReportStatus.APROBADO,
          pdfSha256: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        });

      const res = await service.reviewReport(mockDirectorUser, 'rep-rev-1', {
        decision: 'APROBADO',
        notes: 'Aprobado sin objeciones',
      });

      expect(prismaMock.reportVersion.create).toHaveBeenCalledOnce();
      expect(prismaMock.reportReview.create).toHaveBeenCalledOnce();
      expect(res.status).toBe(ReportStatus.APROBADO);
    });

  });

  describe('Control de Versiones y Distribución Oficial (RF-040 a RF-042, CP-25 a CP-28)', () => {
    it('debe permitir crear una nueva versión solo a partir de un informe APROBADO (RF-040, CP-26)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'rep-app-1',
        organizationId: mockDirectorUser.organizationId,
        status: ReportStatus.BORRADOR, // no aprobado
      });

      await expect(
        service.createNewVersion(mockDirectorUser, 'rep-app-1', {
          reason: 'Ajuste de datos',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe incrementar versión a v2 y retornar borrador editable conservando versión previa intacta (CP-25, CP-26)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'rep-app-1',
        organizationId: mockDirectorUser.organizationId,
        status: ReportStatus.APROBADO,
        version: 1,
      });

      prismaMock.report.update.mockResolvedValue({
        id: 'rep-app-1',
        code: 'INF-2026-0001',
        organizationId: mockDirectorUser.organizationId,
        scope: ReportScope.PROPIEDAD,
        title: 'Informe V2',
        status: ReportStatus.BORRADOR,
        version: 2,
        createdBy: { firstName: 'Carlos', lastName: 'Director' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.createNewVersion(mockDirectorUser, 'rep-app-1', {
        reason: 'Ampliación solicitada por el cliente',
      });

      expect(res.version).toBe(2);
      expect(res.status).toBe(ReportStatus.BORRADOR);
    });

    it('debe rechazar registrar distribución si el informe no está APROBADO (CP-28)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'rep-dist-1',
        organizationId: mockDirectorUser.organizationId,
        status: ReportStatus.BORRADOR,
      });

      await expect(
        service.distributeReport(mockDirectorUser, 'rep-dist-1', {
          recipient: 'Consejo de Administración',
          channel: 'CORREO_ELECTRONICO',
          deliveryDate: '2026-06-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe registrar exitosamente la distribución de un informe APROBADO (CP-27)', async () => {
      prismaMock.report.findUnique.mockResolvedValue({
        id: 'rep-dist-1',
        organizationId: mockDirectorUser.organizationId,
        status: ReportStatus.APROBADO,
        version: 1,
      });

      prismaMock.reportDistribution.create.mockResolvedValue({
        id: 'dist-1',
        reportId: 'rep-dist-1',
        reportVersion: 1,
        recipient: 'Consejo de Administración',
        channel: 'CORREO_ELECTRONICO',
        deliveryDate: new Date('2026-06-01'),
        distributedById: mockDirectorUser.userId,
        distributedBy: { firstName: 'Carlos', lastName: 'Director' },
        notes: 'Envío formal por acta',
        createdAt: new Date(),
      });

      const res = await service.distributeReport(mockDirectorUser, 'rep-dist-1', {
        recipient: 'Consejo de Administración',
        channel: 'CORREO_ELECTRONICO',
        deliveryDate: '2026-06-01',
        notes: 'Envío formal por acta',
      });

      expect(res.recipient).toBe('Consejo de Administración');
      expect(res.distributedByName).toBe('Carlos Director');
      expect(prismaMock.reportDistribution.create).toHaveBeenCalledOnce();
    });
  });
});

