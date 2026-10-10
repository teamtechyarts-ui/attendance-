import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkOutSchema, bulkDeleteNotificationsSchema } from '../src/validation/index.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';
import { DateTimeUtil } from '../src/utils/datetime.js';

describe('Phase 5 Tests: Mandatory Checkout Daily Work Report & Notification Deletion Fixes', () => {
  let testUserA: any;
  let testUserB: any;
  let testEmployeeA: any;
  const createdNotificationIds: string[] = [];

  before(async () => {
    // Find or setup real test users and employees
    const users = await DbService.query(
      async () =>
        prisma.user.findMany({
          take: 5,
          include: { employee: true },
        }),
      async () =>
        DbService.restRequest<any[]>('/users?limit=5&select=*,employee:employees(*)')
    );

    if (users && users.length >= 2) {
      testUserA = users[0];
      testUserB = users[1];
      testEmployeeA = users[0].employee || (users[0].employees && users[0].employees[0]) || null;
    } else if (users && users.length === 1) {
      testUserA = users[0];
      testUserB = users[0];
      testEmployeeA = users[0].employee || (users[0].employees && users[0].employees[0]) || null;
    }
  });

  after(async () => {
    // Clean up notifications
    for (const id of createdNotificationIds) {
      if (testUserA?.id) {
        await NotificationService.deleteNotification(id, testUserA.id).catch(() => {});
      }
      if (testUserB?.id) {
        await NotificationService.deleteNotification(id, testUserB.id).catch(() => {});
      }
    }
  });

  describe('Feature 1: Mandatory Daily Work Report Validation (>= 100 Trimmed Chars)', () => {
    test('Schema: Missing daily work report is REJECTED', () => {
      assert.throws(
        () => {
          checkOutSchema.parse({});
        },
        (err: any) => {
          return err.issues?.some((i: any) =>
            i.message.includes('Daily work report is required (minimum 100 characters)')
          );
        }
      );
    });

    test('Schema: Empty string report is REJECTED', () => {
      assert.throws(
        () => {
          checkOutSchema.parse({ dailyWorkReport: '' });
        },
        (err: any) => {
          return err.issues?.some((i: any) =>
            i.message.includes('Daily work report is required (minimum 100 characters)')
          );
        }
      );
    });

    test('Schema: Whitespace-only report is REJECTED', () => {
      assert.throws(
        () => {
          checkOutSchema.parse({ dailyWorkReport: '                          ' });
        },
        (err: any) => {
          return err.issues?.some((i: any) =>
            i.message.includes('Daily work report is required (minimum 100 characters)')
          );
        }
      );
    });

    test('Schema: 99 trimmed characters is REJECTED', () => {
      const shortReport = 'a'.repeat(99);
      assert.throws(
        () => {
          checkOutSchema.parse({ dailyWorkReport: shortReport });
        },
        (err: any) => {
          return err.issues?.some((i: any) =>
            i.message.includes('Daily work report is required (minimum 100 characters)')
          );
        }
      );
    });

    test('Schema: 99 characters with leading/trailing whitespace padded to 105 is REJECTED (whitespace cannot satisfy minimum)', () => {
      const paddedShort = '   ' + 'b'.repeat(99) + '   ';
      assert.throws(
        () => {
          checkOutSchema.parse({ dailyWorkReport: paddedShort });
        },
        (err: any) => {
          return err.issues?.some((i: any) =>
            i.message.includes('Daily work report is required (minimum 100 characters)')
          );
        }
      );
    });

    test('Schema: Exactly 100 trimmed characters is ACCEPTED', () => {
      const exact100 = 'x'.repeat(100);
      const parsed = checkOutSchema.parse({ dailyWorkReport: exact100 });
      assert.equal(parsed.dailyWorkReport.length, 100);
      assert.equal(parsed.dailyWorkReport, exact100);
    });

    test('Schema: More than 100 characters with leading/trailing spaces is trimmed and ACCEPTED', () => {
      const content = 'Completed the API authentication refactor, added integration test suite, and fixed notification deletion.';
      assert.ok(content.length >= 100);
      const withSpaces = `   ${content}   `;
      const parsed = checkOutSchema.parse({ dailyWorkReport: withSpaces });
      assert.equal(parsed.dailyWorkReport, content);
    });

    test('Schema: Alternative field names (report / description) are normalized to dailyWorkReport', () => {
      const content = 'Completed the API authentication refactor, added integration test suite, and fixed notification deletion.';
      const parsed1 = checkOutSchema.parse({ report: content });
      assert.equal(parsed1.dailyWorkReport, content);

      const parsed2 = checkOutSchema.parse({ description: content });
      assert.equal(parsed2.dailyWorkReport, content);
    });
  });

  describe('Feature 2: Single Notification Deletion Fix & Security', () => {
    test('Creates unread notification and deletes it successfully', async () => {
      if (!testUserA?.id) return;

      const notif = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'SYSTEM',
        title: 'Test Notification Single Delete',
        message: 'This notification will be deleted in test.',
      });

      assert.ok(notif?.id);
      const notifId = notif.id;

      // Check it exists in list
      const beforeList = await NotificationService.getNotifications({ userId: testUserA.id, limit: 50 });
      assert.ok(beforeList.items.some((n: any) => n.id === notifId));

      // Delete it
      const deleted = await NotificationService.deleteNotification(notifId, testUserA.id);
      assert.equal(deleted, true);

      // Verify it is gone from database
      const afterList = await NotificationService.getNotifications({ userId: testUserA.id, limit: 50 });
      assert.equal(afterList.items.some((n: any) => n.id === notifId), false);
    });

    test('Deleting non-existent notification returns false safely', async () => {
      if (!testUserA?.id) return;
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const deleted = await NotificationService.deleteNotification(fakeId, testUserA.id);
      assert.equal(deleted, false);
    });

    test('Notification Ownership Security: User B cannot delete User A notification', async () => {
      if (!testUserA?.id || !testUserB?.id || testUserA.id === testUserB.id) return;

      const notif = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'TASK_ASSIGNED',
        title: 'User A Private Notification',
        message: 'User B must not be able to delete this.',
      });

      assert.ok(notif?.id);
      createdNotificationIds.push(notif.id);

      // User B attempts to delete User A's notification
      const userBDeleteAttempt = await NotificationService.deleteNotification(notif.id, testUserB.id);
      assert.equal(userBDeleteAttempt, false, 'User B must not be able to delete User A notification');

      // Verify notification is still intact for User A
      const userAList = await NotificationService.getNotifications({ userId: testUserA.id, limit: 50 });
      assert.ok(userAList.items.some((n: any) => n.id === notif.id), 'User A notification must still exist');
    });
  });

  describe('Feature 3: Bulk Notification Deletion', () => {
    test('Bulk delete validation schema validates UUID array', () => {
      assert.throws(() => {
        bulkDeleteNotificationsSchema.parse({ ids: [] });
      });

      const valid = bulkDeleteNotificationsSchema.parse({
        ids: ['a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'b1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5e'],
      });
      assert.equal(valid.ids.length, 2);
    });

    test('Bulk delete deletes multiple notifications in one operation', async () => {
      if (!testUserA?.id) return;

      const n1 = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'SYSTEM',
        title: 'Bulk Delete Target 1',
        message: 'Message 1 for bulk delete',
      });
      const n2 = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'SYSTEM',
        title: 'Bulk Delete Target 2',
        message: 'Message 2 for bulk delete',
      });
      const n3 = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'SYSTEM',
        title: 'Bulk Delete Target 3',
        message: 'Message 3 for bulk delete',
      });

      assert.ok(n1?.id && n2?.id && n3?.id);
      const targetIds = [n1.id, n2.id, n3.id];

      // Perform bulk delete
      const result = await NotificationService.bulkDeleteNotifications(targetIds, testUserA.id);
      assert.equal(result.deletedCount, 3);
      assert.equal(result.deletedIds.length, 3);

      // Verify all 3 are gone
      const list = await NotificationService.getNotifications({ userId: testUserA.id, limit: 50 });
      assert.equal(list.items.some((n: any) => targetIds.includes(n.id)), false);
    });

    test('Bulk delete filters out unauthorized/other user IDs', async () => {
      if (!testUserA?.id || !testUserB?.id || testUserA.id === testUserB.id) return;

      const notifA = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'ATTENDANCE_REMINDER',
        title: 'User A Notification for Bulk Scope Test',
        message: 'Belongs to User A',
      });

      const notifB = await NotificationService.createNotification({
        userId: testUserB.id,
        type: 'ATTENDANCE_REMINDER',
        title: 'User B Notification for Bulk Scope Test',
        message: 'Belongs to User B',
      });

      assert.ok(notifA?.id && notifB?.id);
      createdNotificationIds.push(notifB.id);

      // User A submits bulk delete with both notifA.id and notifB.id
      const mixedIds = [notifA.id, notifB.id];
      const result = await NotificationService.bulkDeleteNotifications(mixedIds, testUserA.id);

      // Only notifA should be deleted
      assert.equal(result.deletedCount, 1);
      assert.ok(result.deletedIds.includes(notifA.id));
      assert.equal(result.deletedIds.includes(notifB.id), false);

      // User B notification must still exist
      const userBList = await NotificationService.getNotifications({ userId: testUserB.id, limit: 50 });
      assert.ok(userBList.items.some((n: any) => n.id === notifB.id));
    });

    test('Delete All: deleteAllNotifications deletes all notifications scoped to the user', async () => {
      if (!testUserA?.id) return;

      const n1 = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'SYSTEM',
        title: 'Delete All Target 1',
        message: 'Message for delete all test 1',
      });
      const n2 = await NotificationService.createNotification({
        userId: testUserA.id,
        type: 'SYSTEM',
        title: 'Delete All Target 2',
        message: 'Message for delete all test 2',
      });

      assert.ok(n1?.id && n2?.id);

      const res = await NotificationService.deleteAllNotifications(testUserA.id);
      assert.ok(res.deletedCount >= 2);

      const listAfter = await NotificationService.getNotifications({ userId: testUserA.id, limit: 50 });
      assert.equal(listAfter.items.some((n: any) => n.id === n1.id || n.id === n2.id), false);
    });
  });
});
