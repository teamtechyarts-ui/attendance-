import { buildApp } from './app.js';
import { config } from './config/env.js';
import { EmailService } from './modules/email/email.service.js';
import { SchedulerService } from './services/scheduler.service.js';

async function start() {
  try {
    // Initialize & verify Email Service resiliently
    await EmailService.init();

    // Start Central Scheduled Jobs Service (runs 1m loop safely)
    SchedulerService.start();

    const app = await buildApp();
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    console.log(`🚀 WorkOS Backend API running at http://localhost:${config.port}`);
    console.log(`📊 Health Check: http://localhost:${config.port}/health`);

    // Safe Supabase configuration diagnostic (No secret values exposed)
    const urlMatch = config.supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    const projectRef = urlMatch ? urlMatch[1] : 'custom-url';
    const key = config.supabaseSecretKey || '';
    let keyType = 'missing';
    if (key.startsWith('eyJ')) keyType = 'legacy_jwt_service_role';
    else if (key.startsWith('sb_secret_')) keyType = 'sb_secret';
    else if (key.startsWith('sb_publishable_')) keyType = 'sb_publishable (INVALID FOR BACKEND)';
    else if (key.length > 0) keyType = 'opaque_token';

    const keySource = process.env.SUPABASE_SECRET_KEY
      ? 'SUPABASE_SECRET_KEY'
      : process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'SUPABASE_SERVICE_ROLE_KEY'
      : process.env.SUPABASE_SERVICE_KEY
      ? 'SUPABASE_SERVICE_KEY'
      : process.env.SUPABASE_KEY
      ? 'SUPABASE_KEY'
      : 'fallback_default';

    console.log(`🔌 SUPABASE_CONFIG: projectRef=${projectRef} keySource=${keySource} keyType=${keyType} keyPresent=${Boolean(key)}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
