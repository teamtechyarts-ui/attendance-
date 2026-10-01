import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function parseAllowedOrigins(): string[] {
  const defaults = ['http://localhost:3000', 'https://teams.techyarts.com'];
  const envVars = [
    process.env.CORS_ORIGIN,
    process.env.ALLOWED_ORIGINS,
    process.env.APP_WEB_URL,
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
  ];

  const origins = new Set<string>(defaults);

  for (const val of envVars) {
    if (!val) continue;
    const parts = val.split(',');
    for (const part of parts) {
      const trimmed = part.trim().replace(/\/+$/, '');
      if (trimmed) {
        origins.add(trimmed);
      }
    }
  }

  return Array.from(origins);
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'https://teams.techyarts.com',
  allowedOrigins: parseAllowedOrigins(),
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  directUrl: process.env.DIRECT_URL || '',

  // Supabase REST fallback & credentials
  supabaseUrl: process.env.SUPABASE_URL || 'https://vyatjymswwbwsncfimke.supabase.co',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_iFl2n8MW_X-tOCKSXrAGaw_wwg_NtgX',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5YXRqeW1zd3did3NuY2ZpbWtlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTUyOTgyNiwiZXhwIjoyMTA1MTA1ODI2fQ.3n_MwqjNtRCzMMFCf1D8ncxNAOToBg_fSuC32haPbmc',
  supabaseJwksUrl: process.env.SUPABASE_JWKS_URL || 'https://vyatjymswwbwsncfimke.supabase.co/auth/v1/.well-known/jwks.json',

  // Security Secrets & Policies
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'workos_jwt_super_secret_access_key_2026',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'workos_jwt_super_secret_refresh_key_2026',
  cookieSecret: process.env.COOKIE_SECRET || 'workos_cookie_super_secret_signing_key_2026',
  cookieDomain: process.env.COOKIE_DOMAIN || 'localhost',
  accountLockoutEnabled: process.env.AUTH_ACCOUNT_LOCKOUT_ENABLED !== 'false',


  // Timezone
  appTimezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  // Email & SMTP Configuration
  emailEnabled: process.env.EMAIL_ENABLED !== 'false' && (process.env.EMAIL_ENABLED === 'true' || Boolean(process.env.SMTP_HOST)),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpUser: process.env.SMTP_USER || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || 'notifications@workos.local',
  smtpFromName: process.env.SMTP_FROM_NAME || 'WorkOS',
  smtpSecure: process.env.SMTP_SECURE === 'true',
  emailFrom: process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || 'notifications@workos.local',
  emailApiKey: process.env.EMAIL_PROVIDER_API_KEY || '',
  appWebUrl: process.env.APP_WEB_URL || process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'https://teams.techyarts.com',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback',
};


