import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../shared/infrastructure/database/prisma.module';
import { ScopeAuthorizationService } from './application/scope-authorization.service';
import { PropertiesService } from './application/properties.service';
import { InternalAreasService } from './application/internal-areas.service';
import { UsersService } from './application/users.service';
import { PropertiesController } from './presentation/properties.controller';
import { InternalAreasController } from './presentation/internal-areas.controller';
import { UsersController } from './presentation/users.controller';
import { JwtAuthGuard } from '../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/infrastructure/guards/roles.guard';

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
  controllers: [
    PropertiesController,
    InternalAreasController,
    UsersController,
  ],
  providers: [
    ScopeAuthorizationService,
    PropertiesService,
    InternalAreasService,
    UsersService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [
    ScopeAuthorizationService,
    PropertiesService,
    InternalAreasService,
    UsersService,
  ],
})
export class OrganizationModule {}
