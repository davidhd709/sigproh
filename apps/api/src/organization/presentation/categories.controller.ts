import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { Roles } from '../../auth/infrastructure/decorators/roles.decorator';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { CategoriesService } from '../application/categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Administración del catálogo. La consulta operativa (solo activas) sigue en GET /categories.
 */
@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRADOR, Role.DIRECTOR_OPERATIVO)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('manage')
  async listForManagement(@CurrentUser() user: AuthenticatedUser) {
    return this.categoriesService.listForManagement(user);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user, id, dto);
  }
}
