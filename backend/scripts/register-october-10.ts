import { HolidayService } from '../src/modules/calendar/holiday.service.js';
import { WorkdayService } from '../src/services/workday.service.js';
import { DbService } from '../src/services/db.service.js';
import { prisma } from '../src/plugins/prisma.js';

async function main() {
  console.log('=== STEP 1: INSPECT CURRENT STATE BEFORE REGISTRATION ===');
  const existingHols = await HolidayService.getHolidays(2026);
  console.log('Existing 2026 holidays:', JSON.stringify(existingHols, null, 2));

  const existingOct10 = await HolidayService.getHolidayByDate('2026-10-10');
  console.log('Existing holiday for 2026-10-10:', JSON.stringify(existingOct10, null, 2));

  console.log('\n=== STEP 2: REGISTER OCTOBER 10, 2026 HOLIDAY ===');
  const adminUser = {
    id: '2be7499c-34f2-4873-a8b1-f594711a8de6',
    role: 'SUPER_ADMIN' as const,
    email: 'admin@techyarts.com',
  };

  const registered = await HolidayService.registerHoliday(
    {
      date: '2026-10-10',
      name: 'Holiday Day',
      description: 'Official Company Holiday',
      isOptional: false,
    },
    adminUser
  );
  console.log('Registered holiday result:', JSON.stringify(registered, null, 2));

  console.log('\n=== STEP 3: DUPLICATE REGISTRATION IDEMPOTENCY CHECK ===');
  const duplicateAttempt = await HolidayService.registerHoliday(
    {
      date: '2026-10-10',
      name: 'Holiday Day',
      description: 'Official Company Holiday',
      isOptional: false,
    },
    adminUser
  );
  console.log('Duplicate registration attempt result (id should match):', JSON.stringify(duplicateAttempt, null, 2));

  const allOct10Hols = await DbService.query(
    () => prisma.holiday.findMany({
      where: {
        holidayDate: {
          gte: new Date('2026-10-10T00:00:00.000Z'),
          lte: new Date('2026-10-10T23:59:59.999Z'),
        },
      },
    }),
    () => DbService.restRequest<any[]>('/holidays?holiday_date=eq.2026-10-10')
  );
  console.log('Total count of holidays for 2026-10-10 in DB:', allOct10Hols?.length);

  console.log('\n=== STEP 4: VERIFY ATTENDANCE HOLIDAY LOOKUP ===');
  const emp = await DbService.query(
    () => prisma.employee.findFirst({ where: { employmentStatus: 'ACTIVE' } }),
    async () => {
      const emps = await DbService.restRequest<any[]>('/employees?employment_status=eq.ACTIVE');
      return emps?.[0] || null;
    }
  );

  if (emp) {
    const workdayEval = await WorkdayService.evaluateDayForEmployee(emp.id, '2026-10-10');
    console.log('WorkdayService evaluation for active employee on 2026-10-10:', JSON.stringify(workdayEval, null, 2));

    const rangeEval = await WorkdayService.evaluateDateRange([emp.id], '2026-10-01', '2026-10-31');
    const empRange = rangeEval.get(emp.id);
    const oct10FromRange = empRange?.get('2026-10-10');
    console.log('WorkdayService range evaluation for 2026-10-10:', JSON.stringify(oct10FromRange, null, 2));
  }

  console.log('\n=== STEP 5: VERIFY CALENDAR EVENT IN DB ===');
  const calendarEvents = await DbService.query(
    () => prisma.calendarEvent.findMany({
      where: {
        startAt: {
          gte: new Date('2026-10-10T00:00:00.000Z'),
          lte: new Date('2026-10-10T23:59:59.999Z'),
        },
      },
    }),
    () => DbService.restRequest<any[]>('/calendar_events?start_at=gte.2026-10-10T00:00:00.000Z&start_at=lte.2026-10-10T23:59:59.999Z')
  );
  console.log('Calendar events on 2026-10-10:', JSON.stringify(calendarEvents, null, 2));
}

main().catch((err) => {
  console.error('Registration failed:', err);
  process.exit(1);
});
