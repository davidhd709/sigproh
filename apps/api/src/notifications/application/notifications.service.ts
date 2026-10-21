import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { AuthenticatedUser } from '../../auth/domain/authenticated-user.type';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, unreadOnly?: boolean) {
    return this.prisma.notification.findMany({
      where: {
        organizationId: user.organizationId,
        recipientId: user.id,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      include: {
        issue: {
          select: {
            id: true,
            code: true,
            title: true,
            priority: true,
            status: true,
            scope: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(user: AuthenticatedUser): Promise<{ unreadCount: number }> {
    const unreadCount = await this.prisma.notification.count({
      where: {
        organizationId: user.organizationId,
        recipientId: user.id,
        isRead: false,
      },
    });

    return { unreadCount };
  }

  async markAsRead(user: AuthenticatedUser, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        recipientId: user.id,
        organizationId: user.organizationId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada o no autorizada');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(user: AuthenticatedUser): Promise<{ updatedCount: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId: user.id,
        organizationId: user.organizationId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { updatedCount: result.count };
  }
}
