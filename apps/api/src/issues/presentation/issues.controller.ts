import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IssueScope } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { DirectorOnly } from '../../auth/infrastructure/decorators/roles.decorator';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { IssuesService } from '../application/issues.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { AssignPrincipalDto } from './dto/assign-principal.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { AddUrgentMeasureDto } from './dto/add-urgent-measure.dto';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { AssignActivityDto } from './dto/assign-activity.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { RequestClosureDto } from './dto/request-closure.dto';
import { CloseIssueDto } from './dto/close-issue.dto';
import { ReturnIssueDto } from './dto/return-issue.dto';
import { ReopenIssueDto } from './dto/reopen-issue.dto';
import { DiscardIssueDto } from './dto/discard-issue.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Post('issues')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIssueDto,
  ) {
    return this.issuesService.create(user, dto);
  }

  @Get('issues')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListIssuesQueryDto,
  ) {
    return this.issuesService.list(user, query);
  }

  @Get('issues/:id')
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.issuesService.findById(user, id);
  }

  @Get('issues/:id/candidates')
  async getCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.issuesService.getCandidates(user, id);
  }

  @Patch('issues/:id/assignment')
  @DirectorOnly()
  async assignPrincipal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignPrincipalDto,
  ) {
    return this.issuesService.assignPrincipal(user, id, dto);
  }

  @Patch('issues/:id/priority')
  @DirectorOnly()
  async updatePriority(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePriorityDto,
  ) {
    return this.issuesService.updatePriority(user, id, dto);
  }

  @Post('issues/:id/urgent-measures')
  async addUrgentMeasure(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddUrgentMeasureDto,
  ) {
    return this.issuesService.addUrgentMeasure(user, id, dto);
  }

  // --- Endpoints de Actividades (F4 / RF-019 / CP-09 a CP-11) ---

  @Post('issues/:id/activities')
  async createActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.issuesService.createActivity(user, id, dto);
  }

  @Get('issues/:id/activities')
  async listActivities(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.issuesService.listActivities(user, id);
  }

  @Patch('issues/:id/activities/:activityId')
  async updateActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.issuesService.updateActivity(user, id, activityId, dto);
  }

  @Patch('issues/:id/activities/:activityId/assignment')
  async assignActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() dto: AssignActivityDto,
  ) {
    return this.issuesService.assignActivity(user, id, activityId, dto);
  }

  // --- Endpoints de Comentarios (F4 / RF-020) ---

  @Post('issues/:id/comments')
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.issuesService.createComment(user, id, dto);
  }

  @Get('issues/:id/comments')
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('activityId') activityId?: string,
  ) {
    return this.issuesService.listComments(user, id, activityId);
  }

  @Get('categories')
  async listCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope?: IssueScope,
  ) {
    return this.issuesService.listCategories(user, scope);
  }

  // --- Endpoints de Adjuntos / Evidencias (F4 / RF-021, RF-022, PEN-07) ---

  @Post('issues/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: CreateAttachmentDto,
  ) {
    if (!file) {
      throw new BadRequestException('Debe proporcionar un archivo en el campo "file"');
    }
    return this.issuesService.uploadAttachment(user, id, file, dto);
  }

  @Get('issues/:id/attachments')
  async listAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('activityId') activityId?: string,
  ) {
    return this.issuesService.listAttachments(user, id, activityId);
  }

  @Get('issues/:id/attachments/:attachmentId/download')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.issuesService.getAttachmentFile(
      user,
      id,
      attachmentId,
    );

    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  // --- Endpoints de Cierre, Devolución, Reapertura y Descarte (F5 / RF-012, RF-023, RF-024, RF-025, RF-026, CP-12 a CP-16) ---

  @Post('issues/:id/request-closure')
  async requestClosure(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RequestClosureDto,
  ) {
    return this.issuesService.requestClosure(user, id, dto);
  }

  @Post('issues/:id/close')
  @DirectorOnly()
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseIssueDto,
  ) {
    return this.issuesService.close(user, id, dto);
  }

  @Post('issues/:id/return')
  @DirectorOnly()
  async return(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReturnIssueDto,
  ) {
    return this.issuesService.return(user, id, dto);
  }

  @Post('issues/:id/reopen')
  @DirectorOnly()
  async reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReopenIssueDto,
  ) {
    return this.issuesService.reopen(user, id, dto);
  }

  @Post('issues/:id/discard')
  @DirectorOnly()
  async discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DiscardIssueDto,
  ) {
    return this.issuesService.discard(user, id, dto);
  }
}

