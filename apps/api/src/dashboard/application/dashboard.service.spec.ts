import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ActivityStatus,
  IssuePriority,
  IssueScope,
  IssueStatus,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { ScopeAuthorizationService } from '../../organization/application/scope-authorization.service';
import { DashboardService } from './dashboard.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

describe('DashboardService', () => {
  let service: DashboardService;
  let mockPrisma: any;
  let mockScopeAuth: any;

  const mockDirectorUser: AuthenticatedUser = {
    id: 'user-dir-1',
    email: 'director@sigproh.local',
    role: Role.DIRECTOR_OPERATIVO,
    organizationId: 'org-1',
  };

  const mockAdminUser: AuthenticatedUser = {
    id: 'user-admin-1',
    email: 'admin@sigproh.local',
    role: Role.ADMINISTRADOR,
    organizationId: 'org-1',
  };

  const mockCoordUser: AuthenticatedUser = {
    id: 'user-coord-1',
    email: 'coord@sigproh.local',
    role: Role.COORDINADOR_OPERATIVO,
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    mockPrisma = {
      issue: {
        findMany: vi.fn(),
      },
      property: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'prop-1', name: 'Torres del Parque', code: 'TDP' },
          { id: 'prop-2', name: 'Edificio Central', code: 'EDC' },
        ]),
      },
      internalArea: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'area-1', name: 'Operaciones', code: 'OPE' },
        ]),
      },
    };

    mockScopeAuth = {
      getAccessiblePropertyIds: vi.fn(),
      getAccessibleInternalAreaIds: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScopeAuthorizationService, useValue: mockScopeAuth },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('Control de acceso y aislamiento (RF-049)', () => {
    it('debe rechazar con ForbiddenException si el usuario es ADMINISTRADOR', async () => {
      await expect(
        service.getMetrics(mockAdminUser, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe rechazar con ForbiddenException si un COORDINADOR intenta filtrar por propiedad no asignada', async () => {
      mockScopeAuth.getAccessiblePropertyIds.mockResolvedValue(['prop-1']);
      mockScopeAuth.getAccessibleInternalAreaIds.mockResolvedValue([]);

      await expect(
        service.getMetrics(mockCoordUser, { propertyId: 'prop-unauthorized-99' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Cálculo de métricas y cohortes (RF-029, RF-030, CP-34, RN-101, RN-116)', () => {
    it('calcula KPIs con fechas y cohortes correctas incluyendo casos de meses anteriores abiertos al corte', async () => {
      mockScopeAuth.getAccessiblePropertyIds.mockResolvedValue(null);
      mockScopeAuth.getAccessibleInternalAreaIds.mockResolvedValue(null);

      // Periodo de prueba: Octubre 2026 (2026-10-01 a 2026-10-31)
      const startDateStr = '2026-10-01';
      const endDateStr = '2026-10-31';

      const mockIssues = [
        // Caso 1: Creado en Octubre, cerrado en Octubre (duró 48 horas)
        {
          id: 'issue-1',
          code: 'NOV-2026-0001',
          title: 'Falla bomba',
          scope: IssueScope.PROPIEDAD,
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Torres del Parque', code: 'TDP' },
          priority: IssuePriority.ALTA,
          initialPriority: IssuePriority.ALTA,
          status: IssueStatus.CERRADA,
          createdAt: new Date('2026-10-05T10:00:00Z'),
          closedAt: new Date('2026-10-07T10:00:00Z'),
          updatedAt: new Date('2026-10-07T10:00:00Z'),
          category: { id: 'cat-1', name: 'Plomería', scope: IssueScope.PROPIEDAD },
          activities: [
            { id: 'act-1', status: ActivityStatus.COMPLETADA },
            { id: 'act-2', status: ActivityStatus.COMPLETADA },
          ],
        },
        // Caso 2: Creado en Septiembre (mes anterior), pero SIGUE ABIERTO al corte (Octubre)
        {
          id: 'issue-2',
          code: 'NOV-2026-0002',
          title: 'Humedad fachada',
          scope: IssueScope.PROPIEDAD,
          propertyId: 'prop-1',
          property: { id: 'prop-1', name: 'Torres del Parque', code: 'TDP' },
          priority: IssuePriority.CRITICA,
          initialPriority: IssuePriority.CRITICA,
          status: IssueStatus.EN_ATENCION,
          createdAt: new Date('2026-09-15T08:00:00Z'),
          closedAt: null,
          updatedAt: new Date('2026-10-10T08:00:00Z'),
          category: { id: 'cat-2', name: 'Mantenimiento', scope: IssueScope.PROPIEDAD },
          activities: [
            { id: 'act-3', status: ActivityStatus.BLOQUEADA },
          ],
        },
        // Caso 3: Creado en Octubre, Crítica, Cerrado en Octubre (duró 24 horas)
        {
          id: 'issue-3',
          code: 'NOV-2026-0003',
          title: 'Cortocircuito',
          scope: IssueScope.PROPIEDAD,
          propertyId: 'prop-2',
          property: { id: 'prop-2', name: 'Edificio Central', code: 'EDC' },
          priority: IssuePriority.CRITICA,
          initialPriority: IssuePriority.CRITICA,
          status: IssueStatus.CERRADA,
          createdAt: new Date('2026-10-12T12:00:00Z'),
          closedAt: new Date('2026-10-13T12:00:00Z'),
          updatedAt: new Date('2026-10-13T12:00:00Z'),
          category: { id: 'cat-3', name: 'Eléctrico', scope: IssueScope.PROPIEDAD },
          activities: [
            { id: 'act-4', status: ActivityStatus.COMPLETADA },
          ],
        },
        // Caso 4: Creado en Septiembre, se cerró en Noviembre (después del corte)
        // Por tanto, al corte del 31 de Octubre, figuraba ABIERTO (CP-34)
        {
          id: 'issue-4',
          code: 'NOV-2026-0004',
          title: 'Pintura pasillos',
          scope: IssueScope.INTERNA,
          internalAreaId: 'area-1',
          internalArea: { id: 'area-1', name: 'Operaciones', code: 'OPE' },
          priority: IssuePriority.BAJA,
          initialPriority: IssuePriority.BAJA,
          status: IssueStatus.CERRADA,
          createdAt: new Date('2026-09-20T10:00:00Z'),
          closedAt: new Date('2026-11-05T10:00:00Z'),
          updatedAt: new Date('2026-11-05T10:00:00Z'),
          category: { id: 'cat-4', name: 'Locativa', scope: IssueScope.INTERNA },
          activities: [
            { id: 'act-5', status: ActivityStatus.PENDIENTE },
          ],
        },
      ];

      mockPrisma.issue.findMany.mockResolvedValue(mockIssues);

      const result = await service.getMetrics(mockDirectorUser, {
        startDate: startDateStr,
        endDate: endDateStr,
      });

      // Validar KPIs:
      // totalRegisteredInPeriod: issue-1 e issue-3 (creados en octubre) -> 2
      expect(result.kpis.totalRegisteredInPeriod).toBe(2);

      // totalClosedInPeriod: issue-1 e issue-3 (cerrados en octubre) -> 2
      expect(result.kpis.totalClosedInPeriod).toBe(2);

      // totalOpenAtCutoff:
      // issue-2 (creado en sept, no cerrado) -> SI
      // issue-4 (creado en sept, cerrado en nov > cutoff) -> SI
      // Total abiertos al corte = 2
      expect(result.kpis.totalOpenAtCutoff).toBe(2);

      // totalCriticalInPeriod: issue-3 (creada en octubre y crítica) -> 1
      expect(result.kpis.totalCriticalInPeriod).toBe(1);

      // averageResolutionHours:
      // issue-1: 48h, issue-3: 24h -> promedio = (48 + 24) / 2 = 36 horas
      expect(result.kpis.averageResolutionHours).toBe(36);
      expect(result.kpis.averageResolutionDays).toBe(1.5);

      // Actividades sin duplicación de novedades (RN-101):
      // total actividades: 5 (act-1, act-2, act-3, act-4, act-5)
      expect(result.activities.totalActivities).toBe(5);
      expect(result.activities.completed).toBe(3);
      expect(result.activities.blocked).toBe(1);
      expect(result.activities.pending).toBe(1);

      // Casos que requieren atención gerencial:
      // issue-2 tiene actividad bloqueada y es crítica
      expect(result.attentionRequiredCases.length).toBeGreaterThan(0);
      expect(result.attentionRequiredCases[0].code).toBe('NOV-2026-0002');
      expect(result.attentionRequiredCases[0].hasBlockedActivities).toBe(true);
    });
  });
});
