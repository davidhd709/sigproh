import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

@Injectable()
export class ScopeAuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida si un usuario autenticado tiene permiso operativo sobre una propiedad horizontal (novedades, etc.).
   * Reglas de negocio:
   * - DIRECTOR_OPERATIVO, GERENTE y AUXILIAR_GERENCIA tienen visibilidad y control global dentro de la organización.
   * - ADMINISTRADOR no cuenta con acceso operativo automático a novedades sin asignación explícita (RF-049 / Matriz Roles).
   * - COORDINADOR_OPERATIVO, AUXILIAR_GERENCIA y ADMINISTRADOR SOLO tienen acceso operativo si cuentan con asignación activa (PropertyAssignment).
   */
  async validatePropertyAccess(
    user: AuthenticatedUser,
    propertyId: string,
  ): Promise<boolean> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, organizationId: true, isActive: true },
    });

    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException('Propiedad no encontrada');
    }

    if (
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return true;
    }

    const assignment = await this.prisma.propertyAssignment.findUnique({
      where: {
        propertyId_userId: {
          propertyId,
          userId: user.id,
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ForbiddenException(
        'Acceso denegado: no tiene asignación activa en esta propiedad',
      );
    }

    return true;
  }

  /**
   * Consulta booleana para verificar si un usuario tiene acceso operativo a una propiedad sin lanzar excepción.
   */
  async hasPropertyAccess(
    user: AuthenticatedUser,
    propertyId: string,
  ): Promise<boolean> {
    try {
      return await this.validatePropertyAccess(user, propertyId);
    } catch {
      return false;
    }
  }

  /**
   * Valida acceso a gestión de catálogo estructural de propiedades (ADMINISTRADOR, DIRECTOR, GERENTE, AUXILIAR_GERENCIA).
   */
  async validatePropertyCatalogAccess(
    user: AuthenticatedUser,
    propertyId: string,
  ): Promise<boolean> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, organizationId: true, isActive: true },
    });

    if (!property || property.organizationId !== user.organizationId) {
      throw new NotFoundException('Propiedad no encontrada');
    }

    if (
      user.role === Role.ADMINISTRADOR ||
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return true;
    }

    const assignment = await this.prisma.propertyAssignment.findUnique({
      where: {
        propertyId_userId: {
          propertyId,
          userId: user.id,
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ForbiddenException(
        'Acceso denegado: no tiene asignación activa en esta propiedad',
      );
    }

    return true;
  }

  /**
   * Valida si un usuario autenticado tiene permiso operativo sobre un área interna de EG S.A.S.
   */
  async validateInternalAreaAccess(
    user: AuthenticatedUser,
    internalAreaId: string,
  ): Promise<boolean> {
    const area = await this.prisma.internalArea.findUnique({
      where: { id: internalAreaId },
      select: { id: true, organizationId: true, isActive: true },
    });

    if (!area || area.organizationId !== user.organizationId) {
      throw new NotFoundException('Área interna no encontrada');
    }

    if (
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return true;
    }

    const assignment = await this.prisma.areaAssignment.findUnique({
      where: {
        internalAreaId_userId: {
          internalAreaId,
          userId: user.id,
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ForbiddenException(
        'Acceso denegado: no tiene asignación activa en esta área interna',
      );
    }

    return true;
  }

  /**
   * Consulta booleana para verificar si un usuario tiene acceso operativo a un área interna sin lanzar excepción.
   */
  async hasInternalAreaAccess(
    user: AuthenticatedUser,
    internalAreaId: string,
  ): Promise<boolean> {
    try {
      return await this.validateInternalAreaAccess(user, internalAreaId);
    } catch {
      return false;
    }
  }

  /**
   * Valida acceso a catálogo estructural de áreas internas.
   */
  async validateInternalAreaCatalogAccess(
    user: AuthenticatedUser,
    internalAreaId: string,
  ): Promise<boolean> {
    const area = await this.prisma.internalArea.findUnique({
      where: { id: internalAreaId },
      select: { id: true, organizationId: true, isActive: true },
    });

    if (!area || area.organizationId !== user.organizationId) {
      throw new NotFoundException('Área interna no encontrada');
    }

    if (
      user.role === Role.ADMINISTRADOR ||
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return true;
    }

    const assignment = await this.prisma.areaAssignment.findUnique({
      where: {
        internalAreaId_userId: {
          internalAreaId,
          userId: user.id,
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      throw new ForbiddenException(
        'Acceso denegado: no tiene asignación activa en esta área interna',
      );
    }

    return true;
  }

  /**
   * Obtiene la lista de IDs de propiedades a las que el usuario tiene acceso operativo (RF-049).
   * Si retorna null, significa que no tiene restricción por asignación (visión global de la organización: DIRECTOR, GERENTE, AUXILIAR_GERENCIA).
   * ADMINISTRADOR sin asignación no tiene acceso operativo global.
   */
  async getAccessiblePropertyIds(
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return null;
    }

    const assignments = await this.prisma.propertyAssignment.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: { propertyId: true },
    });

    return assignments.map((a) => a.propertyId);
  }

  /**
   * Obtiene IDs de propiedades para consulta del catálogo estructural (incluye Administrador como global).
   */
  async getAccessiblePropertyCatalogIds(
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (
      user.role === Role.ADMINISTRADOR ||
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return null;
    }

    const assignments = await this.prisma.propertyAssignment.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: { propertyId: true },
    });

    return assignments.map((a) => a.propertyId);
  }

  /**
   * Obtiene la lista de IDs de áreas internas a las que el usuario tiene acceso operativo (RF-049).
   */
  async getAccessibleInternalAreaIds(
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return null;
    }

    const assignments = await this.prisma.areaAssignment.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: { internalAreaId: true },
    });

    return assignments.map((a) => a.internalAreaId);
  }

  /**
   * Obtiene IDs de áreas internas para catálogo estructural.
   */
  async getAccessibleInternalAreaCatalogIds(
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (
      user.role === Role.ADMINISTRADOR ||
      user.role === Role.DIRECTOR_OPERATIVO ||
      user.role === Role.GERENTE ||
      user.role === Role.AUXILIAR_GERENCIA
    ) {
      return null;
    }

    const assignments = await this.prisma.areaAssignment.findMany({
      where: {
        userId: user.id,
        isActive: true,
      },
      select: { internalAreaId: true },
    });

    return assignments.map((a) => a.internalAreaId);
  }
}
