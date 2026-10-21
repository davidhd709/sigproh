import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista usuarios de la organización.
   */
  async list(user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { lastName: 'asc' },
    });
  }

  /**
   * Obtiene detalle de usuario por ID dentro de la organización.
   */
  async findById(user: AuthenticatedUser, id: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        propertyAssignments: {
          where: { isActive: true },
          include: {
            property: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        areaAssignments: {
          where: { isActive: true },
          include: {
            internalArea: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    if (!targetUser || targetUser.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return targetUser;
  }

  /**
   * Activa o desactiva un usuario sin borrar su historial ni registros operativos (RF-002).
   */
  async updateStatus(
    user: AuthenticatedUser,
    targetUserId: string,
    isActive: boolean,
  ) {
    if (user.id === targetUserId) {
      throw new BadRequestException(
        'Un administrador no puede desactivar su propia cuenta',
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, organizationId: true },
    });

    if (!targetUser || targetUser.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!isActive) {
      await this.prisma.refreshSession.updateMany({
        where: {
          userId: targetUserId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
  }

  /**
   * Obtiene el perfil completo del usuario autenticado con sus ámbitos autorizados.
   */
  async getProfile(user: AuthenticatedUser) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        organizationId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        propertyAssignments: {
          where: { isActive: true },
          include: {
            property: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        areaAssignments: {
          where: { isActive: true },
          include: {
            internalArea: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });
  }
}
