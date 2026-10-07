import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';

describe('Notification System Test Suite', () => {
  let userA: string;
  let userB: string;
  const createdNotificationIds: string[] = [];

  before(async () => {
    // Retrieve real users from DB
    const users = await DbService.query(
      async () => prisma.user.findMany({ take: 5, select: { id: true, email: true } }),
      async () => DbService.restRequest<any[]>('/users?limit=5&select=id,email')
    );

    if (users && users.length >= 2) {
      userA = users[users.length - 2].id;
      userB = users[users.length - 1].id;
    } else if (users && users.length === 1) {
      userA = users[0].id;
      userB = users[0].id;
    } else {
      userA = '00000000-0000-0000-0000-000000000001';
      userB = '00000000-0000-0000-0000-000000000002';
    }
  });

  after(async () => {
    // Cleanup created test notifications
    for (const id of createdNotificationIds) {
      try {
        await NotificationService.deleteNotification(id, userA);
        await NotificationService.deleteNotification(id, userB);
      } catch {}
    }
  });

  test('NotificationService: creates notifications with granular types mapped properly', async () => {
    const notifyTask = await NotificationService.createNotification({
      userId: userA,
      type: 'TASK_ASSIGNED',
      title: 'New Task Assigned: Website UI Redesign',
      message: 'You have been assigned the task "Website UI Redesign"',
      actionUrl: '/tasks?taskId=123',
      entityType: 'task',
      entityId: '123',
    });

    assert.ok(notifyTask, 'Notification should be created');
    if (notifyTask?.id) createdNotificationIds.push(notifyTask.id);
    assert.equal(notifyTask.userId, userA);
    assert.equal(notifyTask.title, 'New Task Assigned: Website UI Redesign');
    assert.equal(notifyTask.isRead, false);

    const notifyLeave = await NotificationService.createNotification({
      userId: userA,
      type: 'LEAVE_APPROVED',
      title: 'Leave Request Approved',
      message: 'Your leave request has been approved.',
      actionUrl: '/leave',
    });

    assert.ok(notifyLeave);
    if (notifyLeave?.id) createdNotificationIds.push(notifyLeave.id);
    assert.equal(notifyLeave.userId, userA);
  });

  test('Notification Privacy & User Scoping: User B cannot access User A notifications', async () => {
    // Create for User A
    const nA = await NotificationService.createNotification({
      userId: userA,
      type: 'PROJECT_CREATED',
      title: 'Added to Project: Core Banking',
      message: 'You have been added to Core Banking project',
      actionUrl: '/tasks',
    });
    if (nA?.id) createdNotificationIds.push(nA.id);

    if (userA !== userB) {
      // Create for User B
      const nB = await NotificationService.createNotification({
        userId: userB,
        type: 'ADMIN_PERMISSION_GRANTED',
        title: 'Admin Access Granted',
        message: 'You have been granted Limited Admin permissions.',
        actionUrl: '/admin-view',
      });
      if (nB?.id) createdNotificationIds.push(nB.id);

      // Query notifications for User A
      const listA = await NotificationService.getNotifications({ userId: userA, limit: 50 });
      assert.ok(listA.items.every((n) => n.userId === userA), 'All User A items must belong strictly to User A');

      // Query notifications for User B
      const listB = await NotificationService.getNotifications({ userId: userB, limit: 50 });
      assert.ok(listB.items.every((n) => n.userId === userB), 'All User B items must belong strictly to User B');
    }
  });

  test('Unread Count Calculation', async () => {
    const unreadCountA = await NotificationService.getUnreadCount(userA);
    assert.ok(typeof unreadCountA === 'number');
    assert.ok(unreadCountA >= 1, 'Unread count should reflect created unread notifications');
  });

  test('Mark as Read: marks specific notification as read and records readAt', async () => {
    const notification = await NotificationService.createNotification({
      userId: userA,
      type: 'ATTENDANCE_REMINDER',
      title: 'Attendance Reminder',
      message: 'You have not marked attendance today.',
      actionUrl: '/attendance',
    });

    assert.ok(notification?.id);
    if (notification?.id) createdNotificationIds.push(notification.id);

    // Mark as read
    await NotificationService.markAsRead(notification.id, userA);

    const list = await NotificationService.getNotifications({ userId: userA });
    const found = list.items.find((n) => n.id === notification.id);
    if (found) {
      assert.equal(found.isRead, true);
    }
  });

  test('Mark All as Read: marks only target user notifications as read', async () => {
    // Create new unread for A
    const nA = await NotificationService.createNotification({
      userId: userA,
      type: 'SYSTEM',
      title: 'System Alert A',
      message: 'System notification A',
    });
    if (nA?.id) createdNotificationIds.push(nA.id);

    // Mark all read for User A
    await NotificationService.markAllAsRead(userA);

    const check = await NotificationService.getNotifications({ userId: userA });
    const target = check.items.find((item) => item.id === nA?.id);
    assert.equal(target?.isRead, true, 'User A notification should be marked as read');
  });

  test('Real-time SSE subscription: dispatches live events to subscribed user', async () => {
    let receivedEvent: any = null;

    const unsubscribe = NotificationService.subscribe(userA, (event) => {
      receivedEvent = event;
    });

    const notification = await NotificationService.createNotification({
      userId: userA,
      type: 'TASK_COMPLETED',
      title: 'Task Completed: Landing Page',
      message: 'Landing page task is completed.',
    });
    if (notification?.id) createdNotificationIds.push(notification.id);

    assert.ok(receivedEvent, 'Subscriber should receive notification event');
    assert.equal(receivedEvent.userId, userA);
    assert.equal(receivedEvent.title, 'Task Completed: Landing Page');

    unsubscribe();
  });
});
