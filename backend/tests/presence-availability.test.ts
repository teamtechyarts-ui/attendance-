import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PresenceService } from '../src/modules/collaboration/presence.service.js';

describe('Availability Status & Presence Independence Test Suite', () => {
  const testUserId1 = 'aaaaaaaa-1111-4444-8888-111111111111';
  const testUserId2 = 'bbbbbbbb-2222-4444-8888-222222222222';

  test('TEST 1: Fresh user defaults to AVAILABLE availability status', async () => {
    const presence = await PresenceService.getPresence(testUserId1);
    assert.equal(presence.status, 'AVAILABLE', 'Fresh user default status should be AVAILABLE');
    assert.equal(presence.userId, testUserId1);
  });

  test('TEST 2: Explicitly selecting AWAY persists in database and cache', async () => {
    const updated = await PresenceService.setUserStatus(testUserId1, 'AWAY', 'Stepped out for lunch');
    assert.equal(updated.status, 'AWAY');
    assert.equal(updated.customStatusMessage, 'Stepped out for lunch');

    const fetched = await PresenceService.getPresence(testUserId1);
    assert.equal(fetched.status, 'AWAY');
    assert.equal(fetched.customStatusMessage, 'Stepped out for lunch');
  });

  test('TEST 3: WebSocket connect / reconnect does NOT overwrite user-selected AWAY to AVAILABLE', async () => {
    // Simulate fake WS socket
    const mockSocket: any = {
      readyState: 1,
      send: () => {},
    };

    const connectedPresence = await PresenceService.registerConnection(testUserId1, 'conn_tab_1', mockSocket);
    assert.equal(connectedPresence.status, 'AWAY', 'Reconnecting must retain user-selected AWAY status');

    const fetched = await PresenceService.getPresence(testUserId1);
    assert.equal(fetched.status, 'AWAY', 'Presence in service must remain AWAY');
  });

  test('TEST 4: WebSocket disconnect does NOT overwrite user-selected status to OFFLINE or AWAY', async () => {
    // Unregister connection
    PresenceService.unregisterConnection(testUserId1, 'conn_tab_1', 0);

    // Wait a brief tick for unregister grace timer
    await new Promise((resolve) => setTimeout(resolve, 50));

    const postDisconnectPresence = await PresenceService.getPresence(testUserId1);
    assert.equal(postDisconnectPresence.status, 'AWAY', 'Disconnecting must preserve user-selected AWAY status');
    assert.equal(PresenceService.isUserOnline(testUserId1), false, 'isOnline must be false when disconnected');
  });

  test('TEST 5: Explicitly selecting AVAILABLE persists across reconnects', async () => {
    const updated = await PresenceService.setUserStatus(testUserId2, 'AVAILABLE', null);
    assert.equal(updated.status, 'AVAILABLE');

    const mockSocket: any = {
      readyState: 1,
      send: () => {},
    };

    const registered = await PresenceService.registerConnection(testUserId2, 'conn_user2_tab1', mockSocket);
    assert.equal(registered.status, 'AVAILABLE');

    // Heartbeat does not mutate status
    await PresenceService.handleHeartbeat(testUserId2, 'conn_user2_tab1', true);
    const postHeartbeat = await PresenceService.getPresence(testUserId2);
    assert.equal(postHeartbeat.status, 'AVAILABLE', 'Heartbeat/idle must not mutate user-selected status');

    PresenceService.unregisterConnection(testUserId2, 'conn_user2_tab1', 0);
  });
});
