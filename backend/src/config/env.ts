import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  directUrl: process.env.DIRECT_URL || '',

  // Supabase REST fallback & credentials
  supabaseUrl: process.env.SUPABASE_URL || 'https://vyatjymswwbwsncfimke.supabase.co',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_iFl2n8MW_X-tOCKSXrAGaw_wwg_NtgX',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || 'sb_secret_2V9Nq1HgYwMzYDUUScjmKw_imGi0X3n',
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
  appWebUrl: process.env.APP_WEB_URL || process.env.CORS_ORIGIN || 'http://localhost:3000',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/auth/google/callback',
};


