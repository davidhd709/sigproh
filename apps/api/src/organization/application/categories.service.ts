import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { CreateCategoryDto } from '../presentation/dto/create-category.dto';
import { UpdateCategoryDto } from '../presentation/dto/update-category.dto';

/**
 * Catálogo de categorías por ámbito y su exigencia de evidencia final (RF-005, RF-023).
 * Las categorías no se borran: se desactivan para conservar las novedades que las usan.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas las categorías, incluidas las inactivas, con el número de novedades que las usan. */
  async listForManagement(user: AuthenticatedUser) {
    return this.prisma.category.findMany({
      where: { organizationId: user.organizationId },
      include: { _count: { select: { issues: true } } },
      orderBy: [{ scope: 'asc' }, { name: 'asc' }],
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCategoryDto) {
    const name = dto.name.trim();
    await this.assertNameAvailable(user.organizationId, dto.scope, name);
    return this.prisma.category.create({
      data: {
        organizationId: user.organizationId,
        scope: dto.scope,
        name,
        description: dto.description?.trim() || null,
        requiresEvidence: dto.requiresEvidence ?? true,
        isActive: true,
      },
    });
  }

  async update(user: AuthenticatedUser, categoryId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.organizationId !== user.organizationId) {
      throw new NotFoundException('Categoría no encontrada');
    }

    const name = dto.name?.trim();
    if (name && name !== category.name) {
      await this.assertNameAvailable(user.organizationId, category.scope, name);
    }

    return this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name,
        description: dto.description === undefined ? undefined : dto.description.trim() || null,
        requiresEvidence: dto.requiresEvidence,
        isActive: dto.isActive,
      },
    });
  }

  private async assertNameAvailable(organizationId: string, scope: CreateCategoryDto['scope'], name: string) {
    const existing = await this.prisma.category.findUnique({
      where: { organizationId_scope_name: { organizationId, scope, name } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Ya existe la categoría «${name}» en este ámbito`);
    }
  }
}
