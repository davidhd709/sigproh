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
import { InternalAreasService } from '../application/internal-areas.service';
import { CreateInternalAreaDto } from './dto/create-internal-area.dto';
import { AssignAreaUserDto } from './dto/assign-area-user.dto';

@Controller('internal-areas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InternalAreasController {
  constructor(private readonly areasService: InternalAreasService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.areasService.list(user);
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
}
