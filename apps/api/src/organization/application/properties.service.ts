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
import { UpdatePropertyDto } from '../presentation/dto/update-property.dto';
import { UpdateZoneDto } from '../presentation/dto/update-zone.dto';
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
  async list(user: AuthenticatedUser, includeInactive = false) {
    const accessibleIds = await this.scopeAuth.getAccessiblePropertyCatalogIds(user);

    const whereClause: {
      organizationId: string;
      isActive?: boolean;
      id?: { in: string[] };
    } = {
      organizationId: user.organizationId,
    };
    // Las inactivas solo se listan para administrarlas (el controlador restringe quién puede pedirlas)
    if (!includeInactive) whereClause.isActive = true;

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
   * Crea una nueva propiedad horizontal con su coordinador principal y su director responsable (ambos obligatorios).
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

    await this.findAssignableUser(user, dto.coordinatorId, Role.COORDINADOR_OPERATIVO);
    await this.findAssignableUser(user, dto.directorId, Role.DIRECTOR_OPERATIVO);

    return this.prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          organizationId: user.organizationId,
          name: dto.name.trim(),
          code,
          address: dto.address?.trim(),
          nit: dto.nit?.trim(),
          isActive: true,
        },
      });

      // isLead marca al coordinador principal y, en el caso del director, al responsable de la propiedad
      await tx.propertyAssignment.createMany({
        data: [
          { propertyId: property.id, userId: dto.coordinatorId, isLead: true, isActive: true },
          { propertyId: property.id, userId: dto.directorId, isLead: true, isActive: true },
        ],
      });

      return property;
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
   * Asigna un coordinador o el director responsable a una propiedad.
   * - Coordinador: si isLead es true, pasa a ser el principal y los demás coordinadores dejan de serlo.
   * - Director: cada propiedad tiene un único director responsable; el anterior queda retirado.
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

    const targetUser = await this.findAssignableUser(user, dto.userId);
    const isDirector = targetUser.role === Role.DIRECTOR_OPERATIVO;
    const isLead = isDirector || (dto.isLead ?? false);

    return this.prisma.$transaction(async (tx) => {
      if (isDirector) {
        await tx.propertyAssignment.updateMany({
          where: {
            propertyId,
            isActive: true,
            userId: { not: targetUser.id },
            user: { role: Role.DIRECTOR_OPERATIVO },
          },
          data: { isActive: false, isLead: false },
        });
      } else if (isLead) {
        await tx.propertyAssignment.updateMany({
          where: { propertyId, isLead: true, user: { role: Role.COORDINADOR_OPERATIVO } },
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

  /**
   * Actualiza datos de la propiedad o la desactiva. Desactivar no borra novedades ni informes.
   */
  async update(user: AuthenticatedUser, propertyId: string, dto: UpdatePropertyDto) {
    await this.findOwned(user, propertyId);
    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        name: dto.name?.trim(),
        address: dto.address?.trim(),
        nit: dto.nit?.trim(),
        isActive: dto.isActive,
      },
    });
  }

  /**
   * Renombra o desactiva una zona.
   */
  async updateZone(user: AuthenticatedUser, propertyId: string, zoneId: string, dto: UpdateZoneDto) {
    await this.findOwned(user, propertyId);
    const zone = await this.prisma.propertyZone.findUnique({ where: { id: zoneId }, select: { propertyId: true } });
    if (!zone || zone.propertyId !== propertyId) {
      throw new NotFoundException('Zona no encontrada');
    }
    return this.prisma.propertyZone.update({
      where: { id: zoneId },
      data: { name: dto.name?.trim(), description: dto.description?.trim(), isActive: dto.isActive },
    });
  }

  /**
   * Retira a un coordinador de la propiedad (desactiva la asignación, conserva el historial).
   */
  async removeAssignment(user: AuthenticatedUser, propertyId: string, userId: string) {
    await this.findOwned(user, propertyId);
    const assignment = await this.prisma.propertyAssignment.findUnique({
      where: { propertyId_userId: { propertyId, userId } },
    });
    if (!assignment || !assignment.isActive) {
      throw new NotFoundException('El usuario no está asignado a esta propiedad');
    }

    // La propiedad no puede quedarse sin coordinador ni sin director responsable
    const assignedUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const sameRoleLeft = await this.prisma.propertyAssignment.count({
      where: { propertyId, isActive: true, userId: { not: userId }, user: { role: assignedUser?.role } },
    });
    if (sameRoleLeft === 0) {
      throw new BadRequestException(
        assignedUser?.role === Role.DIRECTOR_OPERATIVO
          ? 'La propiedad debe tener un director responsable. Asigne otro director antes de retirar este.'
          : 'La propiedad debe tener al menos un coordinador. Asigne otro antes de retirar este.',
      );
    }

    return this.prisma.propertyAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false, isLead: false },
    });
  }

  /** Usuario activo de la organización con rol asignable a propiedades (coordinador o director). */
  private async findAssignableUser(user: AuthenticatedUser, userId: string, expectedRole?: Role) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true, role: true, isActive: true },
    });

    if (!target || target.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario a asignar no encontrado en la organización');
    }
    if (!target.isActive) {
      throw new BadRequestException('No se puede asignar un usuario inactivo');
    }

    const allowed = expectedRole ? [expectedRole] : [Role.COORDINADOR_OPERATIVO, Role.DIRECTOR_OPERATIVO];
    if (!allowed.includes(target.role)) {
      throw new BadRequestException(
        expectedRole === Role.DIRECTOR_OPERATIVO
          ? 'El director responsable debe tener el rol Director Operativo'
          : expectedRole === Role.COORDINADOR_OPERATIVO
            ? 'El coordinador principal debe tener el rol Coordinador Operativo'
            : 'A una propiedad solo se asignan coordinadores operativos o el director operativo',
      );
    }
    return target;
  }

  private async findOwned(user: AuthenticatedUser, propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, organizationId: true },
    });
    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException('Propiedad no encontrada');
    }
    return property;
  }
}
