import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { ScopeAuthorizationService } from './scope-authorization.service';
import { CreateInternalAreaDto } from '../presentation/dto/create-internal-area.dto';
import { AssignAreaUserDto } from '../presentation/dto/assign-area-user.dto';

@Injectable()
export class InternalAreasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeAuth: ScopeAuthorizationService,
  ) {}

  /**
   * Lista áreas internas respetando el alcance del usuario (RF-049).
   */
  async list(user: AuthenticatedUser) {
    const accessibleIds = await this.scopeAuth.getAccessibleInternalAreaCatalogIds(user);

    const whereClause: {
      organizationId: string;
      isActive: boolean;
      id?: { in: string[] };
    } = {
      organizationId: user.organizationId,
      isActive: true,
    };

    if (accessibleIds !== null) {
      whereClause.id = { in: accessibleIds };
    }

    return this.prisma.internalArea.findMany({
      where: whereClause,
      include: {
        assignments: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Obtiene el detalle de un área interna validando acceso de catálogo.
   */
  async findById(user: AuthenticatedUser, internalAreaId: string) {
    await this.scopeAuth.validateInternalAreaCatalogAccess(user, internalAreaId);

    const area = await this.prisma.internalArea.findUnique({
      where: { id: internalAreaId },
      include: {
        assignments: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!area) {
      throw new NotFoundException('Área interna no encontrada');
    }

    return area;
  }

  /**
   * Crea un área interna de la organización.
   */
  async create(user: AuthenticatedUser, dto: CreateInternalAreaDto) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.internalArea.findUnique({
      where: {
        organizationId_code: {
          organizationId: user.organizationId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Ya existe un área con el código ${code}`);
    }

    return this.prisma.internalArea.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        code,
        description: dto.description?.trim(),
        isActive: true,
      },
    });
  }

  /**
   * Asigna un usuario al área interna.
   */
  async assignUser(
    user: AuthenticatedUser,
    internalAreaId: string,
    dto: AssignAreaUserDto,
  ) {
    const area = await this.prisma.internalArea.findUnique({
      where: { id: internalAreaId },
      select: { id: true, organizationId: true },
    });

    if (!area || area.organizationId !== user.organizationId) {
      throw new NotFoundException('Área interna no encontrada');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, organizationId: true, role: true, isActive: true },
    });

    if (!targetUser || targetUser.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario a asignar no encontrado en la organización');
    }

    if (!targetUser.isActive) {
      throw new BadRequestException('No se puede asignar un usuario inactivo');
    }

    const isLead = dto.isLead ?? false;

    return this.prisma.$transaction(async (tx) => {
      if (isLead) {
        await tx.areaAssignment.updateMany({
          where: { internalAreaId, isLead: true },
          data: { isLead: false },
        });
      }

      return tx.areaAssignment.upsert({
        where: {
          internalAreaId_userId: {
            internalAreaId,
            userId: targetUser.id,
          },
        },
        update: {
          isLead,
          isActive: true,
        },
        create: {
          internalAreaId,
          userId: targetUser.id,
          isLead,
          isActive: true,
        },
      });
    });
  }
}
