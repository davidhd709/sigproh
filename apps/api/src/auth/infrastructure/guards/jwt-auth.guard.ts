import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../../domain/authenticated-user.type';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autenticación ausente');
    }

    const token = authHeader.substring(7);

    try {
      const payload = await this.jwtService.verifyAsync(token);

      const dbUser = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          organizationId: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      if (!dbUser || !dbUser.isActive) {
        throw new UnauthorizedException('Usuario inactivo o dado de baja');
      }

      const user: AuthenticatedUser = {
        id: dbUser.id,
        organizationId: dbUser.organizationId,
        email: dbUser.email,
        role: dbUser.role,
      };

      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token de autenticación inválido o expirado');
    }
  }
}
