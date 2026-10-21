import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AccessTokenService } from '../application/access-token.service';
import { LoginUseCase } from '../application/login.use-case';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../infrastructure/decorators/current-user.decorator';
import { AuthenticatedUser } from '../domain/authenticated-user.type';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly accessTokenService: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(@Body() input: LoginDto) {
    const user = await this.loginUseCase.execute(input);
    const accessToken = await this.accessTokenService.generate(user);

    return {
      accessToken,
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
}