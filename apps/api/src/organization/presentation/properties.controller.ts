import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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

@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.propertiesService.list(user);
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
}
