import * as crypto from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  IssuePriority,
  IssueScope,
  IssueStatus,
  ReportScope,
  ReportStatus,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { ScopeAuthorizationService } from '../../organization/application/scope-authorization.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { CreateReportDraftDto } from '../presentation/dto/create-report-draft.dto';
import { UpdateReportDraftDto } from '../presentation/dto/update-report-draft.dto';
import { ReportFilterDto } from '../presentation/dto/report-filter.dto';
import {
  InstitutionalTemplateDto,
  PropertyReportConfigDto,
  ReportDistributionDto,
  ReportListItemDto,
  ReportOperationalData,
  ReportResponseDto,
  ReportReviewDto,
  ReportVersionDto,
} from '../presentation/dto/report-response.dto';
import { CreateInstitutionalTemplateDto } from '../presentation/dto/create-institutional-template.dto';
import { UpdatePropertyReportConfigDto } from '../presentation/dto/update-property-report-config.dto';
import { ReviewReportDto } from '../presentation/dto/review-report.dto';
import { CreateNewVersionDto } from '../presentation/dto/create-new-version.dto';
import { CreateDistributionDto } from '../presentation/dto/create-distribution.dto';
import { PdfGeneratorService } from '../infrastructure/pdf-generator.service';
import { ExcelGeneratorService } from '../infrastructure/excel-generator.service';


