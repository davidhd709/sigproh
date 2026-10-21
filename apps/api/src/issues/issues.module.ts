import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/infrastructure/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { IssuesService } from './application/issues.service';
import { IssuesController } from './presentation/issues.controller';

@Module({
  imports: [PrismaModule, AuthModule, OrganizationModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
