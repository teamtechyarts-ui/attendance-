# TeamsTechyArts System Architecture — Independent Backend

## 1. High-Level Architectural Pattern

The TeamsTechyArts Attendance & Work Management System follows a strict decoupled, 2-tier client-server architecture:

```text
Browser (Next.js Client)
   │
   ▼ HTTP/HTTPS REST API (JSON)
Backend API (Fastify 4 + Node.js)
   │
   ├─► Prisma ORM (Connection Pooler / Direct)
   │      │
   │      ▼
   │   Supabase PostgreSQL Database
   │
   └─► Nodemailer (SMTP Gateway)
```

---

## 2. Backend Subsystems (`backend/`)

- **Framework**: Fastify 4 + TypeScript + Prisma ORM.
- **Role**: Authoritative business logic, cryptographic password hashing (Argon2id), session management, RBAC enforcement, rate limiting, and database queries.
- **Key Modules**:
  - `auth`: Login, logout, token refresh, forgot/reset password, first-login password update.
  - `attendance`: Daily attendance recording, work mode tracking, 15-minute gating, session upgrade.
  - `tasks`: Task creation, assignment, timer tracking (with automatic checkout termination), worked duration persistence.
  - `projects`: Projects and team membership management.
  - `calendar`: Personal and company-wide event scheduling.
  - `leave`: Leave application, approval, and rejection.
  - `reports`: Daily work reports and review flows.
  - `feedback`: Periodic feedback collection.
  - `email`: Transactional email delivery via Nodemailer.
  - `departments` / `designations` / `work-schedules`: Master data CRUD.

---

## 3. Communication & Security Flow

1. **Client Request**: Browser dispatches HTTP request with `credentials: 'include'` (sending session cookies or Bearer tokens).
2. **Fastify Plugins & Middleware**:
   - `cors`: Validates `Origin` matches configured `CORS_ORIGIN` (rejects wildcard origins when handling credentials).
   - `rate-limit`: Enforces rate boundaries. On threshold breach, returns `429 Too Many Requests` **without destroying the user session**.
   - `requireAuth`: Validates JWT token and extracts authenticated `user` and `sessionId`.
   - `requireAccessMode`: Checks if session is in `RESTRICTED` mode (pending 15-minute attendance check-in) and restricts access to attendance and profile endpoints.
   - `requireAdmin`: Enforces `ADMIN` or `SUPER_ADMIN` role for sensitive master data or employee mutations.
3. **Data Access via `DbService` & `Prisma`**:
   - Connects to Supabase PostgreSQL database.
   - Falls back gracefully to Supabase REST client if direct PostgreSQL connectivity drops.
