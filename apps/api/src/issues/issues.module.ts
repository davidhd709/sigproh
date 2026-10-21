import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/infrastructure/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { IssuesService } from './application/issues.service';
import { IssuesController } from './presentation/issues.controller';
import { PrivateStorageService } from './infrastructure/private-storage.service';

@Module({
  imports: [PrismaModule, AuthModule, OrganizationModule],
  controllers: [IssuesController],
  providers: [IssuesService, PrivateStorageService],
  exports: [IssuesService, PrivateStorageService],
})
export class IssuesModule {}
