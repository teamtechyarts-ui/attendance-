# TeamsTechyArts Attendance & Work Management System — Backend API

Independent, production-ready backend service built with Node.js, Fastify, Prisma ORM, and Supabase PostgreSQL.

---

## 1. Overview & Purpose

The **TeamsTechyArts Backend** provides the secure core API for the TeamsTechyArts Employee Work Management System. It handles identity, role-based access control, attendance tracking with strict 15-minute gating rules, server-authoritative task timers (with automatic checkout termination), project management, employee master data CRUD, daily work reports, feedback, leave management, audit logging, and transactional email delivery via Nodemailer.

The backend is **100% independent** and communicates with the frontend solely via HTTP/JSON REST APIs with cookie/token session support.

---

## 2. Technology Stack

- **Runtime**: Node.js (v20+) with TypeScript (ES2022 / NodeNext ESM)
- **Web Framework**: Fastify v4
- **Database ORM**: Prisma ORM v5 (connected to Supabase PostgreSQL / Supabase REST fallback)
- **Security & Cryptography**: Argon2id for password hashing, JWT (HMAC-SHA256) for session tokens
- **Email Service**: Nodemailer (Gmail SMTP / Standard SMTP)
- **Validation**: Zod (strictly typed request schemas)
- **Testing**: Node.js built-in Test Runner (`node:test`, `node:assert/strict`)

---

## 3. Architecture & Core Systems

### A. Authentication & Session Security
- **Argon2id Hashing**: High-entropy, memory-hard password verification.
- **Session Types**:
  - `RESTRICTED`: Granted upon login if the employee has not marked attendance for the current working day. Restricted to attendance check-in and password change endpoints.
  - `NORMAL`: Upgraded automatically immediately upon attendance check-in. Grants full access to Tasks, Projects, Calendar, Reports, Leave, and Notifications without requiring re-login.
- **RBAC**: Multi-tiered role enforcement: `SUPER_ADMIN`, `ADMIN`, `MANAGER`, `EMPLOYEE`.
- **Token Delivery**: HTTPOnly, Secure, SameSite cookies (`access_token` and `refresh_token`), alongside JSON body return for flexible client support (`credentials: 'include'`).

### B. Rate Limiting Rules
- Fastify rate limiter is configured to safeguard authentication and public endpoints.
- **Critical Policy**: HTTP `429 Too Many Requests` indicates only that the rate limit was reached. It **never** invalidates sessions, clears cookies, logs out users, or alters timer/attendance state.

### C. Attendance & Server-Authoritative Timers
- **Attendance Verification**: Supports Manual, Mobile, Face, and Face+Location.
- **Checkout / Timer Rule**: When an employee checks out from attendance, all currently active task timers (`RUNNING`) for that employee are **automatically stopped** server-side, and total worked duration is accurately calculated and persisted.
- **Worked Duration**: Timer intervals track start/pause/resume/stop timestamps with millisecond accuracy.

### D. Email & Notification System
- Nodemailer transporter configured with SMTP credentials.
- Transactional templates:
  - Welcome / New Hire Onboarding (with cryptographically secure temporary passwords)
  - Password Reset Request (with secure single-use token links)
  - Task Assignment & Reminder Notifications
  - Leave Application, Approval, and Rejection Notices
  - Daily Work Report Reminders

---

## 4. Environment Configuration

Create a `.env` file in the `backend/` directory based on `.env.example`:

```env
# Server
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Database (Supabase PostgreSQL via Prisma)
DATABASE_URL=postgresql://postgres.vyatjymswwbwsncfimke:YOUR_DB_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.vyatjymswwbwsncfimke:YOUR_DB_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres

# Supabase Credentials (REST Fallback)
SUPABASE_URL=https://vyatjymswwbwsncfimke.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key
SUPABASE_JWKS_URL=https://vyatjymswwbwsncfimke.supabase.co/auth/v1/.well-known/jwks.json

# Security & Secrets
JWT_ACCESS_SECRET=your_jwt_access_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
COOKIE_SECRET=your_cookie_secret
COOKIE_DOMAIN=localhost
AUTH_ACCOUNT_LOCKOUT_ENABLED=true

# Timezone
APP_TIMEZONE=Asia/Kolkata

# Email & SMTP (Gmail)
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
SMTP_FROM_NAME="TeamsTechyArts"
SMTP_SECURE=false

# App URL (for reset password links)
APP_WEB_URL=http://localhost:3000
```

---

## 5. Local Development & Scripts

```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run in development mode (hot reload via tsx)
npm run dev

# Run unit and integration tests
npm test

# Typecheck and lint
npm run typecheck

# Build for production
npm run build

# Start production server
npm start
```

---

## 6. Health & Status Endpoints

- **Health Check**: `GET /health` -> `{ "status": "ok", "timestamp": "...", "uptime": 123 }`
- **Root / Version**: `GET /api` -> `{ "name": "TeamsTechyArts API", "version": "1.0.0" }`

---

## 7. Render Deployment Instructions

1. **Repository**: Connect the Git repository to Render.
2. **Root Directory**: `backend`
3. **Environment**: Node
4. **Build Command**:
   ```bash
   npm ci && npx prisma generate && npm run build
   ```
5. **Start Command**:
   ```bash
   npm start
   ```
6. **Environment Variables**: Add all variables from `backend/.env.example` in Render dashboard (ensure `NODE_ENV=production` and `CORS_ORIGIN=https://your-frontend-domain.com`).
7. The backend server automatically binds to `0.0.0.0` and listens on `process.env.PORT`.
