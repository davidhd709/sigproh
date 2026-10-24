import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../domain/authenticated-user.type';
import { AccessTokenService } from './access-token.service';
import { LoginResult } from './login.use-case';
import { PasswordHasherPort } from './password-hasher.port';
import { RefreshTokenService } from './refresh-token.service';

export type IssuedSession = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

/**
 * Sesiones renovables: token de acceso corto (15 min) + token de refresco rotativo (7 días)
 * guardado solo como hash. Reutilizar un token ya rotado se trata como robo y cierra todas
 * las sesiones del usuario, salvo dentro de una ventana corta para pestañas concurrentes.
 */
@Injectable()
export class AuthSessionService {
  /** Margen para dos pestañas que renuevan a la vez con la misma cookie. */
  static readonly CONCURRENT_GRACE_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly accessTokens: AccessTokenService,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  /** Abre una sesión para un usuario ya autenticado. */
  async start(user: LoginResult): Promise<IssuedSession> {
    const refresh = this.refreshTokens.generate();
    await this.prisma.refreshSession.create({
      data: { userId: user.userId, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
    });
    return {
      accessToken: await this.accessTokens.generate(user),
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  /** Cambia un token de refresco válido por uno nuevo y entrega un token de acceso fresco. */
  async rotate(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw new UnauthorizedException('Sesión no encontrada');

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.refreshTokens.hash(refreshToken) },
      include: { user: true },
    });
    if (!session) throw new UnauthorizedException('Sesión no válida');

    const now = Date.now();
    if (session.revokedAt) {
      if (now - session.revokedAt.getTime() < AuthSessionService.CONCURRENT_GRACE_MS) {
        // Otra pestaña acaba de renovar: el cliente debe reintentar con la cookie nueva
        throw new ConflictException('La sesión acaba de renovarse');
      }
      // Reutilización de un token viejo: posible robo. Se cierran todas las sesiones.
      await this.revokeAll(session.userId);
      throw new UnauthorizedException('Sesión no válida');
    }
    if (session.expiresAt.getTime() <= now || !session.user.isActive) {
      throw new UnauthorizedException('La sesión expiró');
    }

    const { user } = session;
    const next = this.refreshTokens.generate();
    await this.prisma.$transaction([
      this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date(now), lastUsedAt: new Date(now) },
      }),
      this.prisma.refreshSession.create({
        data: { userId: user.id, tokenHash: next.tokenHash, expiresAt: next.expiresAt },
      }),
    ]);

    return {
      accessToken: await this.accessTokens.generate({
        userId: user.id,
        organizationId: user.organizationId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      }),
      refreshToken: next.token,
      refreshExpiresAt: next.expiresAt,
    };
  }

  /** Cierra la sesión asociada al token (cerrar sesión). Idempotente. */
  async revoke(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: this.refreshTokens.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * El propio usuario cambia su contraseña. Se cierran todas sus sesiones (otros dispositivos)
   * y se abre una nueva para el dispositivo actual.
   */
  async changePassword(auth: AuthenticatedUser, currentPassword: string, newPassword: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user || !user.isActive) throw new UnauthorizedException('Sesión no válida');

    const valid = await this.passwordHasher.verify(user.passwordHash, currentPassword);
    if (!valid) throw new BadRequestException('La contraseña actual no es correcta');
    if (currentPassword === newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwordHasher.hash(newPassword) },
    });
    await this.revokeAll(user.id);

    return this.start({
      userId: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });
  }

  private async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
