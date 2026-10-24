import { describe, expect, it } from 'vitest';
import { ActivityStatus, IssueEventType } from '../../generated/prisma/client';
import { IssuesService } from './issues.service';

describe('IssuesService.inboxSummary (bandejas por rol, RF-027)', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const past = new Date('2026-10-20T12:00:00Z');
  const future = new Date('2026-10-30T12:00:00Z');

  it('cuenta actividades vencidas, bloqueadas y las asignadas al usuario', () => {
    const summary = IssuesService.inboxSummary(
      [
        { status: ActivityStatus.EN_CURSO, dueDate: past, assignedUserId: 'me' },
        { status: ActivityStatus.BLOQUEADA, dueDate: future, assignedUserId: 'otro' },
        { status: ActivityStatus.PENDIENTE, dueDate: null, assignedUserId: 'me' },
      ],
      undefined,
      'me',
      now,
    );

    expect(summary).toEqual(
      expect.objectContaining({ openActivities: 3, overdueActivities: 1, blockedActivities: 1, myOpenActivities: 2, returned: false }),
    );
  });

  it('marca como devuelta solo si el último hito del cierre fue una devolución', () => {
    expect(IssuesService.inboxSummary([], { eventType: IssueEventType.DEVOLUCION, createdAt: past }, 'me', now).returned).toBe(true);
    expect(IssuesService.inboxSummary([], { eventType: IssueEventType.SOLICITUD_CIERRE, createdAt: past }, 'me', now).returned).toBe(false);
  });
});
