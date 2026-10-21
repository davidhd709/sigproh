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
      report: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
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
});
