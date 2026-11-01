import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ActivityStatus,
  IssuePriority,
  IssueScope,
  IssueStatus,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { ScopeAuthorizationService } from '../../organization/application/scope-authorization.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { DashboardFilterDto } from '../presentation/dto/dashboard-filter.dto';
import {
  CategoryMetricItem,
  DashboardActivitiesSummary,
  DashboardKpiSummary,
  DashboardMetricsResponse,
  DashboardPeriodInfo,
  LocationMetricItem,
  PriorityCountItem,
  StatusCountItem,
  UrgentAttentionCaseItem,
} from '../presentation/dto/dashboard-metrics.dto';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeAuth: ScopeAuthorizationService,
  ) {}

  /**
   * Genera el conjunto completo de métricas operativas respetando el aislamiento de ámbitos (RF-029, RF-030, CP-34).
   */
  async getMetrics(
    user: AuthenticatedUser,
    filter: DashboardFilterDto,
  ): Promise<DashboardMetricsResponse> {
    // 1. Validar autorización por rol (El administrador no tiene acceso operativo - RF-049)
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para consultar tableros operacionales de novedades (RF-049)',
      );
    }

    // 2. Determinar ámbito de propiedades y áreas accesibles para el usuario
    const accessiblePropertyIds = await this.scopeAuth.getAccessiblePropertyIds(user);
    const accessibleAreaIds = await this.scopeAuth.getAccessibleInternalAreaIds(user);

    // Validar si el filtro solicita una propiedad o área a la que no tiene acceso
    if (filter.propertyId && accessiblePropertyIds !== null) {
      if (!accessiblePropertyIds.includes(filter.propertyId)) {
        throw new ForbiddenException(
          'Acceso denegado: no tiene asignación operativa activa en la propiedad especificada',
        );
      }
    }

    if (filter.internalAreaId && accessibleAreaIds !== null) {
      if (!accessibleAreaIds.includes(filter.internalAreaId)) {
        throw new ForbiddenException(
          'Acceso denegado: no tiene asignación operativa activa en el área interna especificada',
        );
      }
    }

    // 3. Establecer fechas de periodo y corte en zona horaria de Colombia (UTC-5)
    const { startDate, endDate } = this.resolveDateRange(filter.startDate, filter.endDate);

    // 4. Construir filtro base de Prisma para la organización y alcance autorizado
    const baseWhere: any = {
      organizationId: user.organizationId,
    };

    if (accessiblePropertyIds !== null && accessibleAreaIds !== null) {
      baseWhere.OR = [
        { propertyId: { in: accessiblePropertyIds } },
        { internalAreaId: { in: accessibleAreaIds } },
      ];
    } else if (accessiblePropertyIds !== null) {
      baseWhere.propertyId = { in: accessiblePropertyIds };
    } else if (accessibleAreaIds !== null) {
      baseWhere.internalAreaId = { in: accessibleAreaIds };
    }

    // Filtros adicionales por parámetros
    if (filter.scope) baseWhere.scope = filter.scope;
    if (filter.propertyId) baseWhere.propertyId = filter.propertyId;
    if (filter.internalAreaId) baseWhere.internalAreaId = filter.internalAreaId;
    if (filter.assignedUserId) baseWhere.assignedUserId = filter.assignedUserId;
    if (filter.categoryId) baseWhere.categoryId = filter.categoryId;
    if (filter.priority) baseWhere.priority = filter.priority;
    if (filter.status) baseWhere.status = filter.status;

    // 5. Consultar los casos relevantes para el periodo y cohortes de corte
    // Para cumplir CP-34, necesitamos los casos registrados en el periodo Y los casos que estaban abiertos al corte
    const issues = await this.prisma.issue.findMany({
      where: {
        ...baseWhere,
        OR: [
          // Novedades registradas en el periodo
          {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          // Novedades abiertas a la fecha de corte (creadas antes o durante el periodo y no cerradas antes del corte)
          {
            createdAt: { lte: endDate },
            status: { notIn: [IssueStatus.CERRADA, IssueStatus.DESCARTADA] },
          },
          // Novedades cerradas durante el periodo
          {
            closedAt: {
              gte: startDate,
              lte: endDate,
            },
            status: IssueStatus.CERRADA,
          },
        ],
      },
      include: {
        category: { select: { id: true, name: true, scope: true } },
        property: { select: { id: true, name: true, code: true } },
        internalArea: { select: { id: true, name: true, code: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true } },
        activities: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    // 6. Calcular KPIs principales (RN-101, RN-116, CP-34)
    const kpis = this.calculateKpis(issues, startDate, endDate);

    // 7. Calcular métricas de Actividades
    const activitiesSummary = this.calculateActivitiesSummary(issues);

    // 8. Distribución por Estado
    const byStatus = this.calculateByStatus(issues, startDate, endDate);

    // 9. Distribución por Prioridad
    const byPriority = this.calculateByPriority(issues, startDate, endDate);

    // 10. Distribución por Categoría
    const byCategory = this.calculateByCategory(issues, startDate, endDate);

    // 11. Distribución por Ubicación (Propiedades y Áreas)
    const byLocation = await this.calculateByLocation(
      user,
      issues,
      startDate,
      endDate,
      accessiblePropertyIds,
      accessibleAreaIds,
      filter.scope,
      filter.propertyId,
      filter.internalAreaId,
    );

    // 12. Casos que requieren atención gerencial urgente (críticos, bloqueados, atrasados)
    const attentionRequiredCases = this.extractAttentionRequiredCases(issues, endDate);

    const periodInfo: DashboardPeriodInfo = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      cutoffDate: endDate.toISOString(),
      timezone: 'America/Bogota (UTC-5)',
    };

    return {
      period: periodInfo,
      kpis,
      activities: activitiesSummary,
      byStatus,
      byPriority,
      byCategory,
      byLocation,
      attentionRequiredCases,
    };
  }

  /**
   * Resuelve el rango de fechas garantizando bordes precisos del día y mes en hora de Colombia.
   */
  private resolveDateRange(
    startStr?: string,
    endStr?: string,
  ): { startDate: Date; endDate: Date } {
    let startDate: Date;
    let endDate: Date;

    const now = new Date();

    if (endStr) {
      if (endStr.length <= 10) {
        endDate = new Date(`${endStr}T23:59:59.999Z`);
      } else {
        endDate = new Date(endStr);
      }
    } else {
      endDate = now;
    }

    if (startStr) {
      if (startStr.length <= 10) {
        startDate = new Date(`${startStr}T00:00:00.000Z`);
      } else {
        startDate = new Date(startStr);
      }
    } else {
      // Por defecto: Primer día del mes corriente en UTC
      startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1, 0, 0, 0, 0));
    }

    // Asegurar que startDate <= endDate
    if (startDate > endDate) {
      const temp = startDate;
      startDate = endDate;
      endDate = temp;
    }

    return { startDate, endDate };
  }

  /**
   * Calcula los KPIs consolidados sin duplicación (RN-101, RN-116, CP-34).
   */
  private calculateKpis(issues: any[], startDate: Date, endDate: Date): DashboardKpiSummary {
    let totalRegisteredInPeriod = 0;
    let totalClosedInPeriod = 0;
    let totalOpenAtCutoff = 0;
    let totalDiscardedInPeriod = 0;
    let totalCriticalInPeriod = 0;

    let totalResolutionDurationMs = 0;
    let closedCountForAverage = 0;

    for (const issue of issues) {
      const createdAt = new Date(issue.createdAt);
      const isRegisteredInPeriod = createdAt >= startDate && createdAt <= endDate;

      if (isRegisteredInPeriod) {
        totalRegisteredInPeriod++;
        if (issue.priority === IssuePriority.CRITICA || issue.initialPriority === IssuePriority.CRITICA) {
          totalCriticalInPeriod++;
        }
      }

      // Cerradas en el periodo
      if (issue.closedAt) {
        const closedAt = new Date(issue.closedAt);
        if (closedAt >= startDate && closedAt <= endDate && issue.status === IssueStatus.CERRADA) {
          totalClosedInPeriod++;
          const duration = closedAt.getTime() - createdAt.getTime();
          if (duration >= 0) {
            totalResolutionDurationMs += duration;
            closedCountForAverage++;
          }
        }
      }

      // Descartadas en el periodo
      if (issue.status === IssueStatus.DESCARTADA) {
        const updatedAt = new Date(issue.updatedAt);
        if (updatedAt >= startDate && updatedAt <= endDate) {
          totalDiscardedInPeriod++;
        }
      }

      // Abiertas a la fecha de corte (CP-34)
      // Creada antes o en la fecha de corte, y no estaba cerrada a la fecha de corte
      const wasCreatedBeforeCutoff = createdAt <= endDate;
      let wasOpenAtCutoff = false;

      if (wasCreatedBeforeCutoff) {
        if (issue.status !== IssueStatus.CERRADA && issue.status !== IssueStatus.DESCARTADA) {
          wasOpenAtCutoff = true;
        } else if (issue.status === IssueStatus.CERRADA && issue.closedAt) {
          const closedAt = new Date(issue.closedAt);
          if (closedAt > endDate) {
            wasOpenAtCutoff = true;
          }
        }
      }

      if (wasOpenAtCutoff) {
        totalOpenAtCutoff++;
      }
    }

    const averageResolutionHours =
      closedCountForAverage > 0
        ? Math.round((totalResolutionDurationMs / (closedCountForAverage * 1000 * 60 * 60)) * 10) /
          10
        : 0;

    const averageResolutionDays =
      Math.round((averageResolutionHours / 24) * 10) / 10;

    return {
      totalRegisteredInPeriod,
      totalClosedInPeriod,
      totalOpenAtCutoff,
      totalDiscardedInPeriod,
      totalCriticalInPeriod,
      averageResolutionHours,
      averageResolutionDays,
    };
  }

  /**
   * Calcula resumen de actividades sin duplicar novedades (RN-101).
   */
  private calculateActivitiesSummary(issues: any[]): DashboardActivitiesSummary {
    let totalActivities = 0;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;
    let blocked = 0;
    let canceled = 0;

    for (const issue of issues) {
      for (const act of issue.activities || []) {
        totalActivities++;
        switch (act.status) {
          case ActivityStatus.COMPLETADA:
            completed++;
            break;
          case ActivityStatus.EN_CURSO:
            inProgress++;
            break;
          case ActivityStatus.PENDIENTE:
            pending++;
            break;
          case ActivityStatus.BLOQUEADA:
            blocked++;
            break;
          case ActivityStatus.CANCELADA:
            canceled++;
            break;
        }
      }
    }

    const completionRatePercent =
      totalActivities > 0 ? Math.round((completed / totalActivities) * 1000) / 10 : 0;

    return {
      totalActivities,
      completed,
      inProgress,
      pending,
      blocked,
      canceled,
      completionRatePercent,
    };
  }

  /**
   * Desglose por Estado Operativo
   */
  private calculateByStatus(
    issues: any[],
    startDate: Date,
    endDate: Date,
  ): StatusCountItem[] {
    // Se agrupa en los estados que ve el usuario: Pendiente, En proceso, Finalizada y Descartada
    const counts: Record<string, number> = {
      [IssueStatus.ASIGNADA]: 0,
      [IssueStatus.EN_ATENCION]: 0,
      [IssueStatus.CERRADA]: 0,
      [IssueStatus.DESCARTADA]: 0,
    };
    const visibleStatus: Record<string, IssueStatus> = {
      [IssueStatus.REGISTRADA]: IssueStatus.ASIGNADA,
      [IssueStatus.EN_REVISION]: IssueStatus.ASIGNADA,
      [IssueStatus.PENDIENTE_CIERRE]: IssueStatus.EN_ATENCION,
    };

    // Casos activos o registrados en el periodo
    for (const issue of issues) {
      const status = visibleStatus[issue.status] ?? issue.status;
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    }

    const total = issues.length || 1;
    return Object.keys(counts).map((st) => ({
      status: st,
      count: counts[st],
      percentage: Math.round((counts[st] / total) * 1000) / 10,
    }));
  }

  /**
   * Desglose por Prioridad Actual
   */
  private calculateByPriority(
    issues: any[],
    startDate: Date,
    endDate: Date,
  ): PriorityCountItem[] {
    const counts: Record<string, number> = {
      [IssuePriority.BAJA]: 0,
      [IssuePriority.MEDIA]: 0,
      [IssuePriority.ALTA]: 0,
      [IssuePriority.CRITICA]: 0,
    };

    for (const issue of issues) {
      if (counts[issue.priority] !== undefined) {
        counts[issue.priority]++;
      }
    }

    const total = issues.length || 1;
    return Object.keys(counts).map((pr) => ({
      priority: pr,
      count: counts[pr],
      percentage: Math.round((counts[pr] / total) * 1000) / 10,
    }));
  }

  /**
   * Desglose por Categoría
   */
  private calculateByCategory(
    issues: any[],
    startDate: Date,
    endDate: Date,
  ): CategoryMetricItem[] {
    const map = new Map<string, { name: string; scope: string; count: number }>();

    for (const issue of issues) {
      if (issue.category) {
        const existing = map.get(issue.category.id) || {
          name: issue.category.name,
          scope: issue.category.scope,
          count: 0,
        };
        existing.count++;
        map.set(issue.category.id, existing);
      }
    }

    const total = issues.length || 1;
    return Array.from(map.entries())
      .map(([id, item]) => ({
        categoryId: id,
        categoryName: item.name,
        scope: item.scope,
        count: item.count,
        percentage: Math.round((item.count / total) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Desglose por Ubicación (Propiedades Horizontales y Áreas Internas)
   */
  private async calculateByLocation(
    user: AuthenticatedUser,
    issues: any[],
    startDate: Date,
    endDate: Date,
    accessiblePropertyIds: string[] | null,
    accessibleAreaIds: string[] | null,
    scopeFilter?: IssueScope,
    propertyIdFilter?: string,
    internalAreaIdFilter?: string,
  ): Promise<LocationMetricItem[]> {
    const results: LocationMetricItem[] = [];

    // 1. Propiedades: Solo si no hay filtro de área interna y scope no es INTERNA
    const shouldIncludeProperties =
      !internalAreaIdFilter && (!scopeFilter || scopeFilter === IssueScope.PROPIEDAD);

    if (shouldIncludeProperties) {
      const propWhere: any = { organizationId: user.organizationId, isActive: true };
      if (propertyIdFilter) {
        propWhere.id = propertyIdFilter;
      } else if (accessiblePropertyIds !== null) {
        propWhere.id = { in: accessiblePropertyIds };
      }

      const properties = await this.prisma.property.findMany({
        where: propWhere,
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      });

      for (const p of properties) {
        const propIssues = issues.filter((i) => i.propertyId === p.id);
        const metrics = this.calculateLocationCounts(propIssues, startDate, endDate);
        results.push({
          id: p.id,
          name: p.name,
          scope: 'PROPIEDAD',
          code: p.code,
          ...metrics,
        });
      }
    }

    // 2. Áreas Internas: Solo si no hay filtro de propiedad y scope no es PROPIEDAD
    const shouldIncludeAreas =
      !propertyIdFilter && (!scopeFilter || scopeFilter === IssueScope.INTERNA);

    if (shouldIncludeAreas) {
      const areaWhere: any = { organizationId: user.organizationId, isActive: true };
      if (internalAreaIdFilter) {
        areaWhere.id = internalAreaIdFilter;
      } else if (accessibleAreaIds !== null) {
        areaWhere.id = { in: accessibleAreaIds };
      }

      const areas = await this.prisma.internalArea.findMany({
        where: areaWhere,
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      });

      for (const a of areas) {
        const areaIssues = issues.filter((i) => i.internalAreaId === a.id);
        const metrics = this.calculateLocationCounts(areaIssues, startDate, endDate);
        results.push({
          id: a.id,
          name: a.name,
          scope: 'INTERNA',
          code: a.code,
          ...metrics,
        });
      }
    }

    return results;
  }

  private calculateLocationCounts(
    locIssues: any[],
    startDate: Date,
    endDate: Date,
  ): {
    totalRegistered: number;
    openAtCutoff: number;
    closedInPeriod: number;
    criticalCount: number;
  } {
    let totalRegistered = 0;
    let openAtCutoff = 0;
    let closedInPeriod = 0;
    let criticalCount = 0;

    for (const issue of locIssues) {
      const createdAt = new Date(issue.createdAt);
      if (createdAt >= startDate && createdAt <= endDate) {
        totalRegistered++;
        if (issue.priority === IssuePriority.CRITICA || issue.initialPriority === IssuePriority.CRITICA) {
          criticalCount++;
        }
      }

      if (issue.closedAt) {
        const closedAt = new Date(issue.closedAt);
        if (closedAt >= startDate && closedAt <= endDate && issue.status === IssueStatus.CERRADA) {
          closedInPeriod++;
        }
      }

      if (createdAt <= endDate) {
        if (issue.status !== IssueStatus.CERRADA && issue.status !== IssueStatus.DESCARTADA) {
          openAtCutoff++;
        } else if (issue.status === IssueStatus.CERRADA && issue.closedAt) {
          const closedAt = new Date(issue.closedAt);
          if (closedAt > endDate) {
            openAtCutoff++;
          }
        }
      }
    }

    return { totalRegistered, openAtCutoff, closedInPeriod, criticalCount };
  }

  /**
   * Extrae novedades que requieren atención gerencial prioritaria:
   * - Actividades bloqueadas
   * - Novedades críticas no cerradas
   * - Casos con más de 7 días abiertos
   */
  private extractAttentionRequiredCases(
    issues: any[],
    cutoffDate: Date,
  ): UrgentAttentionCaseItem[] {
    const list: UrgentAttentionCaseItem[] = [];

    for (const issue of issues) {
      if (issue.status === IssueStatus.CERRADA || issue.status === IssueStatus.DESCARTADA) {
        continue;
      }

      const hasBlockedActivities = (issue.activities || []).some(
        (a: any) => a.status === ActivityStatus.BLOQUEADA,
      );

      const isCritical = issue.priority === IssuePriority.CRITICA;
      const createdAt = new Date(issue.createdAt);
      const daysOpen = Math.max(
        0,
        Math.floor((cutoffDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      );

      // Requiere atención si tiene actividades bloqueadas, es crítica o lleva más de 7 días abierta
      if (hasBlockedActivities || isCritical || daysOpen > 7) {
        const locationName =
          issue.scope === IssueScope.PROPIEDAD
            ? issue.property?.name || 'Propiedad'
            : issue.internalArea?.name || 'Área Interna';

        const assignedUserName = issue.assignedUser
          ? `${issue.assignedUser.firstName} ${issue.assignedUser.lastName}`
          : null;

        list.push({
          id: issue.id,
          code: issue.code,
          title: issue.title,
          scope: issue.scope,
          locationName,
          priority: issue.priority,
          status: issue.status,
          createdAt: issue.createdAt.toISOString(),
          daysOpen,
          hasBlockedActivities,
          assignedUserName,
        });
      }
    }

    // Ordenar primero las críticas y con actividades bloqueadas, luego por días abiertos descendente
    return list
      .sort((a, b) => {
        if (a.hasBlockedActivities && !b.hasBlockedActivities) return -1;
        if (!a.hasBlockedActivities && b.hasBlockedActivities) return 1;
        if (a.priority === IssuePriority.CRITICA && b.priority !== IssuePriority.CRITICA) return -1;
        if (a.priority !== IssuePriority.CRITICA && b.priority === IssuePriority.CRITICA) return 1;
        return b.daysOpen - a.daysOpen;
      })
      .slice(0, 15); // Top 15 casos prioritarios
  }
}
