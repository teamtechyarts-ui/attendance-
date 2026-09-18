# TeamsTechyArts Frontend Developer Setup & Guidelines

## 1. Prerequisites & Environment Setup

- **Node.js**: `v18.x` or `v20.x`
- **Package Manager**: `npm`
- **Backend API**: Running TeamsTechyArts Backend API (locally on port 4000 or production URL).

---

## 2. Step-by-Step Installation

```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000

# 4. Start Next.js development server
npm run dev
```

---

## 3. Standard Development Commands

| Command | Action |
|---|---|
| `npm run dev` | Run Next.js frontend development server on port 3000 |
| `npm run typecheck` | Run TypeScript strict typecheck (`tsc --noEmit`) |
| `npm run build` | Build optimized production bundle |
| `npm start` | Start Next.js production server on port 3000 |

---

## 4. Architecture Rules

1. **Independent App**: Frontend is 100% standalone.
2. **API Communication**: All backend interactions must go through `@/lib/api` using HTTP/HTTPS REST API.
3. **No Direct Database Access**: Never import Prisma or database drivers in the frontend.
4. **Local Types & Validation**: Use `@/types` and `@/validation` for TypeScript types and Zod schemas.
