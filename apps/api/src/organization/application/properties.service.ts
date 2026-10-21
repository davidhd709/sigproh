import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';
import { ScopeAuthorizationService } from './scope-authorization.service';
import { CreatePropertyDto } from '../presentation/dto/create-property.dto';
import { CreateZoneDto } from '../presentation/dto/create-zone.dto';
import { AssignCoordinatorDto } from '../presentation/dto/assign-coordinator.dto';

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeAuth: ScopeAuthorizationService,
  ) {}

  /**
   * Lista propiedades respetando el alcance del usuario (RF-049).
   * - Los coordinadores solo verán las propiedades que tienen asignadas activamente.
   * - Director, Gerente y Admin ven todas las propiedades de la organización.
   */
  async list(user: AuthenticatedUser) {
    const accessibleIds = await this.scopeAuth.getAccessiblePropertyCatalogIds(user);

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

    return this.prisma.property.findMany({
      where: whereClause,
      include: {
        zones: {
          where: { isActive: true },
          select: { id: true, name: true, description: true },
        },
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
   * Obtiene el detalle de una propiedad validando estrictamente el acceso de catálogo (CP-02).
   */
  async findById(user: AuthenticatedUser, propertyId: string) {
    await this.scopeAuth.validatePropertyCatalogAccess(user, propertyId);

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        zones: {
          where: { isActive: true },
          select: { id: true, name: true, description: true },
        },
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

    if (!property) {
      throw new NotFoundException('Propiedad no encontrada');
    }

    return property;
  }

  /**
   * Crea una nueva propiedad horizontal.
   */
  async create(user: AuthenticatedUser, dto: CreatePropertyDto) {
    const code = dto.code.trim().toUpperCase();

    const existing = await this.prisma.property.findUnique({
      where: {
        organizationId_code: {
          organizationId: user.organizationId,
          code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Ya existe una propiedad con el código ${code}`);
    }

    return this.prisma.property.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        code,
        address: dto.address?.trim(),
        nit: dto.nit?.trim(),
        isActive: true,
      },
    });
  }

  /**
   * Agrega una zona a una propiedad.
   */
  async addZone(user: AuthenticatedUser, propertyId: string, dto: CreateZoneDto) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, organizationId: true },
    });

    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException('Propiedad no encontrada');
    }

    return this.prisma.propertyZone.create({
      data: {
        propertyId,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        isActive: true,
      },
    });
  }

  /**
   * Asigna un coordinador a una propiedad.
   * Si isLead es true, desactiva el flag isLead de otros coordinadores en la misma propiedad.
   */
  async assignCoordinator(
    user: AuthenticatedUser,
    propertyId: string,
    dto: AssignCoordinatorDto,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, organizationId: true },
    });

    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException('Propiedad no encontrada');
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

    if (targetUser.role !== Role.COORDINADOR_OPERATIVO) {
      throw new BadRequestException(
        'Solo se pueden asignar usuarios con rol COORDINADOR_OPERATIVO como coordinadores de propiedad',
      );
    }

    const isLead = dto.isLead ?? false;

    return this.prisma.$transaction(async (tx) => {
      if (isLead) {
        await tx.propertyAssignment.updateMany({
          where: { propertyId, isLead: true },
          data: { isLead: false },
        });
      }

      return tx.propertyAssignment.upsert({
        where: {
          propertyId_userId: {
            propertyId,
            userId: targetUser.id,
          },
        },
        update: {
          isLead,
          isActive: true,
        },
        create: {
          propertyId,
          userId: targetUser.id,
          isLead,
          isActive: true,
        },
      });
    });
  }
}
