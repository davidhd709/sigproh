import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';

import { AuthSessionService, IssuedSession } from '../application/auth-session.service';
import { LoginUseCase } from '../application/login.use-case';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../domain/authenticated-user.type';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

/** Cookie httpOnly con el token de refresco: inaccesible para JavaScript (protege frente a XSS). */
export const REFRESH_COOKIE = 'sigproh_rt';

function refreshCookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    // Ruta raíz: el frontend llega por /api/auth/… (proxy) o directo por /auth/…
    path: '/',
    expires,
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly sessions: AuthSessionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.loginUseCase.execute(input);
    const session = await this.sessions.start(user);
    this.setRefreshCookie(res, session);

    return {
      accessToken: session.accessToken,
      user: {
        id: user.userId,
        organizationId: user.organizationId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  /** Renueva el token de acceso con la cookie de refresco (rotándola). */
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.sessions.rotate(req.cookies?.[REFRESH_COOKIE]);
      this.setRefreshCookie(res, session);
      return { accessToken: session.accessToken };
    } catch (error) {
      // Si la sesión no sirve se borra la cookie; un 409 (pestaña concurrente) la conserva
      if ((error as { status?: number }).status === 401) res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
      throw error;
    }
  }

  /** Cierra la sesión del dispositivo actual. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  }

  /** El usuario cambia su propia contraseña; se cierran sus sesiones en otros dispositivos. */
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.sessions.changePassword(user, dto.currentPassword, dto.newPassword);
    this.setRefreshCookie(res, session);
    return { accessToken: session.accessToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.user.findUnique({
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

    return profile;
  }

  private setRefreshCookie(res: Response, session: IssuedSession): void {
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions(session.refreshExpiresAt));
  }
}
