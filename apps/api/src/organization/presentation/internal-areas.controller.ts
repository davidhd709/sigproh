import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { InternalAreasService } from '../application/internal-areas.service';
import { CreateInternalAreaDto } from './dto/create-internal-area.dto';
import { AssignAreaUserDto } from './dto/assign-area-user.dto';
import { UpdateInternalAreaDto } from './dto/update-internal-area.dto';

@Controller('internal-areas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InternalAreasController {
  constructor(private readonly areasService: InternalAreasService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    // Solo quien administra el catálogo puede ver también los registros desactivados
    const canManage = user.role === Role.ADMINISTRADOR || user.role === Role.DIRECTOR_OPERATIVO;
    return this.areasService.list(user, includeInactive === 'true' && canManage);
  }

  @Get(':id')
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.areasService.findById(user, id);
  }

  @Post()
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInternalAreaDto,
  ) {
    return this.areasService.create(user, dto);
  }

  @Post(':id/assignments')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async assignUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignAreaUserDto,
  ) {
    return this.areasService.assignUser(user, id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateInternalAreaDto,
  ) {
    return this.areasService.update(user, id, dto);
  }

  @Delete(':id/assignments/:userId')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async removeAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.areasService.removeAssignment(user, id, userId);
  }
}
