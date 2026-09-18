import { buildApp } from './app.js';
import { config } from './config/env.js';
import { EmailService } from './modules/email/email.service.js';

async function start() {
  try {
    // Initialize & verify Email Service resiliently
    await EmailService.init();

    const app = await buildApp();
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    console.log(`🚀 WorkOS Backend API running at http://localhost:${config.port}`);
    console.log(`📊 Health Check: http://localhost:${config.port}/health`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
