import { prisma } from '../src/plugins/prisma.js';
import { DbService } from '../src/services/db.service.js';
import { config } from '../src/config/env.js';

async function main() {
  console.log('--- DATABASE CONNECTION INSPECTION ---');
  console.log('Supabase URL configured:', config.supabaseUrl ? 'YES' : 'NO');
  console.log('DATABASE_URL configured:', process.env.DATABASE_URL ? 'YES' : 'NO');
  
  try {
    const tables: any = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('Existing Public Tables in PostgreSQL:', tables.map((t: any) => t.table_name));
  } catch (err: any) {
    console.error('Prisma $queryRaw failed:', err.message);
  }

  try {
    const testUserIds = [
      'c9bc2a6a-f57d-4202-9016-6b39b652cc2b', // Sushma
      'c651fe23-beb3-4bfb-ab5f-ae9146091d8e', // Pavan
      '5d7ae756-05ae-4439-a49c-0e4d70593bea', // A Sai Praneeth
      '2be7499c-34f2-4873-a8b1-f594711a8de6', // Super Admin
    ];

    for (const uId of testUserIds) {
      const [users, emps] = await Promise.all([
        DbService.restRequest<any[]>(`/users?id=eq.${uId}&limit=1`).catch(() => []),
        DbService.restRequest<any[]>(`/employees?user_id=eq.${uId}&limit=1`).catch(() => []),
      ]);
      const u = users?.[0];
      const e = emps?.[0];
      const name = e ? `${e.first_name || e.firstName || ''} ${e.last_name || e.lastName || ''}`.trim() : (u?.role === 'SUPER_ADMIN' ? 'Super Admin' : u?.email);
      console.log(`User ID [${uId}] -> Resolved Display Name: "${name}" (Email: ${u?.email})`);
    }
  } catch (err: any) {
    console.error('Identity resolution test failed:', err.message);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
