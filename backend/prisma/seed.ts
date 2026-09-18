import argon2 from 'argon2';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vyatjymswwbwsncfimke.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'sb_secret_2V9Nq1HgYwMzYDUUScjmKw_imGi0X3n';

async function rest(path: string, options: any = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text();
    console.warn(`[Seed REST] ${path} returned ${res.status}:`, txt);
    return null;
  }
  if (res.status === 204) return [];
  return await res.json();
}

async function seed() {
  console.log('🌱 Seeding default Super Admin & initial reference data...');

  // 1. Check/Create Departments
  const existingDepts = await rest('/departments?select=*');
  let engineeringDeptId = existingDepts?.[0]?.id;

  if (!existingDepts || existingDepts.length === 0) {
    console.log('Creating departments...');
    const depts = await rest('/departments', {
      method: 'POST',
      body: [
        { name: 'Engineering', description: 'Software & Technology', is_active: true },
        { name: 'Product & Design', description: 'Product, UI/UX Design', is_active: true },
        { name: 'Operations & HR', description: 'Human Resources & Ops', is_active: true },
        { name: 'Marketing', description: 'Growth & Marketing', is_active: true },
      ],
    });
    engineeringDeptId = depts?.[0]?.id;
  }

  // 2. Check/Create Designations
  const existingDesigs = await rest('/designations?select=*');
  let leadDesigId = existingDesigs?.[0]?.id;

  if (!existingDesigs || existingDesigs.length === 0) {
    console.log('Creating designations...');
    const desigs = await rest('/designations', {
      method: 'POST',
      body: [
        { name: 'Principal Architect', description: 'Technical Leadership', is_active: true },
        { name: 'Senior Full Stack Engineer', description: 'Engineering', is_active: true },
        { name: 'Product Manager', description: 'Product Management', is_active: true },
        { name: 'UI/UX Designer', description: 'Product Design', is_active: true },
      ],
    });
    leadDesigId = desigs?.[0]?.id;
  }

  // 3. Create Default Super Admin User & Employee profile
  const adminEmail = 'admin@workos.com';
  const existingAdmin = await rest(`/users?email=eq.${encodeURIComponent(adminEmail)}&select=*`);

  if (!existingAdmin || existingAdmin.length === 0) {
    console.log('Creating Super Admin account...');
    const passwordHash = await argon2.hash('Admin@123456', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    const createdUsers = await rest('/users', {
      method: 'POST',
      body: {
        email: adminEmail,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        email_verified: true,
      },
    });

    const adminUser = createdUsers?.[0];
    if (adminUser) {
      const createdEmps = await rest('/employees', {
        method: 'POST',
        body: {
          user_id: adminUser.id,
          employee_code: 'ADM001',
          first_name: 'Super',
          last_name: 'Admin',
          display_name: 'Super Admin',
          email: adminEmail,
          department_id: engineeringDeptId || null,
          designation_id: leadDesigId || null,
          employment_status: 'ACTIVE',
        },
      });

      const adminEmp = createdEmps?.[0];
      if (adminEmp) {
        await rest('/digital_id_cards', {
          method: 'POST',
          body: {
            employee_id: adminEmp.id,
            card_number: 'ID-ADM001',
            is_active: true,
          },
        });
      }
    }
  }

  // 4. Create Sample Employee account (for testing restricted attendance workflow)
  const employeeEmail = 'employee@workos.com';
  const existingEmployee = await rest(`/users?email=eq.${encodeURIComponent(employeeEmail)}&select=*`);

  if (!existingEmployee || existingEmployee.length === 0) {
    console.log('Creating sample employee account...');
    const passwordHash = await argon2.hash('Employee@123456', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    const createdUsers = await rest('/users', {
      method: 'POST',
      body: {
        email: employeeEmail,
        password_hash: passwordHash,
        role: 'EMPLOYEE',
        status: 'ACTIVE',
        email_verified: true,
      },
    });

    const empUser = createdUsers?.[0];
    if (empUser) {
      const createdEmps = await rest('/employees', {
        method: 'POST',
        body: {
          user_id: empUser.id,
          employee_code: 'EMP101',
          first_name: 'Pavan',
          last_name: 'Kumar',
          display_name: 'Pavan Kumar',
          email: employeeEmail,
          phone: '+91 9876543210',
          department_id: engineeringDeptId || null,
          designation_id: leadDesigId || null,
          employment_status: 'ACTIVE',
        },
      });

      const emp = createdEmps?.[0];
      if (emp) {
        await rest('/digital_id_cards', {
          method: 'POST',
          body: {
            employee_id: emp.id,
            card_number: 'ID-EMP101',
            is_active: true,
          },
        });

        // Initialize leave balances
        const leaveTypes = await rest('/leave_types?select=*');
        const currentYear = new Date().getFullYear();
        if (leaveTypes && Array.isArray(leaveTypes)) {
          for (const lt of leaveTypes) {
            await rest('/employee_leave_balances', {
              method: 'POST',
              body: {
                employee_id: emp.id,
                leave_type_id: lt.id,
                year: currentYear,
                allocated_days: lt.default_days_per_year,
                used_days: 0,
                pending_days: 0,
              },
            });
          }
        }
      }
    }
  }

  console.log('✅ Seed completed successfully!');
  console.log('Credentials:');
  console.log('  Super Admin: admin@workos.com / Admin@123456');
  console.log('  Employee:    employee@workos.com / Employee@123456');
}

seed().catch(console.error);
