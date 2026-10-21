import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/infrastructure/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { DashboardService } from './application/dashboard.service';
import { DashboardController } from './presentation/dashboard.controller';

@Module({
  imports: [PrismaModule, AuthModule, OrganizationModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
