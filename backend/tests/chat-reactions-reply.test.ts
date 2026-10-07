import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { ChatService } from '../src/modules/collaboration/chat.service.js';
import { DbService } from '../src/services/db.service.js';

describe('Chat Reactions Uniqueness & Reply Relationships Test Suite', () => {
  let app: FastifyInstance;
  let userPavanId: string;
  let userSuperAdminId: string;
  let userSushmaId: string;
  let conv1Id: string;
  let conv2Id: string;
  let messageAId: string;

  before(async () => {
    DbService.forceRestFallback(true);
    app = await buildApp();
    await app.ready();

    userPavanId = '11111111-1111-1111-1111-111111111111';
    userSuperAdminId = '22222222-2222-2222-2222-222222222222';
    userSushmaId = '33333333-3333-3333-3333-333333333333';

    // Create Group Conversation 1
    const group1 = await ChatService.createGroupConversation(
      userPavanId,
      'Test Dev Team',
      'Discussion room',
      [userSuperAdminId, userSushmaId]
    );
    conv1Id = group1.id;

    // Create Group Conversation 2 (for cross-conversation tests)
    const group2 = await ChatService.createGroupConversation(
      userPavanId,
      'Other Team',
      'Other discussion room',
      [userSuperAdminId]
    );
    conv2Id = group2.id;

    // Send Message A in Conversation 1
    const msgA = await ChatService.sendMessage(userPavanId, conv1Id, 'Hello Team!');
    messageAId = msgA.id;
  });

  describe('Part 1: Reaction Uniqueness per User per Message', () => {
    test('TEST 1: User Pavan adds ❤️ reaction -> Reaction is created', async () => {
      const res = await ChatService.toggleReaction(userPavanId, messageAId, '❤️');
      assert.equal(res.messageId, messageAId);
      assert.equal(res.reactions.length, 1);
      assert.equal(res.reactions[0].userId, userPavanId);
      assert.equal(res.reactions[0].reaction, '❤️');
    });

    test('TEST 2: User Pavan selects 😂 -> Replaces previous ❤️ with 😂 (Only 1 reaction for Pavan)', async () => {
      const res = await ChatService.toggleReaction(userPavanId, messageAId, '😂');
      assert.equal(res.reactions.length, 1, 'Should contain only 1 reaction for Pavan, not 2');
      assert.equal(res.reactions[0].userId, userPavanId);
      assert.equal(res.reactions[0].reaction, '😂');
    });

    test('TEST 3: User Pavan selects 👍 -> Replaces previous 😂 with 👍', async () => {
      const res = await ChatService.toggleReaction(userPavanId, messageAId, '👍');
      assert.equal(res.reactions.length, 1);
      assert.equal(res.reactions[0].userId, userPavanId);
      assert.equal(res.reactions[0].reaction, '👍');
    });

    test('TEST 4: User Pavan clicks 👍 again -> Toggles off / removes reaction completely', async () => {
      const res = await ChatService.toggleReaction(userPavanId, messageAId, '👍');
      assert.equal(res.reactions.length, 0, 'Reaction should be removed when same emoji is clicked again');
    });

    test('TEST 5: Multiple users react independently without interfering', async () => {
      // Pavan reacts 😂
      await ChatService.toggleReaction(userPavanId, messageAId, '😂');
      // Super Admin reacts 😂
      await ChatService.toggleReaction(userSuperAdminId, messageAId, '😂');
      // Sushma reacts ❤️
      const res = await ChatService.toggleReaction(userSushmaId, messageAId, '❤️');

      assert.equal(res.reactions.length, 3);
      const pavanRx = res.reactions.find((r) => r.userId === userPavanId);
      const adminRx = res.reactions.find((r) => r.userId === userSuperAdminId);
      const sushmaRx = res.reactions.find((r) => r.userId === userSushmaId);

      assert.equal(pavanRx?.reaction, '😂');
      assert.equal(adminRx?.reaction, '😂');
      assert.equal(sushmaRx?.reaction, '❤️');

      // Now Pavan switches from 😂 to 👍
      const updatedRes = await ChatService.toggleReaction(userPavanId, messageAId, '👍');
      assert.equal(updatedRes.reactions.length, 3);
      const newPavanRx = updatedRes.reactions.find((r) => r.userId === userPavanId);
      assert.equal(newPavanRx?.reaction, '👍');
    });
  });

  describe('Part 2: Real Message Reply and Cross-Conversation Protection', () => {
    let replyMsgBId: string;

    test('TEST 6: Super Admin replies to Message A in same conversation -> replyToMessageId and replyTo metadata populated', async () => {
      const replyMsg = await ChatService.sendMessage(
        userSuperAdminId,
        conv1Id,
        'I am on it!',
        messageAId
      );

      replyMsgBId = replyMsg.id;
      assert.equal(replyMsg.replyToMessageId, messageAId);
      assert.ok(replyMsg.replyTo, 'replyTo object should be populated');
      assert.equal(replyMsg.replyTo?.id, messageAId);
      assert.equal(replyMsg.replyTo?.body, 'Hello Team!');
    });

    test('TEST 7: Reply to a Reply (Message C replies to Message B) -> references Message B directly', async () => {
      const replyToReply = await ChatService.sendMessage(
        userSushmaId,
        conv1Id,
        'Great, thanks!',
        replyMsgBId
      );

      assert.equal(replyToReply.replyToMessageId, replyMsgBId);
      assert.ok(replyToReply.replyTo);
      assert.equal(replyToReply.replyTo?.id, replyMsgBId);
      assert.equal(replyToReply.replyTo?.body, 'I am on it!');
    });

    test('TEST 8: Cross-conversation reply protection -> Rejects reply if message belongs to another conversation', async () => {
      await assert.rejects(
        async () => {
          // Attempt to reply in conv2 using messageAId (which belongs to conv1)
          await ChatService.sendMessage(
            userPavanId,
            conv2Id,
            'This should fail',
            messageAId
          );
        },
        {
          statusCode: 400,
        }
      );
    });
  });
});
