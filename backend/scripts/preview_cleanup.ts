import { DbService } from '../src/services/db.service.js';

async function main() {
  console.log('=== ACCURATE DB AUDIT WITH CAMELCASE PROPERTIES ===\n');

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  console.log('Current Server Time (UTC):', now.toISOString());
  console.log('1 Hour Ago (UTC):', oneHourAgo.toISOString());
  console.log('6 Hours Ago (UTC):', sixHoursAgo.toISOString());
  console.log('24 Hours Ago (UTC):', twentyFourHoursAgo.toISOString());

  // 1. Audit Conversations with full details
  const allConversations = await DbService.restRequest<any[]>(
    '/conversations?select=id,type,title,created_by,created_at,updated_at&order=created_at.desc'
  );

  console.log(`\nTotal Conversations in DB: ${allConversations?.length || 0}`);

  console.log('\n--- ALL CONVERSATIONS LIST (TIMESTAMPS) ---');
  let lastHourCount = 0;
  let last6HourCount = 0;
  let last24HourCount = 0;

  for (const c of allConversations || []) {
    const cDate = new Date(c.createdAt || c.created_at);
    const ageMinutes = Math.round((now.getTime() - cDate.getTime()) / 60000);
    const isLast1h = cDate >= oneHourAgo;
    const isLast6h = cDate >= sixHoursAgo;
    const isLast24h = cDate >= twentyFourHoursAgo;

    if (isLast1h) lastHourCount++;
    if (isLast6h) last6HourCount++;
    if (isLast24h) last24HourCount++;

    const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${c.id}&select=id`);
    const messages = await DbService.restRequest<any[]>(`/messages?conversation_id=eq.${c.id}&select=id`);
    const meetings = await DbService.restRequest<any[]>(`/meetings?conversation_id=eq.${c.id}&select=id`);

    console.log({
      id: c.id,
      type: c.type,
      title: c.title,
      createdAt: cDate.toISOString(),
      ageMinutes: `${ageMinutes} mins ago`,
      isLastHour: isLast1h,
      members: members?.length || 0,
      messages: messages?.length || 0,
      meetings: meetings?.length || 0,
    });
  }

  console.log(`\nConversation Summary by Window:`);
  console.log(`- Last 1 Hour: ${lastHourCount}`);
  console.log(`- Last 6 Hours: ${last6HourCount}`);
  console.log(`- Last 24 Hours: ${last24HourCount}`);
  console.log(`- Total: ${allConversations?.length || 0}`);

  // 2. Audit Notifications
  const allNotifications = await DbService.restRequest<any[]>(
    '/notifications?select=id,user_id,type,title,message,is_read,created_at&order=created_at.desc&limit=50'
  );

  console.log('\n--- RECENT NOTIFICATIONS SAMPLES ---');
  for (const n of (allNotifications || []).slice(0, 15)) {
    const nDate = new Date(n.createdAt || n.created_at);
    const ageMinutes = Math.round((now.getTime() - nDate.getTime()) / 60000);
    console.log({
      id: n.id,
      title: n.title,
      type: n.type,
      createdAt: nDate.toISOString(),
      ageMinutes: `${ageMinutes} mins ago`,
      isRead: n.isRead ?? n.is_read,
    });
  }
}

main().catch(console.error);
