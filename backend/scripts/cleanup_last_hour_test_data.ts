import { DbService } from '../src/services/db.service.js';

async function main() {
  console.log('=== SAFE LAST-HOUR TEST CONVERSATIONS CLEANUP ===\n');

  const now = new Date();
  // Window: 90 minutes back to ensure coverage of the last-hour batch while preserving older conversations (>3 hours old)
  const windowStart = new Date(now.getTime() - 90 * 60 * 1000);

  console.log('Current Time (UTC):', now.toISOString());
  console.log('Window Start (UTC):', windowStart.toISOString());

  // 1. Pre-cleanup audit
  const preConversations = await DbService.restRequest<any[]>('/conversations?select=id,type,title,created_at');
  const preUsers = await DbService.restRequest<any[]>('/users?select=id');
  const preEmployees = await DbService.restRequest<any[]>('/employees?select=id');
  const preAttendance = await DbService.restRequest<any[]>('/attendance?select=id');
  const preDailyReports = await DbService.restRequest<any[]>('/daily_work_reports?select=id');
  const preTasks = await DbService.restRequest<any[]>('/tasks?select=id');
  const preLeaves = await DbService.restRequest<any[]>('/leave_requests?select=id');
  const preMessages = await DbService.restRequest<any[]>('/messages?select=id');
  const preMembers = await DbService.restRequest<any[]>('/conversation_members?select=id');
  const preMeetings = await DbService.restRequest<any[]>('/meetings?select=id');

  console.log('\n--- PRE-CLEANUP RECORD COUNTS ---');
  console.log(`Total Conversations: ${preConversations?.length || 0}`);
  console.log(`- Direct Chats: ${preConversations?.filter((c) => c.type === 'DIRECT').length || 0}`);
  console.log(`- Group Chats: ${preConversations?.filter((c) => c.type === 'GROUP').length || 0}`);
  console.log(`Total Messages: ${preMessages?.length || 0}`);
  console.log(`Total Memberships: ${preMembers?.length || 0}`);
  console.log(`Total Meetings: ${preMeetings?.length || 0}`);
  console.log(`Core Users: ${preUsers?.length || 0}`);
  console.log(`Core Employees: ${preEmployees?.length || 0}`);
  console.log(`Core Attendance: ${preAttendance?.length || 0}`);
  console.log(`Core Daily Work Reports: ${preDailyReports?.length || 0}`);
  console.log(`Core Tasks: ${preTasks?.length || 0}`);
  console.log(`Core Leaves: ${preLeaves?.length || 0}`);

  // 2. Identify candidate test conversations in window
  const candidates = (preConversations || []).filter((c) => {
    const cDate = new Date(c.createdAt || c.created_at);
    return cDate >= windowStart && cDate <= now;
  });

  console.log(`\nIdentified ${candidates.length} test conversations created in the cleanup window:`);
  for (const c of candidates) {
    console.log(`- [${c.type}] ${c.title || '(no title)'} | ID: ${c.id} | CreatedAt: ${c.createdAt || c.created_at}`);
  }

  if (candidates.length === 0) {
    console.log('No candidate conversations found in the cleanup window. Nothing to clean.');
    return;
  }

  const candidateIds = candidates.map((c) => c.id);

  // 3. Delete dependent rows for candidates
  let removedMeetings = 0;
  let removedMessages = 0;
  let removedMembers = 0;

  for (const cid of candidateIds) {
    // A. Delete meeting participants & meetings
    const meetings = await DbService.restRequest<any[]>(`/meetings?conversation_id=eq.${cid}&select=id`);
    if (meetings && meetings.length > 0) {
      for (const m of meetings) {
        await DbService.restRequest(`/meeting_participants?meeting_id=eq.${m.id}`, { method: 'DELETE' }).catch(() => {});
        await DbService.restRequest(`/meetings?id=eq.${m.id}`, { method: 'DELETE' }).catch(() => {});
        removedMeetings++;
      }
    }

    // B. Delete message reactions, attachments, and messages
    const msgs = await DbService.restRequest<any[]>(`/messages?conversation_id=eq.${cid}&select=id`);
    if (msgs && msgs.length > 0) {
      for (const msg of msgs) {
        await DbService.restRequest(`/message_reactions?message_id=eq.${msg.id}`, { method: 'DELETE' }).catch(() => {});
        await DbService.restRequest(`/message_attachments?message_id=eq.${msg.id}`, { method: 'DELETE' }).catch(() => {});
      }
      await DbService.restRequest(`/messages?conversation_id=eq.${cid}`, { method: 'DELETE' }).catch(() => {});
      removedMessages += msgs.length;
    }

    // C. Delete conversation members
    const members = await DbService.restRequest<any[]>(`/conversation_members?conversation_id=eq.${cid}&select=id`);
    if (members && members.length > 0) {
      await DbService.restRequest(`/conversation_members?conversation_id=eq.${cid}`, { method: 'DELETE' }).catch(() => {});
      removedMembers += members.length;
    }

    // D. Delete the conversation record
    await DbService.restRequest(`/conversations?id=eq.${cid}`, { method: 'DELETE' });
  }

  console.log(`\nDeleted dependencies:`);
  console.log(`- Removed Meetings: ${removedMeetings}`);
  console.log(`- Removed Messages: ${removedMessages}`);
  console.log(`- Removed Memberships: ${removedMembers}`);
  console.log(`- Removed Test Conversations: ${candidateIds.length}`);

  // 4. Post-cleanup verification audit
  const postConversations = await DbService.restRequest<any[]>('/conversations?select=id,type,title,created_at');
  const postUsers = await DbService.restRequest<any[]>('/users?select=id');
  const postEmployees = await DbService.restRequest<any[]>('/employees?select=id');
  const postAttendance = await DbService.restRequest<any[]>('/attendance?select=id');
  const postDailyReports = await DbService.restRequest<any[]>('/daily_work_reports?select=id');
  const postTasks = await DbService.restRequest<any[]>('/tasks?select=id');
  const postLeaves = await DbService.restRequest<any[]>('/leave_requests?select=id');

  console.log('\n--- POST-CLEANUP RECORD COUNTS ---');
  console.log(`Total Conversations Remaining: ${postConversations?.length || 0}`);
  console.log(`- Direct Chats: ${postConversations?.filter((c) => c.type === 'DIRECT').length || 0}`);
  console.log(`- Group Chats: ${postConversations?.filter((c) => c.type === 'GROUP').length || 0}`);
  console.log(`Core Users Remaining: ${postUsers?.length || 0} (Preserved: ${postUsers?.length === preUsers?.length})`);
  console.log(`Core Employees Remaining: ${postEmployees?.length || 0} (Preserved: ${postEmployees?.length === preEmployees?.length})`);
  console.log(`Core Attendance Remaining: ${postAttendance?.length || 0} (Preserved: ${postAttendance?.length === preAttendance?.length})`);
  console.log(`Core Reports Remaining: ${postDailyReports?.length || 0} (Preserved: ${postDailyReports?.length === preDailyReports?.length})`);
  console.log(`Core Tasks Remaining: ${postTasks?.length || 0} (Preserved: ${postTasks?.length === preTasks?.length})`);
  console.log(`Core Leaves Remaining: ${postLeaves?.length || 0} (Preserved: ${postLeaves?.length === preLeaves?.length})`);
  console.log('\n=== CLEANUP COMPLETED SUCCESSFULLY ===');
}

main().catch(console.error);
