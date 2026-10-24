import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  EvidenceStage,
  IssueEventType,
  IssuePriority,
  IssueScope,
  IssueStatus,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { ScopeAuthorizationService } from '../../organization/application/scope-authorization.service';
import { PrivateStorageService } from '../infrastructure/private-storage.service';
import { PROVISIONAL_FILE_POLICY } from '../infrastructure/provisional-file-policy.config';
import { CreateIssueDto } from '../presentation/dto/create-issue.dto';
import { AssignPrincipalDto } from '../presentation/dto/assign-principal.dto';
import { UpdatePriorityDto } from '../presentation/dto/update-priority.dto';
import { AddUrgentMeasureDto } from '../presentation/dto/add-urgent-measure.dto';
import { ListIssuesQueryDto } from '../presentation/dto/list-issues-query.dto';
import { CreateActivityDto } from '../presentation/dto/create-activity.dto';
import { UpdateActivityDto } from '../presentation/dto/update-activity.dto';
import { AssignActivityDto } from '../presentation/dto/assign-activity.dto';
import { CreateCommentDto } from '../presentation/dto/create-comment.dto';
import { CreateAttachmentDto } from '../presentation/dto/create-attachment.dto';
import { RequestClosureDto } from '../presentation/dto/request-closure.dto';
import { CloseIssueDto } from '../presentation/dto/close-issue.dto';
import { ReturnIssueDto } from '../presentation/dto/return-issue.dto';
import { ReopenIssueDto } from '../presentation/dto/reopen-issue.dto';
import { DiscardIssueDto } from '../presentation/dto/discard-issue.dto';

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeAuth: ScopeAuthorizationService,
    private readonly privateStorage: PrivateStorageService,
  ) {}

  /**
   * Registra una nueva novedad en el sistema con asignación mixta y gestión crítica.
   */
  async create(user: AuthenticatedUser, dto: CreateIssueDto) {
    // 1. Validar rol autorizado para reportar
    // PEN-03: Inicialmente se confirmó que reportan Gerencia, Director y Coordinadores.
    // El Auxiliar de Gerencia NO tiene autorización confirmada para crear novedades (ordinarias ni críticas),
    // conforme al principio de no conceder por suposición mientras PEN-03 continúe pendiente.
    const allowedRoles: Role[] = [
      Role.DIRECTOR_OPERATIVO,
      Role.GERENTE,
      Role.COORDINADOR_OPERATIVO,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException(
        user.role === Role.AUXILIAR_GERENCIA
          ? 'El rol Auxiliar de Gerencia no tiene autorización para registrar novedades (PEN-03 pendiente de definición)'
          : 'Su rol no tiene autorización para registrar novedades',
      );
    }

    // 2. Validar exclusividad estricta de ámbito (RN-003, RN-021, RN-022)
    if (dto.scope === IssueScope.PROPIEDAD) {
      if (!dto.propertyId) {
        throw new BadRequestException(
          'Para una novedad de propiedad horizontal, propertyId es obligatorio',
        );
      }
      if (dto.internalAreaId) {
        throw new BadRequestException(
          'Una novedad de propiedad no puede incluir un área interna',
        );
      }

      await this.scopeAuth.validatePropertyAccess(user, dto.propertyId);

      if (dto.propertyZoneId) {
        const zone = await this.prisma.propertyZone.findFirst({
          where: {
            id: dto.propertyZoneId,
            propertyId: dto.propertyId,
            isActive: true,
          },
        });
        if (!zone) {
          throw new BadRequestException(
            'La zona indicada no pertenece a la propiedad o está inactiva',
          );
        }
      }
    } else if (dto.scope === IssueScope.INTERNA) {
      if (!dto.internalAreaId) {
        throw new BadRequestException(
          'Para una novedad interna, internalAreaId es obligatorio',
        );
      }
      if (dto.propertyId || dto.propertyZoneId) {
        throw new BadRequestException(
          'Una novedad interna no puede incluir referencias de propiedad ni zonas',
        );
      }

      await this.scopeAuth.validateInternalAreaAccess(user, dto.internalAreaId);
    } else {
      throw new BadRequestException('Ámbito de novedad inválido');
    }

    // 3. Validar categoría
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (
      !category ||
      category.organizationId !== user.organizationId ||
      !category.isActive ||
      category.scope !== dto.scope
    ) {
      throw new BadRequestException(
        'La categoría seleccionada no es válida para el ámbito de la novedad',
      );
    }

    // 4. Algoritmo de sugerencia de responsable principal (RN-031 a RN-034)
    let suggestedUserId: string | null = null;

    if (dto.scope === IssueScope.PROPIEDAD && dto.propertyId) {
      const leadAssignment = await this.prisma.propertyAssignment.findFirst({
        where: {
          propertyId: dto.propertyId,
          isLead: true,
          isActive: true,
          user: { isActive: true },
        },
      });
      if (leadAssignment) {
        suggestedUserId = leadAssignment.userId;
      }
    } else if (dto.scope === IssueScope.INTERNA && dto.internalAreaId) {
      const leadAreaAssignment = await this.prisma.areaAssignment.findFirst({
        where: {
          internalAreaId: dto.internalAreaId,
          isLead: true,
          isActive: true,
          user: { isActive: true },
        },
      });
      if (leadAreaAssignment) {
        suggestedUserId = leadAreaAssignment.userId;
      }
    }

    const currentYear = new Date().getFullYear();
    const isCritical = dto.priority === IssuePriority.CRITICA;

    // 5. Transacción atómica para generar código correlativo sin colisiones, crear Issue, Eventos y Alertas
    return this.prisma.$transaction(async (tx) => {
      // Contador atómico por organización y año protegido contra carreras en su primera creación e incrementos
      const seqResult = await tx.$queryRaw<{ lastValue: number }[]>`
        INSERT INTO "issue_sequences" ("id", "organizationId", "year", "lastValue", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          ${user.organizationId},
          ${currentYear},
          COALESCE((SELECT COUNT(*) FROM "issues" WHERE "organizationId" = ${user.organizationId} AND EXTRACT(YEAR FROM "createdAt") = ${currentYear}), 0) + 1,
          NOW(),
          NOW()
        )
        ON CONFLICT ("organizationId", "year")
        DO UPDATE SET "lastValue" = "issue_sequences"."lastValue" + 1, "updatedAt" = NOW()
        RETURNING "lastValue";
      `;

      const nextVal = Number(seqResult[0].lastValue);
      const code = `NOV-${currentYear}-${String(nextVal).padStart(4, '0')}`;

      const issue = await tx.issue.create({
        data: {
          organizationId: user.organizationId,
          code,
          scope: dto.scope,
          title: dto.title.trim(),
          description: dto.description.trim(),
          priority: dto.priority,
          initialPriority: dto.priority,
          status: IssueStatus.EN_REVISION,
          propertyId: dto.propertyId ?? null,
          propertyZoneId: dto.propertyZoneId ?? null,
          internalAreaId: dto.internalAreaId ?? null,
          categoryId: dto.categoryId,
          createdById: user.id,
          suggestedUserId,
          urgentMeasures: isCritical && dto.urgentMeasures ? dto.urgentMeasures.trim() : null,
        },
        include: {
          category: { select: { id: true, name: true } },
          property: { select: { id: true, name: true, code: true } },
          internalArea: { select: { id: true, name: true, code: true } },
          suggestedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // Registrar evento inmutable de creación
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.CREACION,
          summary: `Novedad creada por ${user.email} con prioridad inicial ${dto.priority}`,
          details: {
            priority: dto.priority,
            scope: dto.scope,
            suggestedUserId,
          },
        },
      });

      // Si se sugirió un responsable, registrar evento
      if (suggestedUserId) {
        await tx.issueEvent.create({
          data: {
            issueId: issue.id,
            userId: user.id,
            eventType: IssueEventType.SUGERENCIA_RESPONSABLE,
            summary: `Responsable sugerido automáticamente según asignación principal`,
            details: { suggestedUserId },
          },
        });
      }

      // Si es crítica y se aportaron medidas urgentes iniciales
      if (isCritical && dto.urgentMeasures) {
        await tx.issueEvent.create({
          data: {
            issueId: issue.id,
            userId: user.id,
            eventType: IssueEventType.MEDIDA_URGENTE,
            summary: `Medidas urgentes iniciales registradas`,
            details: { measures: dto.urgentMeasures.trim() },
          },
        });
      }

      // Alerta al Director Operativo si es crítica (DEC-06 / RF-014)
      if (isCritical) {
        const directors = await tx.user.findMany({
          where: {
            organizationId: user.organizationId,
            role: Role.DIRECTOR_OPERATIVO,
            isActive: true,
          },
          select: { id: true },
        });

        for (const dir of directors) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId: dir.id,
              issueId: issue.id,
              title: `ALERTA: Novedad crítica ${code}`,
              message: `Se ha reportado la novedad crítica "${dto.title.trim()}". Requiere atención inmediata y confirmación de responsable.`,
            },
          });
        }
      }

      return issue;
    });
  }

  /**
   * Confirma o reasigna el responsable principal de la novedad (Exclusivo Director Operativo - DEC-04 / RN-006 / RN-039).
   */
  async assignPrincipal(
    user: AuthenticatedUser,
    issueId: string,
    dto: AssignPrincipalDto,
  ) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Solo el Director Operativo tiene la facultad de confirmar o reasignar el responsable principal',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.assignedUserId },
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!targetUser || targetUser.organizationId !== user.organizationId) {
      throw new BadRequestException('El usuario asignado no pertenece a la organización');
    }

    if (!targetUser.isActive) {
      throw new BadRequestException('No se puede asignar un usuario inactivo');
    }

    if (targetUser.role === Role.ADMINISTRADOR) {
      throw new BadRequestException(
        'El rol Administrador del Sistema no puede ser asignado como responsable operativo de novedades (RN-001 / RN-002)',
      );
    }

    // RF-011: Validar que el candidato tenga autorización activa sobre el ámbito de la novedad
    const targetUserAuth: AuthenticatedUser = {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      organizationId: targetUser.organizationId,
    };

    if (issue.scope === IssueScope.PROPIEDAD && issue.propertyId) {
      const hasAccess = await this.scopeAuth.hasPropertyAccess(
        targetUserAuth,
        issue.propertyId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario asignado no cuenta con asignación activa en la propiedad correspondiente (RF-011)',
        );
      }
    } else if (issue.scope === IssueScope.INTERNA && issue.internalAreaId) {
      const hasAccess = await this.scopeAuth.hasInternalAreaAccess(
        targetUserAuth,
        issue.internalAreaId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario asignado no cuenta con asignación activa en el área interna correspondiente (RF-011)',
        );
      }
    }

    const isReassignment = Boolean(
      issue.assignedUserId && issue.assignedUserId !== dto.assignedUserId,
    );

    if (isReassignment && (!dto.reason || !dto.reason.trim())) {
      throw new BadRequestException(
        'Debe especificar un motivo obligatorio para la reasignación de responsable principal',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Inactivar asignaciones previas
      await tx.issueAssignment.updateMany({
        where: { issueId: issue.id, isCurrent: true },
        data: { isCurrent: false },
      });

      // Crear nueva asignación en el historial
      await tx.issueAssignment.create({
        data: {
          issueId: issue.id,
          userId: targetUser.id,
          assignedById: user.id,
          reason: dto.reason?.trim() ?? null,
          isCurrent: true,
        },
      });

      // Actualizar novedad
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: {
          assignedUserId: targetUser.id,
          status: IssueStatus.ASIGNADA,
        },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      // Registrar evento de auditoría
      const eventType = isReassignment
        ? IssueEventType.REASIGNACION
        : IssueEventType.CONFIRMACION_ASIGNACION;

      const summary = isReassignment
        ? `Responsable reasignado a ${targetUser.firstName} ${targetUser.lastName}. Motivo: ${dto.reason?.trim()}`
        : `Responsable principal confirmado: ${targetUser.firstName} ${targetUser.lastName}`;

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType,
          summary,
          details: {
            previousAssignedUserId: issue.assignedUserId,
            newAssignedUserId: targetUser.id,
            reason: dto.reason?.trim() ?? null,
          },
        },
      });

      // Notificar al usuario asignado
      await tx.notification.create({
        data: {
          organizationId: user.organizationId,
          recipientId: targetUser.id,
          issueId: issue.id,
          title: `Novedad asignada: ${issue.code}`,
          message: `El Director Operativo le ha asignado como responsable principal de la novedad "${issue.title}".`,
        },
      });

      return updatedIssue;
    });
  }

  /**
   * Modifica la prioridad de una novedad (Exclusivo Director Operativo - DEC-07 / RF-015).
   * Exige motivo obligatorio, conserva la prioridad inicial en el historial y alerta si es crítica (RF-014).
   */
  async updatePriority(
    user: AuthenticatedUser,
    issueId: string,
    dto: UpdatePriorityDto,
  ) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Solo el Director Operativo puede modificar formalmente la prioridad',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        priority: true,
        code: true,
        title: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    const previousPriority = issue.priority;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: { priority: dto.priority },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.CAMBIO_PRIORIDAD,
          summary: `Prioridad cambiada de ${previousPriority} a ${dto.priority}. Motivo: ${dto.reason.trim()}`,
          details: {
            previousPriority,
            newPriority: dto.priority,
            reason: dto.reason.trim(),
          },
        },
      });

      // RF-014: Si se reclasifica a prioridad CRÍTICA, generar alerta inmediata a la Dirección Operativa dentro de la misma transacción
      if (
        dto.priority === IssuePriority.CRITICA &&
        previousPriority !== IssuePriority.CRITICA
      ) {
        const directors = await tx.user.findMany({
          where: {
            organizationId: user.organizationId,
            role: Role.DIRECTOR_OPERATIVO,
            isActive: true,
          },
          select: { id: true },
        });

        for (const dir of directors) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId: dir.id,
              issueId: issue.id,
              title: `ALERTA: Novedad reclasificada a CRÍTICA ${issue.code}`,
              message: `La novedad "${issue.title}" ha sido reclasificada a CRÍTICA por ${user.email}. Motivo: ${dto.reason.trim()}. Requiere seguimiento prioritario.`,
            },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Permite registrar medidas urgentes en novedades críticas antes o después de la asignación formal (DEC-06 / RF-013).
   */
  async addUrgentMeasure(
    user: AuthenticatedUser,
    issueId: string,
    dto: AddUrgentMeasureDto,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para registrar medidas urgentes',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        priority: true,
        initialPriority: true,
        propertyId: true,
        internalAreaId: true,
        urgentMeasures: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    if (
      issue.priority !== IssuePriority.CRITICA &&
      issue.initialPriority !== IssuePriority.CRITICA
    ) {
      throw new BadRequestException(
        'Solo se pueden registrar actuaciones urgentes sobre novedades de prioridad crítica',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const currentMeasures = issue.urgentMeasures ? `${issue.urgentMeasures}\n` : '';
      const timestamp = new Date().toISOString();
      const updatedMeasureText = `${currentMeasures}[${timestamp} - ${user.email}]: ${dto.measure.trim()}`;

      const updated = await tx.issue.update({
        where: { id: issue.id },
        data: {
          urgentMeasures: updatedMeasureText,
        },
      });

      // Registrar evento inmutable de medida urgente
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.MEDIDA_URGENTE,
          summary: `Medida urgente registrada: ${dto.measure.trim()}`,
          details: { measure: dto.measure.trim() },
        },
      });

      // Notificar al director de la actuación urgente si el autor no es director
      if (user.role !== Role.DIRECTOR_OPERATIVO) {
        const directors = await tx.user.findMany({
          where: {
            organizationId: user.organizationId,
            role: Role.DIRECTOR_OPERATIVO,
            isActive: true,
          },
          select: { id: true },
        });

        for (const dir of directors) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId: dir.id,
              issueId: issue.id,
              title: `Actuación urgente en ${issue.code}`,
              message: `${user.email} registró una medida urgente: "${dto.measure.trim()}"`,
            },
          });
        }
      }

      return updated;
    });
  }

  /**
   * Lista novedades aplicando filtrado estricto por alcance (RF-049).
   */
  async list(user: AuthenticatedUser, query: ListIssuesQueryDto) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a novedades operativas',
      );
    }

    const accessiblePropertyIds = await this.scopeAuth.getAccessiblePropertyIds(user);
    const accessibleAreaIds = await this.scopeAuth.getAccessibleInternalAreaIds(user);

    const where: any = {
      organizationId: user.organizationId,
    };

    // Aislamiento de ámbito para coordinadores / auxiliares
    if (accessiblePropertyIds !== null && accessibleAreaIds !== null) {
      where.OR = [
        { propertyId: { in: accessiblePropertyIds } },
        { internalAreaId: { in: accessibleAreaIds } },
      ];
    } else if (accessiblePropertyIds !== null) {
      where.propertyId = { in: accessiblePropertyIds };
    } else if (accessibleAreaIds !== null) {
      where.internalAreaId = { in: accessibleAreaIds };
    }

    // Filtros opcionales
    if (query.scope) where.scope = query.scope;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.internalAreaId) where.internalAreaId = query.internalAreaId;
    if (query.priority) where.priority = query.priority;
    if (query.status) where.status = query.status;
    if (query.isCritical) where.priority = IssuePriority.CRITICA;
    if (query.mine) where.assignedUserId = user.id;
    if (query.pendingReview) where.status = IssueStatus.EN_REVISION;

    const issues = await this.prisma.issue.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, scope: true } },
        property: { select: { id: true, name: true, code: true } },
        propertyZone: { select: { id: true, name: true } },
        internalArea: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        suggestedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        // Solo actividades abiertas, con lo mínimo para el resumen de bandeja
        activities: {
          where: { status: { notIn: [ActivityStatus.COMPLETADA, ActivityStatus.CANCELADA] } },
          select: { status: true, dueDate: true, assignedUserId: true },
        },
        // Último hito del flujo de cierre, para saber si la novedad fue devuelta
        events: {
          where: { eventType: { in: IssuesService.CLOSURE_FLOW_EVENTS } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { eventType: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return issues.map(({ activities, events, ...issue }) => ({
      ...issue,
      inbox: IssuesService.inboxSummary(activities ?? [], events?.[0], user.id, now),
    }));
  }

  private static readonly CLOSURE_FLOW_EVENTS: IssueEventType[] = [
    IssueEventType.SOLICITUD_CIERRE,
    IssueEventType.DEVOLUCION,
    IssueEventType.CIERRE_DEFINITIVO,
    IssueEventType.REAPERTURA,
  ];

  /**
   * Resumen para las bandejas por rol (RF-027): actividades abiertas, vencidas,
   * bloqueadas, las asignadas al usuario y si la novedad quedó devuelta.
   */
  static inboxSummary(
    activities: { status: ActivityStatus; dueDate: Date | null; assignedUserId: string | null }[],
    lastClosureEvent: { eventType: IssueEventType; createdAt: Date } | undefined,
    userId: string,
    now: Date,
  ) {
    return {
      openActivities: activities.length,
      overdueActivities: activities.filter((a) => a.dueDate !== null && a.dueDate < now).length,
      blockedActivities: activities.filter((a) => a.status === ActivityStatus.BLOQUEADA).length,
      myOpenActivities: activities.filter((a) => a.assignedUserId === userId).length,
      returned: lastClosureEvent?.eventType === IssueEventType.DEVOLUCION,
      returnedAt: lastClosureEvent?.eventType === IssueEventType.DEVOLUCION ? lastClosureEvent.createdAt : null,
    };
  }

  /**
   * Obtiene el detalle completo y cronología de eventos de una novedad (RF-026).
   */
  async findById(user: AuthenticatedUser, issueId: string) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a novedades operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        category: true,
        property: { select: { id: true, name: true, code: true } },
        propertyZone: { select: { id: true, name: true } },
        internalArea: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        suggestedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            assignedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        events: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            assignedUser: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            _count: { select: { comments: true, attachments: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        comments: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            activity: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: {
            uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
            activity: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    return issue;
  }

  /**
   * Obtiene los candidatos autorizados para asignación en una novedad específica (RF-011).
   * Director Operativo y Gerente tienen visibilidad global.
   * Otros roles operativos (e.g. Coordinador) requieren acceso vigente al ámbito de la novedad.
   */
  async getCandidates(user: AuthenticatedUser, issueId: string) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El Administrador no cuenta con acceso operativo a novedades ni a sus candidatos',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    // Validar acceso vigente al ámbito si no es Director o Gerente
    if (user.role !== Role.DIRECTOR_OPERATIVO && user.role !== Role.GERENTE) {
      if (issue.propertyId) {
        await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
      } else if (issue.internalAreaId) {
        await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
      }
    }

    // 1. Roles con alcance global operativo (Director y Gerente)
    const globalUsers = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        role: { in: [Role.DIRECTOR_OPERATIVO, Role.GERENTE] },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
      },
    });

    // 2. Usuarios con asignación activa en el ámbito correspondiente (RF-011)
    let scopedUsers: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: Role;
      isLead: boolean;
    }[] = [];

    if (issue.scope === IssueScope.PROPIEDAD && issue.propertyId) {
      const propertyAssignments = await this.prisma.propertyAssignment.findMany({
        where: {
          propertyId: issue.propertyId,
          isActive: true,
          user: { isActive: true, role: { not: Role.ADMINISTRADOR } },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      });
      scopedUsers = propertyAssignments.map((a) => ({
        ...a.user,
        isLead: a.isLead,
      }));
    } else if (issue.scope === IssueScope.INTERNA && issue.internalAreaId) {
      const areaAssignments = await this.prisma.areaAssignment.findMany({
        where: {
          internalAreaId: issue.internalAreaId,
          isActive: true,
          user: { isActive: true, role: { not: Role.ADMINISTRADOR } },
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      });
      scopedUsers = areaAssignments.map((a) => ({
        ...a.user,
        isLead: a.isLead,
      }));
    }

    // Unir y estructurar candidatos únicos
    const candidatesMap = new Map<string, any>();
    for (const u of scopedUsers) {
      candidatesMap.set(u.id, {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        isLead: u.isLead,
        scopeAuthorized: true,
      });
    }
    for (const u of globalUsers) {
      if (!candidatesMap.has(u.id)) {
        candidatesMap.set(u.id, {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.role,
          isLead: false,
          scopeAuthorized: true,
        });
      }
    }

    return Array.from(candidatesMap.values());
  }

  /**
   * Lista categorías activas por ámbito.
   */
  async listCategories(user: AuthenticatedUser, scope?: IssueScope) {
    const where: any = {
      organizationId: user.organizationId,
      isActive: true,
    };
    if (scope) where.scope = scope;

    return this.prisma.category.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Helper para validar que un usuario candidato o mencionado pertenezca a la organización,
   * esté activo, no sea Administrador y cuente con autorización activa en el ámbito (CP-10 / RF-011).
   */
  private async validateCandidateAuthorization(
    candidateId: string,
    organizationId: string,
    scope: IssueScope,
    propertyId: string | null,
    internalAreaId: string | null,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        organizationId: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!targetUser || targetUser.organizationId !== organizationId) {
      throw new BadRequestException('El usuario no pertenece a la organización');
    }

    if (!targetUser.isActive) {
      throw new BadRequestException('El usuario no está activo');
    }

    if (targetUser.role === Role.ADMINISTRADOR) {
      throw new BadRequestException(
        'El rol Administrador del Sistema no puede ser asignado operativamente (RN-001 / RN-002)',
      );
    }

    const targetUserAuth: AuthenticatedUser = {
      id: targetUser.id,
      email: targetUser.email,
      role: targetUser.role,
      organizationId: targetUser.organizationId,
    };

    if (scope === IssueScope.PROPIEDAD && propertyId) {
      const hasAccess = await this.scopeAuth.hasPropertyAccess(
        targetUserAuth,
        propertyId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario no cuenta con autorización activa sobre la propiedad de la novedad',
        );
      }
    } else if (scope === IssueScope.INTERNA && internalAreaId) {
      const hasAccess = await this.scopeAuth.hasInternalAreaAccess(
        targetUserAuth,
        internalAreaId,
      );
      if (!hasAccess) {
        throw new BadRequestException(
          'El usuario no cuenta con autorización activa sobre el área interna de la novedad',
        );
      }
    }

    return targetUser;
  }

  /**
   * Crea una nueva actividad dentro de una novedad (RF-019 / CP-09).
   * Solo el Director Operativo o el responsable principal de la novedad pueden crearla.
   */
  async createActivity(
    user: AuthenticatedUser,
    issueId: string,
    dto: CreateActivityDto,
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    // Validar acceso vigente al ámbito (RF-011 / Scope Authorization)
    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Validar permisos de creación: Director o Responsable Principal
    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isPrincipal = issue.assignedUserId === user.id;

    if (!isDirector && !isPrincipal) {
      throw new ForbiddenException(
        'Solo el Director Operativo o el responsable principal de la novedad pueden crear actividades',
      );
    }

    let assignedUser: { id: string; firstName: string; lastName: string } | null = null;
    if (dto.assignedUserId) {
      const candidate = await this.validateCandidateAuthorization(
        dto.assignedUserId,
        user.organizationId,
        issue.scope,
        issue.propertyId,
        issue.internalAreaId,
      );
      assignedUser = candidate;
    }

    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.issueActivity.create({
        data: {
          issueId: issue.id,
          title: dto.title.trim(),
          description: dto.description.trim(),
          assignedUserId: dto.assignedUserId ?? null,
          createdById: user.id,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          status: ActivityStatus.PENDIENTE,
          version: 1,
        },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      });

      // Auditoría en la misma transacción
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.ACTIVIDAD_CREADA,
          summary: `Actividad "${activity.title}" creada por ${user.email}${
            assignedUser ? ` y asignada a ${assignedUser.firstName} ${assignedUser.lastName}` : ''
          }`,
          details: {
            activityId: activity.id,
            title: activity.title,
            assignedUserId: activity.assignedUserId,
            dueDate: activity.dueDate ? activity.dueDate.toISOString() : null,
            authorId: user.id,
            createdAt: new Date().toISOString(),
          },
        },
      });

      // Notificación al responsable asignado (RF-020 / CP-09)
      if (dto.assignedUserId && dto.assignedUserId !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: dto.assignedUserId,
            issueId: issue.id,
            title: `Nueva actividad asignada en ${issue.code}`,
            message: `Se le ha asignado la actividad "${activity.title}" en la novedad ${issue.code}: ${issue.title}`,
          },
        });
      }

      return activity;
    });
  }

  /**
   * Lista las actividades de una novedad, verificando autorización de ámbito.
   */
  async listActivities(user: AuthenticatedUser, issueId: string) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a actividades operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    return this.prisma.issueActivity.findMany({
      where: { issueId: issue.id },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        _count: {
          select: { comments: true, attachments: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Asigna o reasigna un responsable a una actividad con control de concurrencia optimista y auditoría.
   * Solo el Director Operativo o el responsable principal de la novedad pueden reasignar actividades.
   */
  async assignActivity(
    user: AuthenticatedUser,
    issueId: string,
    activityId: string,
    dto: AssignActivityDto,
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    // Validar acceso vigente al ámbito (RF-011 / Scope Authorization)
    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isPrincipal = issue.assignedUserId === user.id;

    if (!isDirector && !isPrincipal) {
      throw new ForbiddenException(
        'Solo el Director Operativo o el responsable principal de la novedad pueden reasignar actividades',
      );
    }

    // Integridad: verificar que la actividad pertenezca a esta novedad
    const activity = await this.prisma.issueActivity.findFirst({
      where: { id: activityId, issueId: issue.id },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada en esta novedad');
    }

    // Control de concurrencia optimista previo (409 Conflict)
    if (activity.version !== dto.version) {
      throw new ConflictException(
        `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version}, versión actual: ${activity.version})`,
      );
    }

    // Validar nuevo candidato (CP-10)
    const newAssignee = await this.validateCandidateAuthorization(
      dto.assignedUserId,
      user.organizationId,
      issue.scope,
      issue.propertyId,
      issue.internalAreaId,
    );

    const previousAssignedUserId = activity.assignedUserId;
    const previousAssigneeName = activity.assignedUser
      ? `${activity.assignedUser.firstName} ${activity.assignedUser.lastName}`
      : 'Sin asignar';

    return this.prisma.$transaction(async (tx) => {
      // Escritura atómica exigiendo la versión esperada para prevenir carreras de concurrencia (409)
      const updateResult = await tx.issueActivity.updateMany({
        where: {
          id: activity.id,
          version: dto.version,
        },
        data: {
          assignedUserId: dto.assignedUserId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version})`,
        );
      }

      const updatedActivity = await tx.issueActivity.findUniqueOrThrow({
        where: { id: activity.id },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      });

      const eventType = previousAssignedUserId
        ? IssueEventType.ACTIVIDAD_REASIGNADA
        : IssueEventType.ACTIVIDAD_ASIGNADA;

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType,
          summary: `Actividad "${activity.title}" reasignada de ${previousAssigneeName} a ${newAssignee.firstName} ${newAssignee.lastName}`,
          details: {
            activityId: activity.id,
            title: activity.title,
            previousAssignedUserId,
            newAssignedUserId: dto.assignedUserId,
            previousVersion: activity.version,
            newVersion: updatedActivity.version,
            authorId: user.id,
            updatedAt: new Date().toISOString(),
          },
        },
      });

      // Notificación al nuevo responsable (RF-020 / CP-09)
      if (dto.assignedUserId !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: dto.assignedUserId,
            issueId: issue.id,
            title: `Actividad asignada en ${issue.code}`,
            message: `Se le ha asignado la actividad "${activity.title}" en la novedad ${issue.code}: ${issue.title}`,
          },
        });
      }

      return updatedActivity;
    });
  }

  /**
   * Actualiza el estado o datos de una actividad con control de concurrencia optimista (409)
   * y permisos estrictos por rol y asignación.
   *
   * Permisos:
   * - Director Operativo o Responsable Principal: pueden modificar todo (título, descripción, fecha, estado, cancelar).
   * - Responsable Asignado de la Actividad: puede cambiar estado (PENDIENTE, EN_CURSO, BLOQUEADA, COMPLETADA) y statusReason.
   *   NO puede modificar título, descripción, fecha límite, ni CANCELAR la actividad.
   * - Otros usuarios (incluso con acceso al ámbito): 403 Forbidden.
   *
   * Invariante de NO cierre:
   * - Completar actividades NUNCA cambia el estado de la novedad (issue.status).
   *   El cierre de la novedad pertenece exclusivamente a F5 y al Director Operativo.
   */
  async updateActivity(
    user: AuthenticatedUser,
    issueId: string,
    activityId: string,
    dto: UpdateActivityDto,
  ) {
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    // Validar acceso vigente al ámbito (RF-011 / Scope Authorization)
    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Integridad: verificar que la actividad pertenezca exactamente a esta novedad
    const activity = await this.prisma.issueActivity.findFirst({
      where: { id: activityId, issueId: issue.id },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Actividad no encontrada en esta novedad');
    }

    // Control de concurrencia optimista previo (409 Conflict)
    if (activity.version !== dto.version) {
      throw new ConflictException(
        `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version}, versión actual: ${activity.version})`,
      );
    }

    // Distinción estricta de permisos de actualización
    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isPrincipal = issue.assignedUserId === user.id;
    const isActivityAssignee = activity.assignedUserId === user.id;

    if (!isDirector && !isPrincipal && !isActivityAssignee) {
      throw new ForbiddenException(
        'No tiene permisos para modificar esta actividad (solo el Director, el responsable principal o el responsable asignado a la actividad pueden modificarla)',
      );
    }

    // Si el usuario es ÚNICAMENTE el responsable asignado a la actividad (no Director ni Principal de novedad):
    if (!isDirector && !isPrincipal && isActivityAssignee) {
      // 1. No puede editar datos generales (título, descripción, fecha límite)
      if (
        (dto.title && dto.title.trim() !== activity.title) ||
        (dto.description && dto.description.trim() !== activity.description) ||
        (dto.dueDate !== undefined && (dto.dueDate ? new Date(dto.dueDate).toISOString() : null) !== (activity.dueDate ? activity.dueDate.toISOString() : null))
      ) {
        throw new ForbiddenException(
          'Solo el Director Operativo o el responsable principal de la novedad pueden modificar los datos generales de la actividad',
        );
      }

      // 2. No puede cancelar la actividad
      if (dto.status === ActivityStatus.CANCELADA) {
        throw new ForbiddenException(
          'Solo el Director Operativo o el responsable principal de la novedad pueden cancelar una actividad',
        );
      }
    }

    // Validación de motivo obligatorio en BLOQUEADA y CANCELADA (RF-019 / RN-069 / RN-070 / CP-11)
    // Se valida el estado resultante completo: no se puede borrar el motivo de una actividad bloqueada o cancelada
    const resultingStatus = dto.status ?? activity.status;
    const resultingReason =
      dto.statusReason !== undefined
        ? (dto.statusReason ? dto.statusReason.trim() : '')
        : (activity.statusReason ? activity.statusReason.trim() : '');

    if (
      resultingStatus === ActivityStatus.BLOQUEADA ||
      resultingStatus === ActivityStatus.CANCELADA
    ) {
      if (!resultingReason) {
        throw new BadRequestException(
          'El motivo (statusReason) es obligatorio para marcar o mantener la actividad como BLOQUEADA o CANCELADA (RF-019 / RN-069 / RN-070)',
        );
      }
    }

    // Detección de cambios detallados para auditoría (Finding 6)
    const changes: Record<string, { previous: any; new: any }> = {};

    if (dto.title && (isDirector || isPrincipal)) {
      const cleanTitle = dto.title.trim();
      if (cleanTitle !== activity.title) {
        changes['title'] = { previous: activity.title, new: cleanTitle };
      }
    }

    if (dto.description && (isDirector || isPrincipal)) {
      const cleanDescription = dto.description.trim();
      if (cleanDescription !== activity.description) {
        changes['description'] = { previous: activity.description, new: cleanDescription };
      }
    }

    if (dto.dueDate !== undefined && (isDirector || isPrincipal)) {
      const prevDueIso = activity.dueDate ? activity.dueDate.toISOString() : null;
      const newDueIso = dto.dueDate ? new Date(dto.dueDate).toISOString() : null;
      if (prevDueIso !== newDueIso) {
        changes['dueDate'] = { previous: prevDueIso, new: newDueIso };
      }
    }

    if (dto.status && dto.status !== activity.status) {
      changes['status'] = { previous: activity.status, new: dto.status };
    }

    if (dto.statusReason !== undefined) {
      const prevReason = activity.statusReason ? activity.statusReason.trim() : null;
      const newReason = dto.statusReason ? dto.statusReason.trim() : null;
      if (prevReason !== newReason) {
        changes['statusReason'] = { previous: prevReason, new: newReason };
      }
    }

    const previousStatus = activity.status;
    const isStatusChange = dto.status && dto.status !== previousStatus;

    return this.prisma.$transaction(async (tx) => {
      const updateData: any = {
        version: { increment: 1 },
      };

      if (dto.title && (isDirector || isPrincipal)) {
        updateData.title = dto.title.trim();
      }
      if (dto.description && (isDirector || isPrincipal)) {
        updateData.description = dto.description.trim();
      }
      if (dto.dueDate !== undefined && (isDirector || isPrincipal)) {
        updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      }
      if (dto.status) {
        updateData.status = dto.status;
      }
      if (dto.statusReason !== undefined) {
        updateData.statusReason = dto.statusReason ? dto.statusReason.trim() : null;
      }

      // Preservar completedAt: solo se establece al entrar a COMPLETADA; se conserva en actualizaciones posteriores
      if (dto.status === ActivityStatus.COMPLETADA && activity.status !== ActivityStatus.COMPLETADA) {
        updateData.completedAt = new Date();
      } else if (dto.status && dto.status !== ActivityStatus.COMPLETADA) {
        updateData.completedAt = null;
      }

      // Escritura atómica exigiendo la versión esperada para prevenir colisiones de concurrencia (409)
      const updateResult = await tx.issueActivity.updateMany({
        where: {
          id: activity.id,
          version: dto.version,
        },
        data: updateData,
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          `Conflicto de concurrencia (409): la actividad ha sido modificada por otro usuario (versión esperada: ${dto.version})`,
        );
      }

      const updatedActivity = await tx.issueActivity.findUniqueOrThrow({
        where: { id: activity.id },
        include: {
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
        },
      });

      // Auditoría detallada en la misma transacción (Finding 6)
      const changeKeys = Object.keys(changes);
      let eventSummary = '';
      if (isStatusChange) {
        eventSummary = `Estado de la actividad "${activity.title}" cambiado de ${previousStatus} a ${dto.status}${
          dto.statusReason ? `. Motivo: ${dto.statusReason.trim()}` : ''
        }${changeKeys.length > 1 ? ` (modificaciones: ${changeKeys.filter((k) => k !== 'status').join(', ')})` : ''}`;
      } else if (changeKeys.length > 0) {
        eventSummary = `Actividad "${activity.title}" actualizada (${changeKeys.join(', ')}) por ${user.email}`;
      } else {
        eventSummary = `Actividad "${activity.title}" actualizada por ${user.email}`;
      }

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.ACTIVIDAD_ESTADO,
          summary: eventSummary,
          details: {
            activityId: activity.id,
            previousStatus: isStatusChange ? previousStatus : undefined,
            newStatus: isStatusChange ? dto.status : undefined,
            statusReason: dto.statusReason ? dto.statusReason.trim() : (activity.statusReason ?? undefined),
            changes: changeKeys.length > 0 ? changes : undefined,
            previousVersion: activity.version,
            newVersion: updatedActivity.version,
            authorId: user.id,
            date: new Date().toISOString(),
          },
        },
      });

      return updatedActivity;
    });
  }

  /**
   * Agrega un comentario a la novedad o a una actividad específica (RF-020).
   * Valida integridad (activityId pertenece a issueId) y soporte de menciones con notificación.
   */
  async createComment(
    user: AuthenticatedUser,
    issueId: string,
    dto: CreateCommentDto,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para comentar en novedades operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        title: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Integridad: verificar que la actividad especificada pertenece exactamente a esta novedad
    let activityTitle: string | null = null;
    if (dto.activityId) {
      const activity = await this.prisma.issueActivity.findFirst({
        where: { id: dto.activityId, issueId: issue.id },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad especificada no pertenece a esta novedad (integridad referencial)',
        );
      }
      activityTitle = activity.title;
    }

    // Validación de menciones a usuarios autorizados
    const validMentionIds: string[] = [];
    if (dto.mentions && dto.mentions.length > 0) {
      const uniqueMentions = Array.from(new Set(dto.mentions));
      for (const mentionId of uniqueMentions) {
        await this.validateCandidateAuthorization(
          mentionId,
          user.organizationId,
          issue.scope,
          issue.propertyId,
          issue.internalAreaId,
        );
        validMentionIds.push(mentionId);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.issueComment.create({
        data: {
          issueId: issue.id,
          activityId: dto.activityId ?? null,
          userId: user.id,
          content: dto.content.trim(),
          mentions: validMentionIds,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, role: true },
          },
          activity: {
            select: { id: true, title: true },
          },
        },
      });

      // Auditoría en la misma transacción
      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.COMENTARIO_AGREGADO,
          summary: `Comentario agregado por ${user.email}${
            activityTitle ? ` en la actividad "${activityTitle}"` : ''
          }`,
          details: {
            commentId: comment.id,
            activityId: comment.activityId,
            mentions: validMentionIds,
            authorId: user.id,
            createdAt: comment.createdAt.toISOString(),
          },
        },
      });

      // Notificaciones para usuarios mencionados (RF-020)
      for (const recipientId of validMentionIds) {
        if (recipientId !== user.id) {
          await tx.notification.create({
            data: {
              organizationId: user.organizationId,
              recipientId,
              issueId: issue.id,
              title: `Mención en ${issue.code}`,
              message: `${user.email} le mencionó en la novedad ${issue.code}: "${dto.content.slice(0, 100)}${dto.content.length > 100 ? '...' : ''}"`,
            },
          });
        }
      }

      return comment;
    });
  }

  /**
   * Lista los comentarios de una novedad, con filtro opcional por actividad validando integridad.
   */
  async listComments(
    user: AuthenticatedUser,
    issueId: string,
    activityId?: string,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a comentarios operativos',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      select: {
        id: true,
        organizationId: true,
        scope: true,
        propertyId: true,
        internalAreaId: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    // Integridad: verificar que la actividad especificada pertenece exactamente a esta novedad
    if (activityId) {
      const activity = await this.prisma.issueActivity.findFirst({
        where: { id: activityId, issueId: issue.id },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad especificada no pertenece a esta novedad (integridad referencial)',
        );
      }
    }

    const where: any = { issueId: issue.id };
    if (activityId) where.activityId = activityId;

    return this.prisma.issueComment.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
        activity: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // --- GESTIÓN DE ADJUNTOS Y EVIDENCIAS (F4 / RF-021, RF-022, PEN-07) ---

  async uploadAttachment(
    user: AuthenticatedUser,
    issueId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    dto: CreateAttachmentDto,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para adjuntar evidencias operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    if (issue.status === IssueStatus.CERRADA || issue.status === IssueStatus.DESCARTADA) {
      throw new BadRequestException(
        'No es posible adjuntar evidencias a una novedad que se encuentra cerrada o descartada',
      );
    }

    if (dto.activityId) {
      const activity = await this.prisma.issueActivity.findFirst({
        where: { id: dto.activityId, issueId: issue.id },
      });
      if (!activity) {
        throw new BadRequestException(
          'La actividad especificada no pertenece a esta novedad (integridad referencial)',
        );
      }
    }

    const currentAttachmentCount = await this.prisma.issueAttachment.count({
      where: { issueId: issue.id },
    });
    if (currentAttachmentCount >= PROVISIONAL_FILE_POLICY.maxAttachmentsPerIssue) {
      throw new BadRequestException(
        `Se ha alcanzado el límite máximo de ${PROVISIONAL_FILE_POLICY.maxAttachmentsPerIssue} adjuntos por novedad (PEN-07 provisional)`,
      );
    }

    const stored = await this.privateStorage.storeFile(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const stage = dto.stage || EvidenceStage.SOPORTE;

    return this.prisma.$transaction(async (tx) => {
      const attachment = await tx.issueAttachment.create({
        data: {
          issueId: issue.id,
          activityId: dto.activityId || null,
          uploadedById: user.id,
          stage,
          fileName: stored.fileName,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
          sha256: stored.sha256,
          storageKey: stored.storageKey,
        },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          activity: {
            select: { id: true, title: true },
          },
        },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.EVIDENCIA_ADJUNTADA,
          summary: `Evidencia adjuntada (${stage}): ${stored.fileName} (${(stored.fileSize / 1024).toFixed(1)} KB) por ${user.email}`,
          details: {
            attachmentId: attachment.id,
            fileName: stored.fileName,
            fileSize: stored.fileSize,
            mimeType: stored.mimeType,
            sha256: stored.sha256,
            stage,
            activityId: dto.activityId || null,
          },
        },
      });

      return attachment;
    });
  }

  async listAttachments(
    user: AuthenticatedUser,
    issueId: string,
    activityId?: string,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para acceder a evidencias operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    const where: any = { issueId: issue.id };
    if (activityId) where.activityId = activityId;

    return this.prisma.issueAttachment.findMany({
      where,
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        activity: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAttachmentFile(
    user: AuthenticatedUser,
    issueId: string,
    attachmentId: string,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para descargar evidencias operativas',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    const attachment = await this.prisma.issueAttachment.findFirst({
      where: { id: attachmentId, issueId: issue.id },
    });

    if (!attachment) {
      throw new NotFoundException('Evidencia no encontrada para esta novedad');
    }

    const fileBuffer = await this.privateStorage.getFile(attachment.storageKey);

    return {
      buffer: fileBuffer,
      attachment,
    };
  }

  // --- CICLO DE CIERRE, DEVOLUCIÓN, REAPERTURA Y DESCARTE (F5 / RF-012, RF-023, RF-024, RF-025, RF-026, CP-12 a CP-16) ---

  async requestClosure(
    user: AuthenticatedUser,
    issueId: string,
    dto: RequestClosureDto,
  ) {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para gestionar cierres operativos',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        category: true,
        activities: true,
        attachments: true,
      },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.propertyId) {
      await this.scopeAuth.validatePropertyAccess(user, issue.propertyId);
    } else if (issue.internalAreaId) {
      await this.scopeAuth.validateInternalAreaAccess(user, issue.internalAreaId);
    }

    const isDirector = user.role === Role.DIRECTOR_OPERATIVO;
    const isAssignedLead = issue.assignedUserId === user.id;

    if (!isDirector && !isAssignedLead) {
      throw new ForbiddenException(
        'Solo el responsable principal asignado o el Director Operativo pueden solicitar el cierre de la novedad (RF-024)',
      );
    }

    if (
      issue.status !== IssueStatus.ASIGNADA &&
      issue.status !== IssueStatus.EN_ATENCION
    ) {
      throw new BadRequestException(
        `No es posible solicitar el cierre de una novedad en estado ${issue.status}. Debe estar ASIGNADA o EN_ATENCION`,
      );
    }

    const pendingActivities = issue.activities.filter(
      (a) =>
        a.status === ActivityStatus.PENDIENTE ||
        a.status === ActivityStatus.EN_CURSO ||
        a.status === ActivityStatus.BLOQUEADA,
    );

    if (pendingActivities.length > 0) {
      throw new BadRequestException(
        `Todas las actividades de la novedad deben estar completadas o canceladas antes de solicitar el cierre (${pendingActivities.length} actividad(es) pendiente(s)) (RF-018)`,
      );
    }

    if (issue.category.requiresEvidence) {
      const hasFinalEvidence = issue.attachments.some(
        (att) => att.stage === EvidenceStage.FINAL,
      );
      if (!hasFinalEvidence) {
        throw new BadRequestException(
          'La categoría exige evidencia en etapa FINAL antes de solicitar el cierre (CP-12 / RF-023)',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: {
          status: IssueStatus.PENDIENTE_CIERRE,
        },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.SOLICITUD_CIERRE,
          summary: `Solicitud de cierre registrada por ${user.email}`,
          details: {
            notes: dto.notes || null,
            requestedBy: user.id,
          },
        },
      });

      const directors = await tx.user.findMany({
        where: {
          organizationId: user.organizationId,
          role: Role.DIRECTOR_OPERATIVO,
          isActive: true,
        },
        select: { id: true },
      });

      for (const director of directors) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: director.id,
            issueId: issue.id,
            title: `Solicitud de cierre pendiente: ${issue.code}`,
            message: `El responsable ${user.email} ha solicitado verificar y cerrar la novedad ${issue.code}.`,
          },
        });
      }

      return updatedIssue;
    });
  }

  async close(user: AuthenticatedUser, issueId: string, dto: CloseIssueDto) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Únicamente el Director Operativo tiene autorización para cerrar definitivamente una novedad (RF-025 / CP-14)',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (
      issue.status !== IssueStatus.PENDIENTE_CIERRE &&
      issue.status !== IssueStatus.EN_ATENCION &&
      issue.status !== IssueStatus.ASIGNADA
    ) {
      throw new BadRequestException(
        `No es posible cerrar definitivamente una novedad en estado ${issue.status}`,
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: {
          status: IssueStatus.CERRADA,
          closedAt: now,
        },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.CIERRE_DEFINITIVO,
          summary: `Cierre definitivo verificado y aprobado por el Director Operativo (${user.email})`,
          details: {
            observations: dto.closureObservations || null,
            closedAt: now.toISOString(),
          },
        },
      });

      const recipients = new Set<string>();
      if (issue.assignedUserId && issue.assignedUserId !== user.id) {
        recipients.add(issue.assignedUserId);
      }
      if (issue.createdById && issue.createdById !== user.id) {
        recipients.add(issue.createdById);
      }

      for (const recipientId of recipients) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId,
            issueId: issue.id,
            title: `Novedad cerrada: ${issue.code}`,
            message: `La novedad ${issue.code} ha sido cerrada formalmente por la Dirección Operativa.`,
          },
        });
      }

      return updatedIssue;
    });
  }

  async return(user: AuthenticatedUser, issueId: string, dto: ReturnIssueDto) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Únicamente el Director Operativo tiene autorización para devolver una solicitud de cierre (RF-025)',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (
      issue.status !== IssueStatus.PENDIENTE_CIERRE &&
      issue.status !== IssueStatus.EN_REVISION
    ) {
      throw new BadRequestException(
        `Solo es posible devolver novedades en estado PENDIENTE_CIERRE o EN_REVISION (estado actual: ${issue.status})`,
      );
    }

    const newStatus =
      issue.status === IssueStatus.PENDIENTE_CIERRE
        ? IssueStatus.EN_ATENCION
        : IssueStatus.REGISTRADA;

    return this.prisma.$transaction(async (tx) => {
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: { status: newStatus },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.DEVOLUCION,
          summary: `Devolución de novedad por la Dirección Operativa: ${dto.reason}`,
          details: {
            reason: dto.reason,
            previousStatus: issue.status,
            newStatus,
          },
        },
      });

      if (issue.assignedUserId && issue.assignedUserId !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: issue.assignedUserId,
            issueId: issue.id,
            title: `Devolución de novedad: ${issue.code}`,
            message: `La solicitud de cierre de la novedad ${issue.code} ha sido devuelta. Motivo: ${dto.reason}`,
          },
        });
      }

      return updatedIssue;
    });
  }

  async reopen(user: AuthenticatedUser, issueId: string, dto: ReopenIssueDto) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Únicamente el Director Operativo tiene autorización para reabrir novedades cerradas (RF-025 / CP-16)',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (issue.status !== IssueStatus.CERRADA) {
      throw new BadRequestException(
        `Solo es posible reabrir novedades que se encuentren en estado CERRADA (estado actual: ${issue.status}) (CP-16)`,
      );
    }

    const previousClosedAt = issue.closedAt;

    return this.prisma.$transaction(async (tx) => {
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: {
          status: IssueStatus.EN_ATENCION,
          closedAt: null,
        },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.REAPERTURA,
          summary: `Reapertura de novedad por la Dirección Operativa: ${dto.reason}`,
          details: {
            reason: dto.reason,
            previousClosedAt: previousClosedAt ? previousClosedAt.toISOString() : null,
          },
        },
      });

      if (issue.assignedUserId && issue.assignedUserId !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: issue.assignedUserId,
            issueId: issue.id,
            title: `Reapertura de novedad: ${issue.code}`,
            message: `La novedad ${issue.code} ha sido reabierta por la Dirección Operativa. Motivo: ${dto.reason}`,
          },
        });
      }

      return updatedIssue;
    });
  }

  async discard(user: AuthenticatedUser, issueId: string, dto: DiscardIssueDto) {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Únicamente el Director Operativo tiene autorización para descartar novedades (RF-012 / PEN-13)',
      );
    }

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    if (!issue || issue.organizationId !== user.organizationId) {
      throw new NotFoundException('Novedad no encontrada');
    }

    if (
      issue.status !== IssueStatus.REGISTRADA &&
      issue.status !== IssueStatus.EN_REVISION
    ) {
      throw new BadRequestException(
        `Solo es posible descartar novedades en estado REGISTRADA o EN_REVISION (estado actual: ${issue.status})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedIssue = await tx.issue.update({
        where: { id: issue.id },
        data: { status: IssueStatus.DESCARTADA },
      });

      await tx.issueEvent.create({
        data: {
          issueId: issue.id,
          userId: user.id,
          eventType: IssueEventType.DESCARTE,
          summary: `Novedad descartada por la Dirección Operativa: ${dto.reason}`,
          details: {
            reason: dto.reason,
            previousStatus: issue.status,
          },
        },
      });

      if (issue.createdById && issue.createdById !== user.id) {
        await tx.notification.create({
          data: {
            organizationId: user.organizationId,
            recipientId: issue.createdById,
            issueId: issue.id,
            title: `Novedad descartada: ${issue.code}`,
            message: `La novedad ${issue.code} ha sido descartada. Motivo: ${dto.reason}`,
          },
        });
      }

      return updatedIssue;
    });
  }
}
