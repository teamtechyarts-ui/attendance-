# TeamsTechyArts System Architecture — Independent Frontend

## 1. High-Level Architectural Pattern

The TeamsTechyArts Frontend is a decoupled, modern React application built on Next.js 14 App Router.

```text
Browser
   │
   ▼ HTTP/HTTPS REST API (JSON)
Backend API (Fastify 4)
```

---

## 2. Frontend Subsystems (`frontend/`)

- **Framework**: Next.js 14 (App Router) + React 18 + Tailwind CSS.
- **Role**: Presentational layer, client-side session management, route protection, role-based dashboards, and interactive widgets.
- **Portals**:
  - **Employee Portal**: Daily check-in/out, live task timers, daily work reports, leave requests, digital ID cards, notifications.
  - **Admin Portal**: Metrics dashboard, employee management, department/designation/schedule CRUD, project assignment, task oversight, attendance logs, leave approvals, reports, system settings.
- **State & Hooks**:
  - `useAuth`: Manages authentication state, active employee profile, access mode (`NORMAL` vs `RESTRICTED`), and login/logout handlers.
  - `useTaskTimer`: Synchronizes with server-authoritative timer state.

---

## 3. Communication & Security Flow

1. **Client Request**: Browser dispatches HTTP requests via `apiClient` (`@/lib/api/client.ts`).
2. **Credentials**: Sends `credentials: 'include'` for secure cookies, and includes Bearer token headers when available.
3. **Environment**: Points to `NEXT_PUBLIC_API_URL`.
