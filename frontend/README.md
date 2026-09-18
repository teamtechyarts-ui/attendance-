# TeamsTechyArts Attendance & Work Management System — Frontend Application

Independent, modern Next.js 14 web application built with React, TypeScript, and Tailwind CSS for the TeamsTechyArts Employee Work Management System.

---

## 1. Overview & Purpose

The **TeamsTechyArts Frontend** is a fully standalone, responsive web application providing role-tailored dashboards and management tools for Employees, Managers, Admins, and Super Admins.

It communicates with the Backend **strictly over HTTP/HTTPS REST API** using typed API clients. It contains **zero direct database connections**, **zero Prisma dependencies**, and **zero backend source imports**.

---

## 2. Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Library**: React 18
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS, PostCSS, Autoprefixer
- **UI Components & Icons**: Lucide React, Custom Responsive Components
- **Validation**: Zod (frontend-local validation schemas)
- **State & Session**: Custom React Context (`useAuth`), Task Timer Hook (`useTaskTimer`)

---

## 3. Application Structure

```text
frontend/
├── public/
│   ├── images/
│   │   └── logo.png             # TeamsTechyArts high-res logo
│   └── favicon.ico
├── src/
│   ├── app/
│   │   ├── (employee)/          # Employee portal routes (attendance, tasks, reports, leave, id-card, notifications)
│   │   ├── admin/               # Admin portal routes (dashboard, employees, departments, designations, schedules, tasks, projects, attendance, leave, reports, feedback, settings)
│   │   ├── login/               # Authentication login
│   │   ├── forgot-password/     # Password reset request
│   │   ├── reset-password/      # Password reset confirmation
│   │   ├── change-password/     # First-login mandatory password change
│   │   ├── layout.tsx           # Root application layout
│   │   └── page.tsx             # Root redirect / landing
│   ├── components/              # UI components (AdminHeader, AdminSidebar, Modals, Tables, Forms)
│   ├── hooks/                   # React hooks (useAuth, useTaskTimer)
│   ├── lib/                     # HTTP API client and typed endpoint handlers
│   ├── types/                   # Local TypeScript types (100% independent)
│   └── validation/              # Local Zod validation schemas (100% independent)
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.example
└── README.md
```

---

## 4. API Communication Bridge

The frontend communicates with the backend exclusively using HTTP requests:

- **Base URL**: Configured via `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000` in development).
- **Credentials**: Requests send `credentials: 'include'` for secure cookie exchange and include `Authorization: Bearer <token>` fallback headers.
- **Error Handling**: Standardized error response parser handling 401 Unauthorized, 403 Forbidden, 429 Rate Limited, and 500 Server Errors gracefully.

---

## 5. Environment Configuration

Create a `.env.local` file in the `frontend/` directory based on `.env.example`:

```env
# Backend API Base URL
NEXT_PUBLIC_API_URL=http://localhost:4000
```

For production deployment (e.g. Hostinger or Vercel), set:
```env
NEXT_PUBLIC_API_URL=https://your-backend-api.onrender.com
```

---

## 6. Local Development & Scripts

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run in development mode (http://localhost:3000)
npm run dev

# Run TypeScript type check
npm run typecheck

# Build for production
npm run build

# Start production server
npm start
```

---

## 7. Hostinger Deployment Instructions

1. **Upload / Connect**: Deploy the `frontend/` folder to Hostinger Node.js Application hosting or static/SSR deployment.
2. **Node Version**: Set Node.js 18+ or 20+.
3. **Build Command**:
   ```bash
   npm ci && npm run build
   ```
4. **Start Command**:
   ```bash
   npm start
   ```
5. **Environment Variables**:
   Set `NEXT_PUBLIC_API_URL` to your production backend URL (e.g., `https://api.yourdomain.com` or `https://your-backend.onrender.com`).
6. **Port**: Next.js will listen on Hostinger's assigned port or standard port 3000.
