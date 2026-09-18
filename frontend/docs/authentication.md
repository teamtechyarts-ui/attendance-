# WorkOS Authentication & Security Specification

## 1. Authentication Architecture

WorkOS features a secure, server-authoritative authentication system using **Argon2id** password hashing, **JWT Session Tokens**, and **Access Modes**.

```
[User Login Request]
       │
       ▼
[Find User in DB]
       │
       ▼
[Verify Password with Argon2id]
       │
       ├─ Password Mismatch ─────────► [Record Failed Attempt / Account Lockout Check]
       │
       ▼
[Check Account Status & First Login]
       │
       ▼
[Generate Signed JWT Session Token & HTTP-Only Cookie]
       │
       ▼
[Compute Initial AccessMode]
       │
       ├─ If firstLoginRequired ─────► AccessMode: 'FIRST_LOGIN_REQUIRED'
       ├─ If attendance not checked ──► AccessMode: 'RESTRICTED' (15-minute window)
       └─ If attendance checked ──────► AccessMode: 'NORMAL'
```

---

## 2. Session Access Modes

1. **`FIRST_LOGIN_REQUIRED`**:
   - Applies to newly onboarded employees with temporary passwords.
   - Restricts user access strictly to `/change-password` until the temporary password is replaced.
2. **`RESTRICTED` (Attendance-Gated Access)**:
   - Applies upon login before daily attendance is marked.
   - User is granted a **15-minute grace window** (`restrictedUntil`) during which only `/attendance` and basic profile endpoints are accessible.
   - If 15 minutes expire without check-in, dashboard, tasks, and other features remain locked until attendance is checked in.
3. **`NORMAL`**:
   - Unlocked immediately when attendance is marked via `POST /api/attendance/check-in`.
   - Full access permitted based on the user's RBAC permissions.

---

## 3. Employee Onboarding Flow

1. Admin navigates to `/admin/employees` and creates a new employee profile.
2. Backend generates a cryptographically secure 12-character temporary password (`crypto.randomBytes`).
3. Backend creates the user account with `firstLoginRequired = true` and hashes the temporary password using Argon2id.
4. Backend triggers the **Nodemailer Welcome Email** containing:
   - Registration confirmation message
   - Login Email
   - Temporary Password
   - Instructions to log in and set a personalized password.
5. Employee logs in with the temporary password and is immediately routed to the Password Update screen.
6. Once updated, `firstLoginRequired` becomes `false` and the temporary password is permanently invalidated.

---

## 4. Forgot Password & Reset Flow

1. User clicks **Forgot Password** on `/login` and submits their email.
2. Backend verifies email existence without leaking account presence to the caller.
3. If user exists, backend generates a signed, single-use JWT reset token valid for 1 hour (`JWT_ACCESS_SECRET`).
4. Backend sends a password reset email via Nodemailer containing a secure reset link (`http://localhost:3000/reset-password?token=...`).
5. User navigates to the reset page, enters new password and confirmation.
6. Backend validates token validity, checks token signature and expiration, updates the password with Argon2id, and invalidates the token.

---

## 5. Role-Based Access Control (RBAC)

| Role | Description & Scope |
|---|---|
| **SUPER_ADMIN** | Full system control, master data management, system settings, employee creation/deletion, audit log inspection. |
| **ADMIN** | Organization administration, employee management, master data CRUD, attendance approvals, project assignments. |
| **MANAGER** | Team management, project supervision, task assignments, leave request reviews, daily report reviews. |
| **EMPLOYEE** | Personal attendance, task lifecycle & timer execution, assigned project collaboration, leave applications, daily reports. |

---

## 6. HTTP Error Handling Matrix

- **`401 Unauthorized`**: Authentication missing or expired JWT session.
- **`403 Forbidden`**: Insufficient RBAC permissions for the requested route.
- **`423 Locked`**: Account temporarily locked due to consecutive failed login attempts.
- **`429 Too Many Requests`**: Rate limit exceeded. **Session is preserved; user is NOT logged out.**
- **`500 Internal Server Error`**: Unexpected server-side exception.
