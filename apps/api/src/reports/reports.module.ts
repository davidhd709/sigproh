import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/infrastructure/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationModule } from '../organization/organization.module';
import { ReportsService } from './application/reports.service';
import { ReportsController } from './presentation/reports.controller';
import { PdfGeneratorService } from './infrastructure/pdf-generator.service';
import { ExcelGeneratorService } from './infrastructure/excel-generator.service';
import { PrivateStorageService } from '../issues/infrastructure/private-storage.service';

@Module({
  imports: [PrismaModule, AuthModule, OrganizationModule],
  controllers: [ReportsController],
  providers: [ReportsService, PdfGeneratorService, ExcelGeneratorService, PrivateStorageService],
  exports: [ReportsService, PdfGeneratorService, ExcelGeneratorService],
})
export class ReportsModule {}
