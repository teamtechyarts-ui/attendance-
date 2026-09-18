# TeamsTechyArts Backend Developer Setup & Guidelines

## 1. Prerequisites & Environment Setup

- **Node.js**: `v18.x` or `v20.x`
- **Package Manager**: `npm`
- **Database**: Supabase PostgreSQL account with direct & pooler connection URLs.
- **SMTP**: Gmail account with an **App Password** for Nodemailer.

---

## 2. Step-by-Step Installation

```bash
# 1. Navigate to backend directory
cd backend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your Supabase DATABASE_URL and SMTP credentials

# 4. Generate Prisma Client
npx prisma generate

# 5. Start Backend in development mode
npm run dev
```

---

## 3. Standard Development Commands

| Command | Action |
|---|---|
| `npm run dev` | Run Fastify backend with live reload (`tsx watch`) on port 4000 |
| `npm run typecheck` | Run TypeScript strict typecheck (`tsc --noEmit`) |
| `npm test` | Run backend test suite |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Start production server (`node dist/server.js`) |
| `npx prisma generate` | Generate Prisma client from `prisma/schema.prisma` |

---

## 4. Multi-Developer Work Division & Rules

1. **Backend Work (`backend/`)**:
   - Work on modules (`src/modules/`), middleware, routes, Fastify plugins, and email services.
   - **Rule**: Fastify backend is the sole authority for authorization, hashing, and database operations.
2. **Database & Schema (`backend/prisma/`)**:
   - Manage `schema.prisma` and seeds.
   - **Rule**: Never run destructive commands (`prisma migrate reset`, `DROP TABLE`) against shared databases.
3. **Backend Types & Validation (`backend/src/types/` & `backend/src/validation/`)**:
   - Maintain local type definitions and Zod validation schemas.
