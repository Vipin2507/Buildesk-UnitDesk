# Buildesk UnitDesk

Internal real-estate operations platform for inventory, bookings, channel partners, payments, and collections. Soft-enterprise UI with wing/floor unit maps, single-form booking capture, and a partner self-service portal.

**Live:** [unitdesk.cravingcodetech.in](https://unitdesk.cravingcodetech.in)

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 7 |
| Routing | React Router 7 |
| Data fetching | TanStack Query 5 |
| Client state | Zustand |
| UI | Tailwind CSS 4, Radix primitives, Lucide icons, Framer Motion, Sonner toasts |
| Charts | Recharts |
| Backend | Express 5, Zod validation, JWT auth |
| ORM / DB | Prisma 6, SQLite |
| Uploads | Multer → `/uploads` |
| Process / deploy | PM2, GitHub Actions → CloudPanel host |

---

## Features

### Core operations
- **Companies & projects** — developer companies, project CRUD, RERA/location metadata, project photos and type-wise floor plans
- **Flexible project setup** — wings, floors, per-floor unit counts and BHK mix; live generation preview; unit number formats
- **Inventory grid** — wing / floor / unit views, status KPIs, docked unit detail panel (overview, customer, financials, documents, activity)
- **Unit master** — list/edit units, photos, bulk document upload
- **Bookings** — single-form create (booking + contacts + financials + partner + docs); status workflow with optional approvals
- **Customers** — primary / co-applicant / nominee contacts linked to bookings
- **Channel partners** — partner CRUD, commission rules (%, flat, slab), entitlement snapshots at booking time
- **Payments** — full CRUD; demand schedules and validation against **value to be collected**; customer receipts & partner payouts
- **Documents** — multi-file bulk upload by category (KYC, agreement, floor plan, etc.) on units and bookings

### Booking financials
Captured on create and shown on detail / unit panel / dashboards:

| Field | Role |
| --- | --- |
| Agreement | Base agreement value |
| GST | GST on the deal |
| Other charges | Misc charges |
| Total cost | Rolled-up cost |
| GST on agreement | Additional GST line |
| Stamp duty registration | Stamp + registration |
| Value to be collected | Customer demand (schedules & payment caps) |
| Finance | Financed / bank portion |

### Insights & ops
- **Dashboard** — portfolio KPIs, status mix, unit-type table, collection charts, aging, project & booking tables, glance panels
- **Project overview** — project-level version of the same analytics
- **Reports** — bookings / inventory / payments exports
- **CRM** — reminders (KYC, payment due)
- **Marketing** — leads & campaigns
- **Integrations** — WhatsApp / SMS / email / webhook toggles and test logs
- **Approvals** — cancel / confirm gates for non-admins
- **Users & roles** — employees, permissions, project access scoping
- **Masters & settings** — shared option lists and app settings

### Partner portal (`/partner`)
Separate login for channel partners: home KPIs, bookings list/detail, documents, notifications. Entitlement is snapshotted at booking; not recomputed live for history.

---

## Project structure

```
Buildesk UnitDesk/
├── .github/workflows/deploy.yml   # SCP + SSH: install, migrate, build, PM2
├── prisma/
│   ├── schema.prisma              # Data model
│   ├── seed.ts                    # Demo company, inventory, bookings
│   └── *.db                       # SQLite (local/prod; not committed)
├── scripts/
│   └── migrate-booking-financials.ts
├── server/
│   ├── index.ts                   # Express app, static SPA + /uploads
│   ├── middleware/                # auth, validate
│   ├── lib/                       # prisma, access, schedule, commission, invoice, audit…
│   └── routes/                    # REST modules
├── src/
│   ├── App.tsx                    # Routes (staff + partner shells)
│   ├── main.tsx
│   ├── components/
│   │   ├── layout/                # App shell, sidebar, protected routes
│   │   ├── shared/                # Domain UI (grid, unit panel, docs, KPIs…)
│   │   └── ui/                    # Radix-based primitives
│   ├── hooks/
│   ├── lib/                       # api client, format, query keys, plans…
│   ├── pages/                     # Feature screens
│   ├── stores/                    # auth, project context, inventory filters…
│   └── styles/                    # theme.css (design tokens)
├── public/                        # Static assets / default plans
├── uploads/                       # Runtime uploads (gitignored)
├── DEPLOY.md                      # Production deploy notes
├── package.json
└── vite.config.ts
```

### Domain hierarchy

```
Company → Project → Wing → Floor → Unit
                              ↓
                         Booking → Customer(s)
                                → BookingFinancial
                                → PartnerEntitlement
                                → Payment / PaymentSchedule
                                → Invoice / Document / Reminder
```

### Key API surface (`/api`)

| Prefix | Responsibility |
| --- | --- |
| `/auth`, `/partner-auth` | Staff & partner login |
| `/companies`, `/projects` | Org & project setup / generation |
| `/units`, `/projects/:id/inventory` | Unit CRUD & grid payload |
| `/bookings` | Booking lifecycle, schedules, invoices |
| `/payments` | Payment CRUD + collection summary |
| `/channel-partners`, `/partner-portal` | Partner admin & portal |
| `/dashboard` | Admin & project analytics |
| `/documents`, `/uploads` | Vault & image uploads |
| `/customers`, `/employees`, `/roles` | People & access |
| `/reminders`, `/approvals`, `/audit` | CRM / governance |
| `/leads`, `/campaigns`, `/integrations` | Marketing & messaging |
| `/reports`, `/settings`, `/masters` | Reporting & config |

---

## Getting started

### Prerequisites
- Node.js 20+ (22/24 fine)
- npm

### Setup

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

- App (Vite): [http://localhost:5173](http://localhost:5173)  
- API (Express): [http://localhost:3101](http://localhost:3101) (or `PORT` from `.env`)

### Environment

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="dev-secret-change-me"
PORT=3101
NODE_ENV=development
```

Production uses `file:./prod.db` on the server. Never commit real secrets.

### Demo workspace (platform client `demo`)

Created automatically on server start (or `npm run db:seed:demo`). Sign in at `/login` — workspace is detected from email.

| Role | Email | Password |
| --- | --- | --- |
| Super admin | `ivan.p@example.net` | `Admin@123` |
| Sales | `peter.m@example.com` | `Sales@123` |
| Partner portal | `alice.j@example.com` | `Partner@123` |

Platform control plane: `/admin/login` · `platform@buildesk.com` / `Platform@123`

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | API + Vite together |
| `npm run build` | Typecheck + production client build |
| `npm start` | Serve API + built SPA |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Wipe DB, push schema, reseed |
| `npm run db:ensure` | Safe BookingFinancial migrate then `db push` (used in deploy) |

---

## Auth & permissions

- Staff JWT (`Authorization: Bearer …`); partner tokens are scoped to `/api/partner-portal` and partner auth routes.
- Role permissions gate actions such as `book`, `payment_entry`, `approve`, `cancel`, `delete`, `add` / `edit`.
- Non–super-admins are limited to projects via `ProjectAccess`.

---

## Deploy

Push to `main` (or run the **Deploy UnitDesk** workflow). Pipeline:

1. Sync files over SSH/SCP  
2. `npm ci` → `prisma generate` → booking financials migrate → `prisma db push`  
3. `npm run build`  
4. Restart PM2 process `unitdesk`

See [DEPLOY.md](./DEPLOY.md) for host path, secrets, and CloudPanel/PM2 notes.

---

## Design notes

- Cool gray-blue canvas, navy icon rail, primary accent `#009bff`
- Dense internal admin patterns: compact KPIs, pills, tables, short motion
- Light / dark theme via CSS variables in `src/styles/theme.css`

---

## License

Private / proprietary — Buildesk UnitDesk internal use.
