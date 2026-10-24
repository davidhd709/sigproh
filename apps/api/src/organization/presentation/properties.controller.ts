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
import { PropertiesService } from '../application/properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { AssignCoordinatorDto } from './dto/assign-coordinator.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';

@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    // Solo quien administra el catálogo puede ver también los registros desactivados
    const canManage = user.role === Role.ADMINISTRADOR || user.role === Role.DIRECTOR_OPERATIVO;
    return this.propertiesService.list(user, includeInactive === 'true' && canManage);
  }

  @Get(':id')
  async findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.propertiesService.findById(user, id);
  }

  @Post()
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(user, dto);
  }

  @Post(':id/zones')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async addZone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateZoneDto,
  ) {
    return this.propertiesService.addZone(user, id, dto);
  }

  @Post(':id/assignments')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async assignCoordinator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignCoordinatorDto,
  ) {
    return this.propertiesService.assignCoordinator(user, id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(user, id, dto);
  }

  @Patch(':id/zones/:zoneId')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async updateZone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateZoneDto,
  ) {
    return this.propertiesService.updateZone(user, id, zoneId, dto);
  }

  @Delete(':id/assignments/:userId')
  @Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
  async removeAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.propertiesService.removeAssignment(user, id, userId);
  }
}