@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeAuth: ScopeAuthorizationService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly excelGenerator: ExcelGeneratorService,
  ) {}

  /**
   * Crea un nuevo borrador de informe recopilando automáticamente los datos operativos del periodo (RF-031, RF-032, CP-18).
   */
  async createDraft(
    user: AuthenticatedUser,
    dto: CreateReportDraftDto,
  ): Promise<ReportResponseDto> {
    // 1. Validar autorización de rol (El Administrador técnico no tiene acceso operativo - RF-049)
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para gestionar informes operacionales (RF-049)',
      );
    }

    // 2. Validar coherencia del ámbito seleccionado y sus dependencias
    if (dto.scope === ReportScope.PROPIEDAD && !dto.propertyId) {
      throw new BadRequestException('Para ámbito PROPIEDAD se requiere especificar el propertyId');
    }
    if (dto.scope === ReportScope.INTERNA && !dto.internalAreaId) {
      throw new BadRequestException('Para ámbito INTERNA se requiere especificar el internalAreaId');
    }
    if (dto.scope === ReportScope.CONSOLIDADO) {
      if (user.role === Role.COORDINADOR_OPERATIVO) {
        throw new ForbiddenException(
          'El rol Coordinador Operativo no tiene autorización para generar informes de ámbito CONSOLIDADO (RN-122)',
        );
      }
    }

    // 3. Validar asignaciones del usuario (Aislamiento de ámbitos - RF-049)
    if (dto.scope === ReportScope.PROPIEDAD && dto.propertyId) {
      const accessiblePropertyIds = await this.scopeAuth.getAccessiblePropertyIds(user);
      if (accessiblePropertyIds !== null && !accessiblePropertyIds.includes(dto.propertyId)) {
        throw new ForbiddenException(
          'Acceso denegado: no tiene asignación operativa activa en la propiedad especificada',
        );
      }
    }
    if (dto.scope === ReportScope.INTERNA && dto.internalAreaId) {
      const accessibleAreaIds = await this.scopeAuth.getAccessibleInternalAreaIds(user);
      if (accessibleAreaIds !== null && !accessibleAreaIds.includes(dto.internalAreaId)) {
        throw new ForbiddenException(
          'Acceso denegado: no tiene asignación operativa activa en el área interna especificada',
        );
      }
    }

    // 4. Validar fechas del periodo y corte
    const { startUtc, endUtc, cutoffUtc } = this.parseDateBoundaries(
      dto.periodStart,
      dto.periodEnd,
      dto.cutoffDate,
    );

    if (startUtc > endUtc) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la fecha final');
    }

    // 5. Recopilar datos operacionales automáticos (RF-032, CP-34)
    const operationalData = await this.aggregateOperationalData(
      user.organizationId,
      dto.scope,
      dto.propertyId,
      dto.internalAreaId,
      startUtc,
      endUtc,
      cutoffUtc,
      dto.periodStart,
      dto.periodEnd,
      dto.cutoffDate || dto.periodEnd,
    );

    // 6. Generar código consecutivo de informe (INF-YYYY-NNNN) de forma atómica
    const currentYear = new Date().getFullYear();
    let nextVal: number;
    try {
      const seqResult = await this.prisma.$queryRaw<{ lastValue: number }[]>`
        INSERT INTO "report_sequences" ("id", "organizationId", "year", "lastValue", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid()::text,
          ${user.organizationId},
          ${currentYear},
          COALESCE((SELECT COUNT(*) FROM "reports" WHERE "organizationId" = ${user.organizationId} AND EXTRACT(YEAR FROM "createdAt") = ${currentYear}), 0) + 1,
          NOW(),
          NOW()
        )
        ON CONFLICT ("organizationId", "year")
        DO UPDATE SET "lastValue" = "report_sequences"."lastValue" + 1, "updatedAt" = NOW()
        RETURNING "lastValue";
      `;
      nextVal = Number(seqResult[0]?.lastValue || 1);
    } catch {
      const count = await this.prisma.report.count({
        where: { organizationId: user.organizationId },
      });
      nextVal = count + 1;
    }

    const code = `INF-${currentYear}-${String(nextVal).padStart(4, '0')}`;

    // 7. Persistir informe en estado BORRADOR
    const report = await this.prisma.report.create({
      data: {
        organizationId: user.organizationId,
        code,
        scope: dto.scope,
        title: dto.title.trim(),
        propertyId: dto.scope === ReportScope.PROPIEDAD ? dto.propertyId : null,
        internalAreaId: dto.scope === ReportScope.INTERNA ? dto.internalAreaId : null,
        periodStart: startUtc,
        periodEnd: endUtc,
        cutoffDate: cutoffUtc,
        status: ReportStatus.BORRADOR,
        version: 1,
        introduction: dto.introduction?.trim() || null,
        observations: dto.observations?.trim() || null,
        recommendations: dto.recommendations?.trim() || null,
        finalComments: dto.finalComments?.trim() || null,
        selectedAttachmentIds: dto.selectedAttachmentIds || [],
        showIntroduction: dto.showIntroduction ?? true,
        showKpis: dto.showKpis ?? true,
        showIssuesList: dto.showIssuesList ?? true,
        showActivities: dto.showActivities ?? true,
        showEvidences: dto.showEvidences ?? true,
        showPendingIssues: dto.showPendingIssues ?? true,
        showObservations: dto.showObservations ?? true,
        showRecommendations: dto.showRecommendations ?? true,
        showFinalComments: dto.showFinalComments ?? true,
        operationalData: operationalData as any,
        createdById: user.id || (user as any).userId,
      },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    return this.mapToReportResponse(report);
  }

  /**
   * Lista los informes accesibles para el usuario según su alcance (RF-049).
   */
  async getReports(
    user: AuthenticatedUser,
    filter: ReportFilterDto,
  ): Promise<ReportListItemDto[]> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para consultar informes operacionales (RF-049)',
      );
    }

    const accessiblePropertyIds = await this.scopeAuth.getAccessiblePropertyIds(user);
    const accessibleAreaIds = await this.scopeAuth.getAccessibleInternalAreaIds(user);

    const where: any = {
      organizationId: user.organizationId,
    };

    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.scope) {
      where.scope = filter.scope;
    }

    // Filtrar por permisos de ámbito
    if (user.role === Role.COORDINADOR_OPERATIVO) {
      where.scope = { not: ReportScope.CONSOLIDADO };
      const orConditions: any[] = [];
      if (accessiblePropertyIds && accessiblePropertyIds.length > 0) {
        orConditions.push({ propertyId: { in: accessiblePropertyIds } });
      }
      if (accessibleAreaIds && accessibleAreaIds.length > 0) {
        orConditions.push({ internalAreaId: { in: accessibleAreaIds } });
      }
      if (orConditions.length > 0) {
        where.OR = orConditions;
      } else {
        return [];
      }
    } else {
      if (filter.propertyId) {
        where.propertyId = filter.propertyId;
      }
      if (filter.internalAreaId) {
        where.internalAreaId = filter.internalAreaId;
      }
    }

    if (filter.search) {
      const term = filter.search.trim();
      where.AND = [
        {
          OR: [
            { code: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const reports = await this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
      },
    });

    return reports.map((r) => ({
      id: r.id,
      code: r.code,
      scope: r.scope,
      title: r.title,
      propertyName: r.property?.name || null,
      internalAreaName: r.internalArea?.name || null,
      periodStart: r.periodStart.toISOString().split('T')[0],
      periodEnd: r.periodEnd.toISOString().split('T')[0],
      cutoffDate: r.cutoffDate.toISOString().split('T')[0],
      status: r.status,
      version: r.version,
      createdByName: `${r.createdBy.firstName} ${r.createdBy.lastName}`,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Obtiene el detalle completo de un informe por su ID (RF-036).
   */
  async getReportById(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ReportResponseDto> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'El rol Administrador del sistema no tiene autorización para consultar informes operacionales (RF-049)',
      );
    }

    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { createdBy: true, approvedBy: true },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { reviewer: true },
        },
        distributions: {
          orderBy: { deliveryDate: 'desc' },
          include: { distributedBy: true },
        },
      },
    });

    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    await this.validateReportAccess(user, report);

    return this.mapToReportResponse(report);
  }

  /**
   * Modifica los campos redactados y opciones de un borrador de informe sin alterar los registros de origen (RF-033, CP-19).
   */
  async updateDraft(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateReportDraftDto,
  ): Promise<ReportResponseDto> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException('Administrador no tiene autorización operacional (RF-049)');
    }

    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    await this.validateReportAccess(user, report);

    // Solo se pueden editar textos en estado BORRADOR o DEVUELTO (RN-132)
    if (
      report.status !== ReportStatus.BORRADOR &&
      report.status !== ReportStatus.DEVUELTO
    ) {
      throw new BadRequestException(
        `No es posible modificar textos en un informe con estado ${report.status} (RN-132)`,
      );
    }

    // Solo el autor o el Director Operativo pueden editar el borrador
    const currentUserId = user.id || (user as any).userId;
    if (
      report.createdById !== currentUserId &&
      user.role !== Role.DIRECTOR_OPERATIVO
    ) {
      throw new ForbiddenException(
        'Solo el autor del borrador o el Director Operativo pueden editar este documento',
      );
    }

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title.trim() : undefined,
        introduction: dto.introduction !== undefined ? dto.introduction.trim() : undefined,
        observations: dto.observations !== undefined ? dto.observations.trim() : undefined,
        recommendations: dto.recommendations !== undefined ? dto.recommendations.trim() : undefined,
        finalComments: dto.finalComments !== undefined ? dto.finalComments.trim() : undefined,
        selectedAttachmentIds: dto.selectedAttachmentIds !== undefined ? dto.selectedAttachmentIds : undefined,
        showIntroduction: dto.showIntroduction !== undefined ? dto.showIntroduction : undefined,
        showKpis: dto.showKpis !== undefined ? dto.showKpis : undefined,
        showIssuesList: dto.showIssuesList !== undefined ? dto.showIssuesList : undefined,
        showActivities: dto.showActivities !== undefined ? dto.showActivities : undefined,
        showEvidences: dto.showEvidences !== undefined ? dto.showEvidences : undefined,
        showPendingIssues: dto.showPendingIssues !== undefined ? dto.showPendingIssues : undefined,
        showObservations: dto.showObservations !== undefined ? dto.showObservations : undefined,
        showRecommendations: dto.showRecommendations !== undefined ? dto.showRecommendations : undefined,
        showFinalComments: dto.showFinalComments !== undefined ? dto.showFinalComments : undefined,
      },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { createdBy: true, approvedBy: true },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { reviewer: true },
        },
        distributions: {
          orderBy: { deliveryDate: 'desc' },
          include: { distributedBy: true },
        },
      },
    });

    return this.mapToReportResponse(updated);
  }

  /**
   * Actualiza explícitamente los datos operativos fuente del borrador, preservando intactos los textos redactados (RF-035).
   */
  async refreshSourceData(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ReportResponseDto> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException('Administrador no tiene autorización operacional (RF-049)');
    }

    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    await this.validateReportAccess(user, report);

    if (
      report.status !== ReportStatus.BORRADOR &&
      report.status !== ReportStatus.DEVUELTO
    ) {
      throw new BadRequestException(
        `Solo se pueden actualizar datos fuente en estado BORRADOR o DEVUELTO`,
      );
    }

    const startStr = report.periodStart.toISOString().split('T')[0];
    const endStr = report.periodEnd.toISOString().split('T')[0];
    const cutStr = report.cutoffDate.toISOString().split('T')[0];

    // Re-ejecutar cálculo de datos operacionales
    const freshData = await this.aggregateOperationalData(
      user.organizationId,
      report.scope,
      report.propertyId,
      report.internalAreaId,
      report.periodStart,
      report.periodEnd,
      report.cutoffDate,
      startStr,
      endStr,
      cutStr,
    );

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        operationalData: freshData as any,
      },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { createdBy: true, approvedBy: true },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { reviewer: true },
        },
        distributions: {
          orderBy: { deliveryDate: 'desc' },
          include: { distributedBy: true },
        },
      },
    });

    return this.mapToReportResponse(updated);
  }

  /**
   * Genera el archivo PDF oficial del informe (RF-036, CP-33).
   */
  async generatePdf(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const reportDto = await this.getReportById(user, id);
    let templateOptions: any = undefined;
    try {
      const template = await this.getPublishedInstitutionalTemplate(user);
      const propConfig = reportDto.propertyId
        ? await this.getPropertyReportConfig(user, reportDto.propertyId)
        : null;
      templateOptions = {
        primaryColor: template?.primaryColor,
        secondaryColor: template?.secondaryColor,
        headerTitle: template?.headerTitle,
        headerSubtitle: propConfig?.customSubtitle || template?.headerSubtitle,
        footerText: template?.footerText,
        contactInfo: propConfig?.contactInfo || undefined,
      };
    } catch {
      // Usar defaults si falla la consulta opcional
    }

    const buffer = await this.pdfGenerator.generateReportPdf(reportDto, templateOptions);
    return {
      buffer,
      filename: `informe-${reportDto.code}.pdf`,
    };
  }


  /**
   * Exporta los datos operativos autorizados del informe a formato Excel (RF-043, RN-098).
   */
  async exportExcel(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const reportDto = await this.getReportById(user, id);
    const buffer = await this.excelGenerator.generateReportExcel(reportDto);
    return {
      buffer,
      filename: `informe-${reportDto.code}.xlsx`,
    };
  }

  /**
   * Elimina un borrador de informe (solo el autor o Director Operativo).
   */
  async deleteDraft(user: AuthenticatedUser, id: string): Promise<{ success: boolean; message: string }> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException('Administrador no tiene autorización operacional (RF-049)');
    }

    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    if (report.status !== ReportStatus.BORRADOR) {
      throw new BadRequestException('Solo se pueden eliminar informes en estado BORRADOR');
    }

    const currentUserId = user.id || (user as any).userId;
    if (
      report.createdById !== currentUserId &&
      user.role !== Role.DIRECTOR_OPERATIVO
    ) {
      throw new ForbiddenException(
        'Solo el autor del borrador o el Director Operativo pueden eliminar este informe',
      );
    }

    await this.prisma.report.delete({ where: { id } });
    return { success: true, message: `Informe ${report.code} eliminado correctamente` };
  }

  // =========================================================================
  // GOBERNANZA DE PLANTILLAS Y PERSONALIZACIÓN (RF-044, RF-045, RF-046, CP-29 a CP-31)
  // =========================================================================

  /**
   * Crea o actualiza una plantilla institucional con control de versiones (solo ADMINISTRADOR - RF-044, CP-29).
   */
  async createInstitutionalTemplate(
    user: AuthenticatedUser,
    dto: CreateInstitutionalTemplateDto,
  ): Promise<InstitutionalTemplateDto> {
    if (user.role !== Role.ADMINISTRADOR) {
      throw new ForbiddenException(
        'Solo el Administrador del sistema tiene permisos para crear y publicar plantillas institucionales (RF-044)',
      );
    }

    const coreMandatory = ['header', 'metadata', 'kpis', 'audit'];
    if (dto.mandatorySections) {
      const missing = coreMandatory.filter((s) => !dto.mandatorySections!.includes(s));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Las secciones obligatorias institucionales (${coreMandatory.join(', ')}) no pueden ser omitidas ni desactivadas (CP-31)`,
        );
      }
    }

    const currentUserId = user.id || (user as any).userId;

    // Calcular siguiente versión institucional
    const latest = await this.prisma.institutionalTemplate.findFirst({
      where: { organizationId: user.organizationId },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version || 0) + 1;

    const isPublished = dto.isPublished ?? true;
    if (isPublished) {
      await this.prisma.institutionalTemplate.updateMany({
        where: { organizationId: user.organizationId },
        data: { isPublished: false },
      });
    }

    const created = await this.prisma.institutionalTemplate.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name?.trim() || `Plantilla Institucional v${nextVersion}`,
        version: nextVersion,
        isPublished,
        headerTitle: dto.headerTitle?.trim() || 'EG S.A.S. — PLATAFORMA SIGPROH',
        headerSubtitle: dto.headerSubtitle?.trim() || 'GESTIÓN Y CONTROL DE NOVEDADES OPERATIVAS',
        primaryColor: dto.primaryColor || '#1B365D',
        secondaryColor: dto.secondaryColor || '#2D68C4',
        footerText: dto.footerText?.trim() || 'Documento oficial generado por la Plataforma SIGPROH — EG S.A.S.',
        mandatorySections: dto.mandatorySections || coreMandatory,
        allowedOptionalSections: dto.allowedOptionalSections || [
          'introduction',
          'issuesList',
          'activities',
          'evidences',
          'observations',
          'recommendations',
          'finalComments',
        ],
        createdById: currentUserId,
      },
    });

    return {
      id: created.id,
      organizationId: created.organizationId,
      name: created.name,
      version: created.version,
      isPublished: created.isPublished,
      headerTitle: created.headerTitle,
      headerSubtitle: created.headerSubtitle,
      primaryColor: created.primaryColor,
      secondaryColor: created.secondaryColor,
      footerText: created.footerText,
      mandatorySections: created.mandatorySections,
      allowedOptionalSections: created.allowedOptionalSections,
      createdById: created.createdById,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * Obtiene la plantilla institucional actualmente publicada o fallback por defecto (RF-046).
   */
  async getPublishedInstitutionalTemplate(
    user: AuthenticatedUser,
  ): Promise<InstitutionalTemplateDto> {
    const template = await this.prisma.institutionalTemplate.findFirst({
      where: {
        organizationId: user.organizationId,
        isPublished: true,
      },
      orderBy: { version: 'desc' },
    });

    if (template) {
      return {
        id: template.id,
        organizationId: template.organizationId,
        name: template.name,
        version: template.version,
        isPublished: template.isPublished,
        headerTitle: template.headerTitle,
        headerSubtitle: template.headerSubtitle,
        primaryColor: template.primaryColor,
        secondaryColor: template.secondaryColor,
        footerText: template.footerText,
        mandatorySections: template.mandatorySections,
        allowedOptionalSections: template.allowedOptionalSections,
        createdById: template.createdById,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      };
    }

    // Fallback por defecto (RF-046)
    return {
      id: 'default-institutional-template',
      organizationId: user.organizationId,
      name: 'Plantilla Institucional Estándar (Por Defecto)',
      version: 1,
      isPublished: true,
      headerTitle: 'EG S.A.S. — PLATAFORMA SIGPROH',
      headerSubtitle: 'GESTIÓN Y CONTROL DE NOVEDADES OPERATIVAS',
      primaryColor: '#1B365D',
      secondaryColor: '#2D68C4',
      footerText: 'Documento oficial generado por la Plataforma SIGPROH — EG S.A.S.',
      mandatorySections: ['header', 'metadata', 'kpis', 'audit'],
      allowedOptionalSections: [
        'introduction',
        'issuesList',
        'activities',
        'evidences',
        'observations',
        'recommendations',
        'finalComments',
      ],
      createdById: user.id || (user as any).userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Configura personalización de informes por copropiedad (solo DIRECTOR_OPERATIVO - RF-045, CP-30, CP-31).
   */
  async updatePropertyReportConfig(
    user: AuthenticatedUser,
    propertyId: string,
    dto: UpdatePropertyReportConfigDto,
  ): Promise<PropertyReportConfigDto> {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Solo el Director Operativo tiene permisos para personalizar la configuración de informes por copropiedad (RF-045)',
      );
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException(`Copropiedad con id ${propertyId} no encontrada`);
    }

    const coreMandatory = ['header', 'metadata', 'kpis', 'audit'];
    if (dto.optionalSectionsOrder) {
      const containsMandatory = dto.optionalSectionsOrder.some((s) => coreMandatory.includes(s));
      if (containsMandatory) {
        throw new BadRequestException(
          'Las secciones obligatorias institucionales (header, metadata, kpis, audit) no pueden ser modificadas ni reordenadas a nivel copropiedad (CP-31)',
        );
      }
    }

    const currentUserId = user.id || (user as any).userId;
    const existing = await this.prisma.propertyReportConfig.findUnique({
      where: { propertyId },
    });

    let config: any;
    if (existing) {
      config = await this.prisma.propertyReportConfig.update({
        where: { propertyId },
        data: {
          logoUrl: dto.logoUrl !== undefined ? dto.logoUrl : existing.logoUrl,
          customSubtitle: dto.customSubtitle !== undefined ? dto.customSubtitle : existing.customSubtitle,
          contactInfo: dto.contactInfo !== undefined ? dto.contactInfo : existing.contactInfo,
          address: dto.address !== undefined ? dto.address : existing.address,
          optionalSectionsOrder: dto.optionalSectionsOrder !== undefined ? dto.optionalSectionsOrder : existing.optionalSectionsOrder,
          version: existing.version + 1,
          isPublished: dto.isPublished ?? existing.isPublished,
          updatedById: currentUserId,
        },
      });
    } else {
      config = await this.prisma.propertyReportConfig.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          logoUrl: dto.logoUrl || null,
          customSubtitle: dto.customSubtitle || null,
          contactInfo: dto.contactInfo || null,
          address: dto.address || null,
          optionalSectionsOrder: dto.optionalSectionsOrder || [],
          version: 1,
          isPublished: dto.isPublished ?? true,
          updatedById: currentUserId,
        },
      });
    }

    return {
      id: config.id,
      organizationId: config.organizationId,
      propertyId: config.propertyId,
      propertyName: property.name,
      logoUrl: config.logoUrl,
      customSubtitle: config.customSubtitle,
      contactInfo: config.contactInfo,
      address: config.address,
      optionalSectionsOrder: config.optionalSectionsOrder,
      version: config.version,
      isPublished: config.isPublished,
      updatedById: config.updatedById,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  /**
   * Obtiene la configuración de informe para una copropiedad específica con fallback institucional (RF-046).
   */
  async getPropertyReportConfig(
    user: AuthenticatedUser,
    propertyId: string,
  ): Promise<PropertyReportConfigDto> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException(`Copropiedad con id ${propertyId} no encontrada`);
    }

    const config = await this.prisma.propertyReportConfig.findUnique({
      where: { propertyId },
    });

    if (config) {
      return {
        id: config.id,
        organizationId: config.organizationId,
        propertyId: config.propertyId,
        propertyName: property.name,
        logoUrl: config.logoUrl,
        customSubtitle: config.customSubtitle,
        contactInfo: config.contactInfo,
        address: config.address,
        optionalSectionsOrder: config.optionalSectionsOrder,
        version: config.version,
        isPublished: config.isPublished,
        updatedById: config.updatedById,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      };
    }

    // Fallback a configuración estándar para la propiedad
    return {
      id: `default-config-${propertyId}`,
      organizationId: user.organizationId,
      propertyId,
      propertyName: property.name,
      logoUrl: null,
      customSubtitle: null,
      contactInfo: null,
      address: property.address || null,
      optionalSectionsOrder: [],
      version: 1,
      isPublished: true,
      updatedById: user.id || (user as any).userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // =========================================================================
  // FLUJO DE REVISIÓN, APROBACIÓN Y VERSIONES (RF-037 a RF-041, CP-21 a CP-26)
  // =========================================================================

  /**
   * Congela el borrador y lo envía al flujo de revisión formal (RF-037, CP-21).
   */
  async sendToReview(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ReportResponseDto> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException('El Administrador no participa en el flujo de revisión de informes (RF-049)');
    }

    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    await this.validateReportAccess(user, report);

    if (
      report.status !== ReportStatus.BORRADOR &&
      report.status !== ReportStatus.DEVUELTO
    ) {
      throw new BadRequestException(
        `Solo se pueden enviar a revisión informes en estado BORRADOR o DEVUELTO (estado actual: ${report.status}) (RF-037)`,
      );
    }

    // Congelar versiones activas de plantilla y personalización
    const template = await this.getPublishedInstitutionalTemplate(user);
    const propConfig = report.propertyId
      ? await this.getPropertyReportConfig(user, report.propertyId)
      : null;

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: ReportStatus.EN_REVISION,
        templateVersion: template.version,
        propertyConfigVersion: propConfig?.version || null,
      },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { createdBy: true, approvedBy: true },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { reviewer: true },
        },
        distributions: {
          orderBy: { deliveryDate: 'desc' },
          include: { distributedBy: true },
        },
      },
    });

    return this.mapToReportResponse(updated);
  }

  /**
   * Revisa formalmente un informe: APROBAR o DEVOLVER con observaciones (solo DIRECTOR_OPERATIVO - RF-038, RF-039, RN-130, RN-145, CP-22 a CP-24).
   */
  async reviewReport(
    user: AuthenticatedUser,
    id: string,
    dto: ReviewReportDto,
  ): Promise<ReportResponseDto> {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Solo el Director Operativo tiene atribución para aprobar o devolver informes (RF-038, RN-130)',
      );
    }

    const report = await this.prisma.report.findUnique({
      where: { id },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    if (report.status !== ReportStatus.EN_REVISION) {
      throw new BadRequestException(
        `Solo se pueden revisar informes en estado EN_REVISION (estado actual: ${report.status}) (RF-038)`,
      );
    }

    const currentUserId = user.id || (user as any).userId;

    if (dto.decision === 'DEVUELTO') {
      if (!dto.notes || !dto.notes.trim()) {
        throw new BadRequestException(
          'Las observaciones explicativas son obligatorias cuando el informe es devuelto (RN-130, RN-145, CP-23)',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.reportReview.create({
          data: {
            reportId: report.id,
            reportVersion: report.version,
            reviewerId: currentUserId,
            decision: ReportStatus.DEVUELTO,
            notes: dto.notes.trim(),
          },
        });

        await tx.report.update({
          where: { id: report.id },
          data: {
            status: ReportStatus.DEVUELTO,
            approvalNotes: dto.notes.trim(),
          },
        });
      });
    } else {
      // Decisión: APROBADO (CP-24)
      const approverUser = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { firstName: true, lastName: true },
      });
      const approverName = approverUser
        ? `${approverUser.firstName} ${approverUser.lastName}`.trim()
        : user.email;

      const reportResponse = this.mapToReportResponse(report);
      reportResponse.status = ReportStatus.APROBADO;
      reportResponse.approvedByName = approverName;
      reportResponse.approvedAt = new Date().toISOString();

      let templateOptions: any = undefined;
      try {
        const template = await this.getPublishedInstitutionalTemplate(user);
        const propConfig = report.propertyId
          ? await this.getPropertyReportConfig(user, report.propertyId)
          : null;
        templateOptions = {
          primaryColor: template?.primaryColor,
          secondaryColor: template?.secondaryColor,
          headerTitle: template?.headerTitle,
          headerSubtitle: propConfig?.customSubtitle || template?.headerSubtitle,
          footerText: template?.footerText,
          contactInfo: propConfig?.contactInfo || undefined,
        };
      } catch {
        // fallback
      }

      const pdfBuffer = await this.pdfGenerator.generateReportPdf(reportResponse, templateOptions);
      const sha256Hex = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
      const storageKey = `reports/${report.id}/v${report.version}.pdf`;

      await this.prisma.$transaction(async (tx) => {
        await tx.reportReview.create({
          data: {
            reportId: report.id,
            reportVersion: report.version,
            reviewerId: currentUserId,
            decision: ReportStatus.APROBADO,
            notes: dto.notes?.trim() || 'Aprobado formalmente por la Dirección Operativa',
          },
        });

        await tx.reportVersion.create({
          data: {
            reportId: report.id,
            versionNumber: report.version,
            status: ReportStatus.APROBADO,
            title: report.title,
            snapshotData: (report.operationalData as any) || {},
            pdfStorageKey: storageKey,
            pdfSha256: sha256Hex,
            approvedById: currentUserId,
            approvedAt: new Date(),
            approvalNotes: dto.notes?.trim() || null,
            createdById: report.createdById,
          },
        });

        await tx.report.update({
          where: { id: report.id },
          data: {
            status: ReportStatus.APROBADO,
            approvedById: currentUserId,
            approvedAt: new Date(),
            approvalNotes: dto.notes?.trim() || null,
            pdfSha256: sha256Hex,
            pdfStorageKey: storageKey,
          },
        });
      });
    }

    return this.getReportById(user, id);
  }

  /**
   * Genera una nueva versión borrador a partir de un informe aprobado (RF-040, RF-041, CP-25, CP-26).
   */
  async createNewVersion(
    user: AuthenticatedUser,
    id: string,
    dto?: CreateNewVersionDto,
  ): Promise<ReportResponseDto> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException('Administrador no tiene autorización operacional (RF-049)');
    }

    const report = await this.prisma.report.findUnique({
      where: { id },
    });

    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    await this.validateReportAccess(user, report);

    if (report.status !== ReportStatus.APROBADO) {
      throw new BadRequestException(
        `Solo se pueden crear nuevas versiones a partir de un informe APROBADO (estado actual: ${report.status}) (RF-040)`,
      );
    }

    const nextVersionNumber = report.version + 1;

    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        version: nextVersionNumber,
        status: ReportStatus.BORRADOR,
        approvedById: null,
        approvedAt: null,
        approvalNotes: dto?.reason?.trim() ? `Nueva versión v${nextVersionNumber}: ${dto.reason.trim()}` : null,
        pdfSha256: null,
        pdfStorageKey: null,
      },
      include: {
        property: true,
        internalArea: true,
        createdBy: true,
        approvedBy: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { createdBy: true, approvedBy: true },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { reviewer: true },
        },
        distributions: {
          orderBy: { deliveryDate: 'desc' },
          include: { distributedBy: true },
        },
      },
    });

    return this.mapToReportResponse(updated);
  }

  /**
   * Obtiene el historial inmutable de versiones de un informe (RF-041).
   */
  async getVersionHistory(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ReportVersionDto[]> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException('Administrador no tiene autorización operacional (RF-049)');
    }

    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    await this.validateReportAccess(user, report);

    const versions = await this.prisma.reportVersion.findMany({
      where: { reportId: id },
      orderBy: { versionNumber: 'desc' },
      include: { createdBy: true, approvedBy: true },
    });

    return versions.map((v) => ({
      id: v.id,
      reportId: v.reportId,
      versionNumber: v.versionNumber,
      status: v.status,
      title: v.title,
      snapshotData: v.snapshotData,
      pdfStorageKey: v.pdfStorageKey,
      pdfSha256: v.pdfSha256,
      approvedById: v.approvedById,
      approvedByName: v.approvedBy ? `${v.approvedBy.firstName} ${v.approvedBy.lastName}` : null,
      approvedAt: v.approvedAt ? v.approvedAt.toISOString() : null,
      approvalNotes: v.approvalNotes,
      createdById: v.createdById,
      createdByName: v.createdBy ? `${v.createdBy.firstName} ${v.createdBy.lastName}` : null,
      createdAt: v.createdAt.toISOString(),
    }));
  }

  // =========================================================================
  // DISTRIBUCIÓN OFICIAL EXTERNA (RF-042, RN-153, RN-162, RN-163, CP-27, CP-28)
  // =========================================================================

  /**
   * Registra una distribución oficial del informe (solo DIRECTOR_OPERATIVO - RF-042, CP-27, CP-28).
   */
  async distributeReport(
    user: AuthenticatedUser,
    id: string,
    dto: CreateDistributionDto,
  ): Promise<ReportDistributionDto> {
    if (user.role !== Role.DIRECTOR_OPERATIVO) {
      throw new ForbiddenException(
        'Solo el Director Operativo tiene atribución para registrar distribuciones oficiales de informes (RF-042)',
      );
    }

    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    if (report.status !== ReportStatus.APROBADO) {
      throw new BadRequestException(
        'Solo se pueden registrar distribuciones oficiales de informes en estado APROBADO (CP-28)',
      );
    }

    const currentUserId = user.id || (user as any).userId;

    const distribution = await this.prisma.reportDistribution.create({
      data: {
        reportId: report.id,
        reportVersion: report.version,
        recipient: dto.recipient.trim(),
        channel: dto.channel.trim(),
        deliveryDate: new Date(dto.deliveryDate),
        notes: dto.notes?.trim() || null,
        distributedById: currentUserId,
      },
      include: {
        distributedBy: true,
      },
    });

    return {
      id: distribution.id,
      reportId: distribution.reportId,
      reportVersion: distribution.reportVersion,
      recipient: distribution.recipient,
      channel: distribution.channel,
      deliveryDate: distribution.deliveryDate.toISOString(),
      distributedById: distribution.distributedById,
      distributedByName: `${distribution.distributedBy.firstName} ${distribution.distributedBy.lastName}`,
      notes: distribution.notes,
      createdAt: distribution.createdAt.toISOString(),
    };
  }

  /**
   * Obtiene la bitácora de distribuciones oficiales del informe (RF-042).
   */
  async getDistributions(
    user: AuthenticatedUser,
    id: string,
  ): Promise<ReportDistributionDto[]> {
    if (user.role === Role.ADMINISTRADOR) {
      throw new ForbiddenException('Administrador no tiene autorización operacional (RF-049)');
    }

    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report || report.organizationId !== user.organizationId) {
      throw new NotFoundException(`Informe con id ${id} no encontrado`);
    }

    await this.validateReportAccess(user, report);

    const distributions = await this.prisma.reportDistribution.findMany({
      where: { reportId: id },
      orderBy: { deliveryDate: 'desc' },
      include: { distributedBy: true },
    });

    return distributions.map((d) => ({
      id: d.id,
      reportId: d.reportId,
      reportVersion: d.reportVersion,
      recipient: d.recipient,
      channel: d.channel,
      deliveryDate: d.deliveryDate.toISOString(),
      distributedById: d.distributedById,
      distributedByName: `${d.distributedBy.firstName} ${d.distributedBy.lastName}`,
      notes: d.notes,
      createdAt: d.createdAt.toISOString(),
    }));
  }


  /**
   * Valida permisos del usuario para ver o gestionar el informe específico.
   */
  private async validateReportAccess(user: AuthenticatedUser, report: any): Promise<void> {
    if (user.role === Role.COORDINADOR_OPERATIVO) {
      if (report.scope === ReportScope.CONSOLIDADO) {
        throw new ForbiddenException(
          'Acceso denegado: el rol Coordinador Operativo no puede consultar informes consolidados (RN-122)',
        );
      }
      if (report.propertyId) {
        const accessiblePropIds = await this.scopeAuth.getAccessiblePropertyIds(user);
        if (accessiblePropIds !== null && !accessiblePropIds.includes(report.propertyId)) {
          throw new ForbiddenException(
            'Acceso denegado: no tiene asignación operativa activa en la propiedad de este informe',
          );
        }
      }
      if (report.internalAreaId) {
        const accessibleAreaIds = await this.scopeAuth.getAccessibleInternalAreaIds(user);
        if (accessibleAreaIds !== null && !accessibleAreaIds.includes(report.internalAreaId)) {
          throw new ForbiddenException(
            'Acceso denegado: no tiene asignación operativa activa en el área interna de este informe',
          );
        }
      }
    }
  }

  /**
   * Normaliza fechas YYYY-MM-DD a límites de día UTC (00:00:00 y 23:59:59.999).
   */
  private parseDateBoundaries(
    startDateStr: string,
    endDateStr: string,
    cutoffDateStr?: string,
  ): { startUtc: Date; endUtc: Date; cutoffUtc: Date } {
    const startPart = startDateStr.split('T')[0];
    const endPart = endDateStr.split('T')[0];
    const cutoffPart = cutoffDateStr ? cutoffDateStr.split('T')[0] : endPart;

    return {
      startUtc: new Date(`${startPart}T00:00:00.000Z`),
      endUtc: new Date(`${endPart}T23:59:59.999Z`),
      cutoffUtc: new Date(`${cutoffPart}T23:59:59.999Z`),
    };
  }

  /**
   * Recopila de la base de datos todos los indicadores, novedades, actividades y evidencias (RF-032, CP-34).
   */
  private async aggregateOperationalData(
    organizationId: string,
    scope: ReportScope,
    propertyId: string | null | undefined,
    internalAreaId: string | null | undefined,
    startUtc: Date,
    endUtc: Date,
    cutoffUtc: Date,
    startDateStr: string,
    endDateStr: string,
    cutoffDateStr: string,
  ): Promise<ReportOperationalData> {
    // Construir filtro de ubicación común
    const locationCondition: any = {};
    if (scope === ReportScope.PROPIEDAD && propertyId) {
      locationCondition.scope = IssueScope.PROPIEDAD;
      locationCondition.propertyId = propertyId;
    } else if (scope === ReportScope.INTERNA && internalAreaId) {
      locationCondition.scope = IssueScope.INTERNA;
      locationCondition.internalAreaId = internalAreaId;
    }

    // 1. Novedades registradas en el periodo
    const registeredInPeriod = await this.prisma.issue.findMany({
      where: {
        organizationId,
        ...locationCondition,
        createdAt: { gte: startUtc, lte: endUtc },
      },
      include: {
        property: true,
        propertyZone: true,
        internalArea: true,
        category: true,
        createdBy: true,
        assignedUser: true,
        activities: {
          include: { assignedUser: true },
        },
        attachments: {
          include: { uploadedBy: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Novedades cerradas en el periodo (pueden haberse registrado en meses anteriores)
    const closedInPeriod = await this.prisma.issue.findMany({
      where: {
        organizationId,
        ...locationCondition,
        status: IssueStatus.CERRADA,
        closedAt: { gte: startUtc, lte: endUtc },
      },
      include: {
        property: true,
        propertyZone: true,
        internalArea: true,
        category: true,
        createdBy: true,
        assignedUser: true,
        activities: {
          include: { assignedUser: true },
        },
        attachments: {
          include: { uploadedBy: true },
        },
      },
    });

    // 3. Novedades abiertas a la fecha de corte (CP-34: creadas antes/al corte y no cerradas al corte)
    const openAtCutoff = await this.prisma.issue.findMany({
      where: {
        organizationId,
        ...locationCondition,
        createdAt: { lte: cutoffUtc },
        status: { not: IssueStatus.DESCARTADA },
        OR: [
          { status: { not: IssueStatus.CERRADA } },
          { closedAt: { gt: cutoffUtc } },
        ],
      },
      include: {
        property: true,
        propertyZone: true,
        internalArea: true,
        category: true,
        createdBy: true,
        assignedUser: true,
        activities: {
          include: { assignedUser: true },
        },
        attachments: {
          include: { uploadedBy: true },
        },
      },
    });

    // 4. Novedades descartadas en el periodo
    const discardedInPeriodCount = await this.prisma.issue.count({
      where: {
        organizationId,
        ...locationCondition,
        status: IssueStatus.DESCARTADA,
        createdAt: { gte: startUtc, lte: endUtc },
      },
    });

    // Unir conjunto de novedades únicas para el reporte (sin duplicados - RN-101)
    const issuesMap = new Map<string, any>();
    for (const item of [...registeredInPeriod, ...closedInPeriod, ...openAtCutoff]) {
      issuesMap.set(item.id, item);
    }
    const allReportIssues = Array.from(issuesMap.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    // Calcular KPIs
    const totalRegisteredInPeriod = registeredInPeriod.length;
    const totalClosedInPeriod = closedInPeriod.length;
    const totalOpenAtCutoff = openAtCutoff.length;
    const totalCriticalInPeriod = registeredInPeriod.filter(
      (i) => i.priority === IssuePriority.CRITICA,
    ).length;

    // Tiempo promedio de resolución (Horas y Días)
    let totalResolutionMs = 0;
    let resolvedCount = 0;
    for (const issue of closedInPeriod) {
      if (issue.closedAt && issue.createdAt) {
        const diff = issue.closedAt.getTime() - issue.createdAt.getTime();
        if (diff >= 0) {
          totalResolutionMs += diff;
          resolvedCount++;
        }
      }
    }
    const averageResolutionHours =
      resolvedCount > 0
        ? Math.round((totalResolutionMs / (resolvedCount * 3600000)) * 10) / 10
        : 0;
    const averageResolutionDays =
      resolvedCount > 0
        ? Math.round((averageResolutionHours / 24) * 10) / 10
        : 0;

    // Calcular métricas de actividades
    const allActivitiesMap = new Map<string, any>();
    for (const issue of allReportIssues) {
      for (const act of issue.activities || []) {
        allActivitiesMap.set(act.id, { ...act, issueCode: issue.code, issueTitle: issue.title });
      }
    }
    const allActivities = Array.from(allActivitiesMap.values());

    const totalActivities = allActivities.length;
    const completedActs = allActivities.filter((a) => a.status === ActivityStatus.COMPLETADA).length;
    const inProgressActs = allActivities.filter((a) => a.status === ActivityStatus.EN_CURSO).length;
    const pendingActs = allActivities.filter((a) => a.status === ActivityStatus.PENDIENTE).length;
    const blockedActs = allActivities.filter((a) => a.status === ActivityStatus.BLOQUEADA).length;
    const canceledActs = allActivities.filter((a) => a.status === ActivityStatus.CANCELADA).length;
    const completionRatePercent =
      totalActivities > 0
        ? Math.round((completedActs / totalActivities) * 100)
        : 0;

    // Calcular distribución por Estado
    const statusCounts: Record<string, number> = {};
    for (const st of Object.values(IssueStatus)) {
      statusCounts[st] = 0;
    }
    for (const issue of allReportIssues) {
      statusCounts[issue.status] = (statusCounts[issue.status] || 0) + 1;
    }
    const byStatus = Object.entries(statusCounts)
      .map(([status, count]) => ({
        status,
        count,
        percentage:
          allReportIssues.length > 0
            ? Math.round((count / allReportIssues.length) * 100)
            : 0,
      }))
      .filter((s) => s.count > 0);

    // Calcular distribución por Prioridad
    const priorityCounts: Record<string, number> = {};
    for (const p of Object.values(IssuePriority)) {
      priorityCounts[p] = 0;
    }
    for (const issue of registeredInPeriod) {
      priorityCounts[issue.priority] = (priorityCounts[issue.priority] || 0) + 1;
    }
    const byPriority = Object.entries(priorityCounts)
      .map(([priority, count]) => ({
        priority,
        count,
        percentage:
          totalRegisteredInPeriod > 0
            ? Math.round((count / totalRegisteredInPeriod) * 100)
            : 0,
      }))
      .filter((p) => p.count > 0);

    // Calcular distribución por Categoría
    const catMap = new Map<string, { name: string; scope: string; count: number }>();
    for (const issue of registeredInPeriod) {
      const catId = issue.categoryId;
      const current = catMap.get(catId) || {
        name: issue.category.name,
        scope: issue.category.scope,
        count: 0,
      };
      current.count++;
      catMap.set(catId, current);
    }
    const byCategory = Array.from(catMap.entries()).map(([categoryId, data]) => ({
      categoryId,
      categoryName: data.name,
      scope: data.scope,
      count: data.count,
      percentage:
        totalRegisteredInPeriod > 0
          ? Math.round((data.count / totalRegisteredInPeriod) * 100)
          : 0,
    }));

    // Listado de Novedades estructuradas
    const issuesList = allReportIssues.map((issue) => {
      let locationName = '';
      if (issue.scope === IssueScope.PROPIEDAD) {
        locationName = issue.property?.name || 'Propiedad';
        if (issue.propertyZone) {
          locationName += ` - ${issue.propertyZone.name}`;
        }
      } else {
        locationName = issue.internalArea?.name || 'Área Interna';
      }

      return {
        id: issue.id,
        code: issue.code,
        title: issue.title,
        description: issue.description,
        scope: issue.scope,
        priority: issue.priority,
        status: issue.status,
        categoryName: issue.category?.name || 'General',
        locationName,
        createdByName: `${issue.createdBy.firstName} ${issue.createdBy.lastName}`,
        assignedUserName: issue.assignedUser
          ? `${issue.assignedUser.firstName} ${issue.assignedUser.lastName}`
          : null,
        createdAt: issue.createdAt.toISOString(),
        closedAt: issue.closedAt ? issue.closedAt.toISOString() : null,
        activitiesCount: issue.activities?.length || 0,
        evidencesCount: issue.attachments?.length || 0,
      };
    });

    // Listado de Actividades estructuradas
    const activitiesList = allActivities.map((act) => ({
      id: act.id,
      issueId: act.issueId,
      issueCode: act.issueCode,
      issueTitle: act.issueTitle,
      title: act.title,
      description: act.description,
      status: act.status,
      statusReason: act.statusReason || null,
      assignedUserName: act.assignedUser
        ? `${act.assignedUser.firstName} ${act.assignedUser.lastName}`
        : null,
      dueDate: act.dueDate ? act.dueDate.toISOString() : null,
      completedAt: act.completedAt ? act.completedAt.toISOString() : null,
      createdAt: act.createdAt.toISOString(),
    }));

    // Listado de Evidencias disponibles para selección (RF-034)
    const availableEvidences: any[] = [];
    for (const issue of allReportIssues) {
      for (const att of issue.attachments || []) {
        availableEvidences.push({
          id: att.id,
          issueId: issue.id,
          issueCode: issue.code,
          stage: att.stage,
          fileName: att.fileName,
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          storageKey: att.storageKey,
          createdAt: att.createdAt.toISOString(),
          uploadedByName: att.uploadedBy
            ? `${att.uploadedBy.firstName} ${att.uploadedBy.lastName}`
            : 'Sistema',
        });
      }
    }

    return {
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
        cutoffDate: cutoffDateStr,
        timezone: 'America/Bogota (UTC-5)',
      },
      kpis: {
        totalRegisteredInPeriod,
        totalClosedInPeriod,
        totalOpenAtCutoff,
        totalDiscardedInPeriod: discardedInPeriodCount,
        totalCriticalInPeriod,
        averageResolutionHours,
        averageResolutionDays,
      },
      activities: {
        totalActivities,
        completed: completedActs,
        inProgress: inProgressActs,
        pending: pendingActs,
        blocked: blockedActs,
        canceled: canceledActs,
        completionRatePercent,
      },
      byStatus,
      byPriority,
      byCategory,
      issuesList,
      activitiesList,
      availableEvidences,
    };
  }

  /**
   * Mapea una entidad Report de Prisma al DTO de respuesta estructurado.
   */
  private mapToReportResponse(report: any): ReportResponseDto {
    return {
      id: report.id,
      code: report.code,
      scope: report.scope,
      title: report.title,
      propertyId: report.propertyId,
      propertyName: report.property?.name || null,
      propertyCode: report.property?.code || null,
      internalAreaId: report.internalAreaId,
      internalAreaName: report.internalArea?.name || null,
      internalAreaCode: report.internalArea?.code || null,
      periodStart: report.periodStart ? (typeof report.periodStart.toISOString === 'function' ? report.periodStart.toISOString().split('T')[0] : String(report.periodStart).split('T')[0]) : '',
      periodEnd: report.periodEnd ? (typeof report.periodEnd.toISOString === 'function' ? report.periodEnd.toISOString().split('T')[0] : String(report.periodEnd).split('T')[0]) : '',
      cutoffDate: report.cutoffDate ? (typeof report.cutoffDate.toISOString === 'function' ? report.cutoffDate.toISOString().split('T')[0] : String(report.cutoffDate).split('T')[0]) : '',
      status: report.status,
      version: report.version,
      introduction: report.introduction,
      observations: report.observations,
      recommendations: report.recommendations,
      finalComments: report.finalComments,
      selectedAttachmentIds: report.selectedAttachmentIds || [],
      showIntroduction: report.showIntroduction,
      showKpis: report.showKpis,
      showIssuesList: report.showIssuesList,
      showActivities: report.showActivities,
      showEvidences: report.showEvidences,
      showPendingIssues: report.showPendingIssues,
      showObservations: report.showObservations,
      showRecommendations: report.showRecommendations,
      showFinalComments: report.showFinalComments,
      operationalData: report.operationalData as ReportOperationalData | null,
      createdById: report.createdById,
      createdByName: report.createdBy
        ? `${report.createdBy.firstName} ${report.createdBy.lastName}`
        : 'Usuario',
      approvedById: report.approvedById,
      approvedByName: report.approvedBy
        ? `${report.approvedBy.firstName} ${report.approvedBy.lastName}`
        : null,
      approvedAt: report.approvedAt ? (typeof report.approvedAt.toISOString === 'function' ? report.approvedAt.toISOString() : String(report.approvedAt)) : null,
      approvalNotes: report.approvalNotes,
      templateVersion: report.templateVersion ?? 1,
      propertyConfigVersion: report.propertyConfigVersion ?? null,
      pdfStorageKey: report.pdfStorageKey ?? null,
      pdfSha256: report.pdfSha256 ?? null,
      versions: report.versions?.map((v: any) => ({
        id: v.id,
        reportId: v.reportId,
        versionNumber: v.versionNumber,
        status: v.status,
        title: v.title,
        snapshotData: v.snapshotData,
        pdfStorageKey: v.pdfStorageKey,
        pdfSha256: v.pdfSha256,
        approvedById: v.approvedById,
        approvedByName: v.approvedBy ? `${v.approvedBy.firstName} ${v.approvedBy.lastName}` : null,
        approvedAt: v.approvedAt ? (typeof v.approvedAt.toISOString === 'function' ? v.approvedAt.toISOString() : String(v.approvedAt)) : null,
        approvalNotes: v.approvalNotes,
        createdById: v.createdById,
        createdByName: v.createdBy ? `${v.createdBy.firstName} ${v.createdBy.lastName}` : null,
        createdAt: v.createdAt ? (typeof v.createdAt.toISOString === 'function' ? v.createdAt.toISOString() : String(v.createdAt)) : new Date().toISOString(),
      })),
      reviews: report.reviews?.map((r: any) => ({
        id: r.id,
        reportId: r.reportId,
        reportVersion: r.reportVersion,
        reviewerId: r.reviewerId,
        reviewerName: r.reviewer ? `${r.reviewer.firstName} ${r.reviewer.lastName}` : null,
        decision: r.decision,
        notes: r.notes,
        createdAt: r.createdAt ? (typeof r.createdAt.toISOString === 'function' ? r.createdAt.toISOString() : String(r.createdAt)) : new Date().toISOString(),
      })),
      distributions: report.distributions?.map((d: any) => ({
        id: d.id,
        reportId: d.reportId,
        reportVersion: d.reportVersion,
        recipient: d.recipient,
        channel: d.channel,
        deliveryDate: d.deliveryDate ? (typeof d.deliveryDate.toISOString === 'function' ? d.deliveryDate.toISOString() : String(d.deliveryDate)) : '',
        distributedById: d.distributedById,
        distributedByName: d.distributedBy ? `${d.distributedBy.firstName} ${d.distributedBy.lastName}` : null,
        notes: d.notes,
        createdAt: d.createdAt ? (typeof d.createdAt.toISOString === 'function' ? d.createdAt.toISOString() : String(d.createdAt)) : new Date().toISOString(),
      })),
      createdAt: report.createdAt ? (typeof report.createdAt.toISOString === 'function' ? report.createdAt.toISOString() : String(report.createdAt)) : new Date().toISOString(),
      updatedAt: report.updatedAt ? (typeof report.updatedAt.toISOString === 'function' ? report.updatedAt.toISOString() : String(report.updatedAt)) : new Date().toISOString(),
    };
  }
}
