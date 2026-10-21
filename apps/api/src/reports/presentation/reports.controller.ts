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
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { ReportsService } from '../application/reports.service';
import { CreateReportDraftDto } from './dto/create-report-draft.dto';
import { UpdateReportDraftDto } from './dto/update-report-draft.dto';
import { ReportFilterDto } from './dto/report-filter.dto';
import {
  ReportListItemDto,
  ReportResponseDto,
} from './dto/report-response.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
