import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { ReportsService } from '../application/reports.service';
import { CreateReportDraftDto } from './dto/create-report-draft.dto';
import { UpdateReportDraftDto } from './dto/update-report-draft.dto';
import { ReportFilterDto } from './dto/report-filter.dto';
import {
  InstitutionalTemplateDto,
  PropertyReportConfigDto,
  ReportDistributionDto,
  ReportListItemDto,
  ReportResponseDto,
  ReportVersionDto,
} from './dto/report-response.dto';
import { CreateInstitutionalTemplateDto } from './dto/create-institutional-template.dto';
import { UpdatePropertyReportConfigDto } from './dto/update-property-report-config.dto';
import { ReviewReportDto } from './dto/review-report.dto';
import { CreateNewVersionDto } from './dto/create-new-version.dto';
import { CreateDistributionDto } from './dto/create-distribution.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // =========================================================================
  // GOBERNANZA DE PLANTILLAS INSTITUCIONALES (RF-044, RF-046, CP-29, CP-31)
  // =========================================================================

  @Post('templates/institutional')
  @Roles(Role.ADMINISTRADOR)
  async createInstitutionalTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInstitutionalTemplateDto,
  ): Promise<InstitutionalTemplateDto> {
    return this.reportsService.createInstitutionalTemplate(user, dto);
  }

  @Get('templates/institutional/published')
  async getPublishedInstitutionalTemplate(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InstitutionalTemplateDto> {
    return this.reportsService.getPublishedInstitutionalTemplate(user);
  }

  // =========================================================================
  // PERSONALIZACIÓN POR COPROPIEDAD (RF-045, RF-046, CP-30, CP-31)
  // =========================================================================

  @Put('properties/:propertyId/config')
  @Roles(Role.DIRECTOR_OPERATIVO)
  async updatePropertyReportConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyReportConfigDto,
  ): Promise<PropertyReportConfigDto> {
    return this.reportsService.updatePropertyReportConfig(user, propertyId, dto);
  }

  @Get('properties/:propertyId/config')
  async getPropertyReportConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId') propertyId: string,
  ): Promise<PropertyReportConfigDto> {
    return this.reportsService.getPropertyReportConfig(user, propertyId);
  }

  // =========================================================================
  // GESTIÓN DE INFORMES Y CICLO DE VIDA (RF-031 a RF-043)
  // =========================================================================

  @Post('draft')
  async createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDraftDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.createDraft(user, dto);
  }

  @Get()
  async getReports(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: ReportFilterDto,
  ): Promise<ReportListItemDto[]> {
    return this.reportsService.getReports(user, filter);
  }

  @Get(':id')
  async getReportById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReportResponseDto> {
    return this.reportsService.getReportById(user, id);
  }

  @Put(':id')
  async updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateReportDraftDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.updateDraft(user, id, dto);
  }

  @Post(':id/refresh')
  @HttpCode(200)
  async refreshSourceData(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReportResponseDto> {
    return this.reportsService.refreshSourceData(user, id);
  }

  // =========================================================================
  // FINALIZACIÓN Y REVISIÓN (RF-037 a RF-039, CP-21 a CP-24)
  // =========================================================================

  @Post(':id/finalize')
  @HttpCode(200)
  async finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReportResponseDto> {
    return this.reportsService.finalize(user, id);
  }

  @Post(':id/review')
  @HttpCode(200)
  @Roles(Role.DIRECTOR_OPERATIVO)
  async reviewReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewReportDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.reviewReport(user, id, dto);
  }

  // =========================================================================
  // CONTROL DE VERSIONES HISTÓRICAS (RF-040, RF-041, CP-25, CP-26)
  // =========================================================================

  @Post(':id/new-version')
  @HttpCode(200)
  async createNewVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateNewVersionDto,
  ): Promise<ReportResponseDto> {
    return this.reportsService.createNewVersion(user, id, dto);
  }

  @Get(':id/versions')
  async getVersionHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReportVersionDto[]> {
    return this.reportsService.getVersionHistory(user, id);
  }

  // =========================================================================
  // REGISTRO DE DISTRIBUCIÓN OFICIAL (RF-042, CP-27, CP-28)
  // =========================================================================

  @Post(':id/distribute')
  @HttpCode(200)
  @Roles(Role.DIRECTOR_OPERATIVO)
  async distributeReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateDistributionDto,
  ): Promise<ReportDistributionDto> {
    return this.reportsService.distributeReport(user, id, dto);
  }

  @Get(':id/distributions')
  async getDistributions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ReportDistributionDto[]> {
    return this.reportsService.getDistributions(user, id);
  }

  // =========================================================================
  // EXPORTACIÓN Y DESCARGA (RF-036, RF-043, CP-33)
  // =========================================================================

  @Get(':id/pdf')
  async getReportPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.reportsService.generatePdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get(':id/excel')
  async getReportExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.reportsService.exportExcel(user, id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Delete(':id')
  async deleteDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.reportsService.deleteDraft(user, id);
  }
}

