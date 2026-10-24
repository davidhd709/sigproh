import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { RefreshTokenService } from './application/refresh-token.service';
import { AuthSessionService } from './application/auth-session.service';

import { AccessTokenService } from './application/access-token.service';
import { LoginUseCase } from './application/login.use-case';
import { PasswordHasherPort } from './application/password-hasher.port';
import { UserRepository } from './domain/user.repository';
import { Argon2PasswordHasherAdapter } from './infrastructure/argon2-password-hasher.adapter';
import { PrismaUserRepository } from './infrastructure/repositories/prisma-user.repository';
import { AuthController } from './presentation/auth.controller';

import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './infrastructure/guards/roles.guard';

import { PrismaModule } from '../shared/infrastructure/database/prisma.module';

const jwtSecret = process.env.JWT_ACCESS_SECRET;

if (!jwtSecret) {
  throw new Error('JWT_ACCESS_SECRET no está configurada');
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: jwtSecret,
      signOptions: {
        expiresIn: '15m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    AuthSessionService,
    AccessTokenService,
    RefreshTokenService,
    JwtAuthGuard,
    RolesGuard,
    {
      provide: PasswordHasherPort,
      useClass: Argon2PasswordHasherAdapter,
    },
    {
      provide: UserRepository,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [
    JwtModule,
    AccessTokenService,
    RefreshTokenService,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}