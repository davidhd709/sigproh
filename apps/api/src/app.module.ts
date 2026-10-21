import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { IssuesModule } from './issues/issues.module';
import { OrganizationModule } from './organization/organization.module';
import { PrismaModule } from './shared/infrastructure/database/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, OrganizationModule, IssuesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

