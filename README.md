# Conciergerie Hub

**B2B SaaS platform for Airbnb hosts & short-term rental managers** — turn every rental into a connected, monetized space with physical QR codes, guest services and host tools.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Prisma (SQLite) · Bun**.

## ✨ Features

### 🏠 Host Dashboard (`/airbnb`)
- Property & room management with per-room device binding
- Subscription-aware experience (Free / Solo / Pro)
- Local providers directory (read-only for hosts)

### 📱 Guest QR Hub (`/hub/[slug]`)
- Public page served by **physical QR plaques** placed in the rental
- Wi-Fi access, digital guidebook, local service ordering, incident reporting
- Host mode unlocked by PIN (bcrypt-verified) → management tiles
- Voice messages from guests

### 🛠 Superadmin (planned: ÉTAPE 9+)
- Global stats, hosts & properties management
- Exclusive provider CRUD with geolocation (lat/lng + radius) and audience targeting (`OWNER_SERVICE` vs `GUEST_EXPERIENCE`)

## 🚀 Getting Started

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# then edit DATABASE_URL and NEXTAUTH_SECRET

# 3. Push the database schema
bun run db:push

# 4. (Optional) Seed demo data
bun run scripts/seed-b2b-demo.ts

# 5. Start the dev server
bun run dev
```

Open the app on the port shown in the console (default `3000`).

## 🔑 Demo credentials

| What | Value |
|---|---|
| Host account | `demo@qrdomotik.roomscan.pro` / `Demo2024!` |
| Host PIN (tablet mode) | `1234` |
| Demo plaque slug | `loft-canal-hub` |

## 📦 Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Push Prisma schema to SQLite |
| `bun run scripts/seed-b2b-demo.ts` | Idempotent demo data seeding |
| `bun run scripts/wipe-demo-data.ts` | Wipe demo data |

## 🗺 Roadmap

- [x] Property & room management
- [x] Physical QR plaques (hubSlug)
- [x] Guest QR Hub (Wi-Fi, guidebook, services, reports, voice)
- [x] Host tablet mode (PIN-protected)
- [ ] ÉTAPE 9 — Superadmin dashboard + strict provider management
- [ ] ÉTAPE 10 — Stripe billing (Airbnb Solo 9,90€/mois · Pro 199€/an)
- [ ] ÉTAPE 11 — Docker (standalone) + Coolify deployment

---

> ⚠️ **Security note**: never commit `.env`. Secrets (NextAuth secret, Stripe keys) must stay local or be managed by your hosting platform.
