# WorkOS REST API Specification

All endpoints are hosted at `http://localhost:4000/api` (Fastify Backend).

---

## 1. Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required | Request Body / Params | Response |
|---|---|---|---|---|---|
| `POST` | `/login` | User login (email & password) | None | `{ email, password }` | `{ success: true, session: SessionInfo }` |
| `POST` | `/logout` | Terminate session & clear cookies | Authenticated | None | `{ success: true, message: "Logged out" }` |
| `GET` | `/me` | Get current session user info | Authenticated | None | `SessionInfo` |
| `POST` | `/forgot-password` | Request password reset token | None | `{ email }` | `{ success: true, message: "..." }` |
| `POST` | `/reset-password` | Reset password using single-use token | None | `{ token, password, confirmPassword }` | `{ success: true, message: "Password updated" }` |
| `POST` | `/change-password` | Change password (first login / user update) | Authenticated | `{ currentPassword, newPassword, confirmPassword }` | `{ success: true, message: "Password changed" }` |

---

## 2. Attendance & Sessions (`/api/attendance`)

| Method | Endpoint | Description | Auth Required | Request Body / Params | Response |
|---|---|---|---|---|---|
| `GET` | `/today` | Fetch today's attendance record | Authenticated | None | `AttendanceRecord \| null` |
| `POST` | `/check-in` | Check in for today & upgrade session mode | Authenticated | `{ workMode?: "OFFICE"\|"WFH"\|"REMOTE", location?: string }` | `{ success: true, record: AttendanceRecord }` |
| `POST` | `/check-out` | Check out for today (**auto-stops active timers**) | Authenticated | `{ notes?: string }` | `{ success: true, record: AttendanceRecord }` |
| `GET` | `/history` | Fetch monthly/date range attendance history | Authenticated | `?startDate=...&endDate=...` | `AttendanceRecord[]` |
| `GET` | `/admin/records` | Admin: view all employee attendance | Admin/Manager | `?date=...&departmentId=...` | `AttendanceRecord[]` |

---

## 3. Tasks & Timers (`/api/tasks`)

| Method | Endpoint | Description | Auth Required | Request Body / Params | Response |
|---|---|---|---|---|---|
| `GET` | `/` | List assigned or created tasks | Authenticated | `?status=...&priority=...` | `Task[]` |
| `GET` | `/:id` | Get task details by ID | Authenticated | None | `Task` |
| `POST` | `/` | Create a new task | Authenticated | `CreateTaskInput` | `Task` |
| `PATCH` | `/:id` | Update task details / status | Authenticated | `UpdateTaskInput` | `Task` |
| `POST` | `/:id/timer/start` | Start server-authoritative timer | Authenticated | None | `{ timerSession, task }` |
| `POST` | `/:id/timer/pause` | Pause task timer | Authenticated | None | `{ timerSession, task }` |
| `POST` | `/:id/timer/resume` | Resume task timer | Authenticated | None | `{ timerSession, task }` |
| `POST` | `/:id/timer/stop` | Stop task timer and accumulate duration | Authenticated | None | `{ timerSession, totalWorkedSeconds }` |
| `GET` | `/:id/comments` | List comments for task | Authenticated | None | `TaskComment[]` |
| `POST` | `/:id/comments` | Add comment / mention teammate | Authenticated | `{ content, mentions?: string[] }` | `TaskComment` |

---

## 4. Projects & Team Collaboration (`/api/projects`)

| Method | Endpoint | Description | Auth Required | Request Body / Params | Response |
|---|---|---|---|---|---|
| `GET` | `/` | List accessible projects | Authenticated | `?status=...` | `Project[]` |
| `GET` | `/:id` | Get project details, members, tasks | Authenticated | None | `Project` |
| `POST` | `/` | Create project | Admin/Manager | `CreateProjectInput` | `Project` |
| `PATCH` | `/:id` | Update project details / status | Admin/Manager | `UpdateProjectInput` | `Project` |
| `POST` | `/:id/members` | Assign member to project team | Admin/Manager | `{ employeeId, role }` | `ProjectMember` |
| `DELETE` | `/:id/members/:memberId` | Remove member from project | Admin/Manager | None | `{ success: true }` |

---

## 5. Master Settings & Organization Data

### Departments (`/api/departments`)
- `GET /api/departments` (`?includeInactive=true` optional) - List departments.
- `POST /api/departments` - Create department.
- `PATCH /api/departments/:id` - Update department.
- `DELETE /api/departments/:id` - Safe delete (soft-deactivates if referenced by employees).

### Designations (`/api/designations`)
- `GET /api/designations` (`?includeInactive=true` optional) - List job designations.
- `POST /api/designations` - Create designation.
- `PATCH /api/designations/:id` - Update designation.
- `DELETE /api/designations/:id` - Safe delete (soft-deactivates if referenced).

### Work Schedules (`/api/work-schedules`)
- `GET /api/work-schedules` - List schedules ordered by default first.
- `POST /api/work-schedules` - Create shift schedule (transactionally unsets other defaults if default).
- `PATCH /api/work-schedules/:id` - Update schedule.
- `DELETE /api/work-schedules/:id` - Delete schedule (blocked if default or assigned).

---

## 6. Employees (`/api/employees`)
- `GET /api/employees` - List employees with filters.
- `GET /api/employees/:id` - Get employee profile.
- `POST /api/employees` - Create employee + trigger onboarding email via Nodemailer.
- `PATCH /api/employees/:id` - Update employee details / status.
- `POST /api/employees/:id/resend-invite` - Resend onboarding credentials email.

---

## 7. Leave, Calendar, Reports, Feedback, Digital ID
- **Leave (`/api/leave`)**: Submit requests, list balances, approve/reject requests (`ADMIN`/`MANAGER`).
- **Calendar (`/api/calendar`)**: Company-wide events (`forEveryone=true`), personal events, and synchronized task deadlines.
- **Daily Work Reports (`/api/reports`)**: Submit daily work summary, review employee reports.
- **Feedback (`/api/feedback`)**: Daily/weekly/monthly feedback submissions and reviews.
- **Digital ID (`/api/digital-id`)**: Fetch digital ID card data and verify identity tokens (`/api/digital-id/verify/:token`).
- **Audit Logs (`/api/audit`)**: Retrieve immutable system activity audit trails (`ADMIN`/`SUPER_ADMIN`).
