import { DbService } from '../src/services/db.service.js';
import { prisma } from '../src/plugins/prisma.js';

async function check() {
  try {
    const scheds = await DbService.query(
      () => prisma.workSchedule.findMany(),
      () => DbService.restRequest('/work_schedules')
    );
    console.log('=== WORK SCHEDULES ===', JSON.stringify(scheds, null, 2));
  } catch (err) {
    console.error('Error during check:', err);
  } finally {
    process.exit(0);
  }
}
check();
