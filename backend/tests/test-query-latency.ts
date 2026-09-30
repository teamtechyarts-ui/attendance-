import { performance } from 'perf_hooks';
import { DbService } from '../src/services/db.service.js';
import { prisma } from '../src/plugins/prisma.js';

async function testQuerySpeed() {
  console.log('--- Measuring Query Speed ---');

  // Query 1: with Prisma attempt first (before fix)
  const t1 = performance.now();
  try {
    await DbService.query(
      async () => prisma.user.findMany({ take: 5 }),
      async () => DbService.restRequest('/users?limit=5')
    );
  } catch (e) {}
  const d1 = Math.round(performance.now() - t1);
  console.log(`Query 1 (Prisma attempt -> error -> fallback): ${d1}ms`);

  // Query 2: Direct REST
  const t2 = performance.now();
  await DbService.restRequest('/users?limit=5');
  const d2 = Math.round(performance.now() - t2);
  console.log(`Query 2 (Direct Supabase REST): ${d2}ms`);
}

testQuerySpeed().catch(console.error).finally(() => process.exit(0));
