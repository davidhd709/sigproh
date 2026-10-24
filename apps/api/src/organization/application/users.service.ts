import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PasswordHasherPort } from '../../auth/application/password-hasher.port';
import { CreateUserDto } from '../presentation/dto/create-user.dto';
import { UpdateUserDto } from '../presentation/dto/update-user.dto';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  private static readonly PUBLIC_FIELDS = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    isActive: true,
    lastLoginAt: true,
    createdAt: true,
  } as const;

  /**
   * Crea una cuenta con contraseña inicial definida por el administrador (RF-002).
   */
  async create(user: AuthenticatedUser, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    await this.assertEmailAvailable(user.organizationId, email);

    return this.prisma.user.create({
      data: {
        organizationId: user.organizationId,
        email,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        role: dto.role,
        passwordHash: await this.passwordHasher.hash(dto.password),
        isActive: true,
      },
      select: UsersService.PUBLIC_FIELDS,
    });
  }

  /**
   * Actualiza datos y rol. Impide quitarse el propio rol y dejar la organización sin administrador.
   */
  async update(user: AuthenticatedUser, targetUserId: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, organizationId: true, role: true, email: true, isActive: true },
    });
    if (!target || target.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const roleChanges = dto.role !== undefined && dto.role !== target.role;
    if (roleChanges && user.id === targetUserId) {
      throw new BadRequestException('No puede cambiar su propio rol');
    }
    if (roleChanges && target.role === Role.ADMINISTRADOR && target.isActive) {
      await this.assertAnotherActiveAdmin(user.organizationId, targetUserId);
    }

    const email = dto.email?.trim().toLowerCase();
    if (email && email !== target.email) {
      await this.assertEmailAvailable(user.organizationId, email);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          email,
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          role: dto.role,
        },
        select: UsersService.PUBLIC_FIELDS,
      });
      // Un cambio de rol obliga a iniciar sesión de nuevo para que el token refleje los permisos
      if (roleChanges) {
        await tx.refreshSession.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return updated;
    });
  }

  /**
   * Asigna una nueva contraseña y cierra las sesiones abiertas del usuario.
   */
  async resetPassword(user: AuthenticatedUser, targetUserId: string, password: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, organizationId: true },
    });
    if (!target || target.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const passwordHash = await this.passwordHasher.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: targetUserId }, data: { passwordHash } }),
      this.prisma.refreshSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  private async assertEmailAvailable(organizationId: string, email: string) {
    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId, email } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Ya existe un usuario con el correo ${email}`);
    }
  }

  private async assertAnotherActiveAdmin(organizationId: string, excludingUserId: string) {
    const others = await this.prisma.user.count({
      where: { organizationId, role: Role.ADMINISTRADOR, isActive: true, id: { not: excludingUserId } },
    });
    if (others === 0) {
      throw new BadRequestException('La organización debe conservar al menos un administrador activo');
    }
  }

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
        propertyAssignments: {
          where: { isActive: true },
          select: { isLead: true, property: { select: { id: true, name: true, code: true } } },
        },
        areaAssignments: {
          where: { isActive: true },
          select: { isLead: true, internalArea: { select: { id: true, name: true, code: true } } },
        },
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
      select: { id: true, organizationId: true, role: true },
    });

    if (!targetUser || targetUser.organizationId !== user.organizationId) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!isActive && targetUser.role === Role.ADMINISTRADOR) {
      await this.assertAnotherActiveAdmin(user.organizationId, targetUserId);
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
