import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/infrastructure/database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from './application/notifications.service';
import { NotificationsController } from './presentation/notifications.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
