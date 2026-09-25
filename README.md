# Phenmo Events — Website & Staff Operations Portal

A modern, responsive event production marketing website combined with an installable Progressive Web App (PWA) staff operations portal. Backed by a high-performance native Node.js HTTP server, Supabase Cloud PostgreSQL, and a local SQLite fallback database.

---

## 🌟 Key Features

### Public Marketing Website (`index.html`, `style.css`)
- **Modern Responsive Design**: Dark aesthetic, gold accents, fluid typography, and custom layouts optimized for desktop, tablet, and mobile devices.
- **Section Navigation**: Interactive hero, services showcase, event gallery, about section, and contact call-to-action.
- **Privacy-First**: Public visitors have zero access to private warehouse inventory, pricing, or internal staff systems.

### Staff Operations Portal (`staff-portal/`)
- **PWA Ready**: Installable on Android, iOS, Windows, and macOS with offline support via Service Workers.
- **Consolidated Inventory Management**: 421 consolidated active equipment model rows across 7 departments:
  - *Audio & Sound, Visual & Lighting, Stage & Staging, Rigging & Stands, Cables & Interconnects, Power & Distribution, Hardware & Cases*.
- **Barcode & QR Scanner**: Real-time hardware identification by individual serial numbers stored in PostgreSQL `JSONB` arrays.
- **Event Planning & Equipment Booking**: Schedule events, allocate gear, detect stock shortages, and record return conditions with damage photo reporting.
- **Team Communications**: Real-time internal staff messaging with administrative notifications.
- **Role-Based Authentication**: Secure bcrypt password hashing with first-time activation workflows.

---

## 🏗️ Architecture & Data Layer

- **Dual-Mode Data Architecture**:
  - **Cloud Primary (Supabase PostgreSQL)**: Fully relational schema with Row Level Security (RLS), GIN indexes, and realtime updates.
  - **Offline Fallback (SQLite)**: If offline or when cloud credentials are not supplied, the server automatically serves from `data/phenmo.db` via Node's built-in `node:sqlite`.
- **Zero Web Frameworks**: Built using native Node.js standard libraries (`node:http`, `node:sqlite`, `node:fs`, `node:path`) plus `bcryptjs` and `@supabase/supabase-js`.

---

## 🚀 Quick Start

### 1. Requirements
- **Node.js 22.5 or higher** (Uses native `node:sqlite` and standard `process.loadEnvFile`).

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/phenmo-website.git
cd phenmo-website
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your Supabase credentials (found in **Supabase Dashboard $\rightarrow$ Project Settings $\rightarrow$ API**):
```ini
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
PORT=8000
```
*(Note: If `.env` is omitted, the server automatically runs in local SQLite mode).*

### 4. Database Setup (Supabase)
1. Open your **Supabase Dashboard** $\rightarrow$ **SQL Editor**.
2. Run [`supabase/schema.sql`](supabase/schema.sql) to initialize tables, indexes, and storage buckets.
3. Run [`supabase/seed.sql`](supabase/seed.sql) to populate all 538 consolidated assets, categories, and staff accounts.
4. *(Optional)* Run one-command sync from local SQLite to Supabase:
   ```bash
   npm run sync:supabase
   ```

### 5. Start the Server
```bash
npm start
```
Then visit:
- **Public Site**: [http://localhost:8000](http://localhost:8000)
- **Staff Operations Portal**: [http://localhost:8000/staff-portal/](http://localhost:8000/staff-portal/)
- **REST API Endpoints**: [http://localhost:8000/api/](http://localhost:8000/api/)

---

## 🧪 Testing

Run the comprehensive 21-test automated verification suite:
```bash
npm run test
```
This performs:
1. Syntax validation across `server.js`, `staff-portal/app.js`, and `staff-portal/sw.js`.
2. 16 REST API, master security gate, authentication, consolidated inventory, and state-sync tests against an ephemeral server.
3. 5 security tests verifying directory traversal immunity, MIME type safety, and privilege isolation.

---

## 👥 Staff Portal Access & Credentials

The Staff Portal features a **Two-Tier Security Architecture**:

### 1. Master Security Gate (All-Round Code)
* **Default Code**: `phenmo2026` *(Configurable in `.env` via `PORTAL_MASTER_KEY`)*
* Unlocks the portal entrance and reveals the staff account selector.

### 2. Staff Accounts & Individual Passwords
Once the security gate is unlocked, choose your account:

| Staff Member | Role | Initial Default Password | Work Email |
| :--- | :--- | :--- | :--- |
| **Steve** | Managing Director | `0000` | `steve@phenmoevents.co.ke` |
| **Mariah** | Admin | `0000` | `mariah@phenmoevents.co.ke` |
| **Dave** | Technician | `0000` | `dave@phenmoevents.co.ke` |

*Signing in with the initial default code `0000` launches the one-time activation wizard to set your personal password and permanent work email.*

---

## 🚢 Publishing to GitHub

1. **Verify your local files**:
   Make sure sensitive files are protected. `.env`, `data/`, and private backups are already safely excluded by `.gitignore`.

2. **Initialize Git & Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Phenmo Events website and staff portal"
   git branch -M main
   git remote add origin https://github.com/<your-username>/phenmo-website.git
   git push -u origin main
   ```
   *(Or drag and drop the project folder into **GitHub Desktop** and click "Publish repository").*

3. **Cloud Deployment Options**:
   * **Node.js Hosting (Render, Railway, DigitalOcean, VPS)**: Run `npm start` with Node 22.5+. Add environment variables from `.env.example`.
   * **Static Site (GitHub Pages, Netlify, Vercel)**: `index.html` and `style.css` can be hosted directly on any static web host.

---

## 📁 Project Directory Layout

```text
PHENMO WEBSITE/
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules (secrets, databases, node_modules)
├── index.html              # Marketing website landing page
├── style.css               # Main website styles and responsive breakpoints
├── server.js               # Node.js HTTP server & REST API router
├── server/
│   ├── db.js               # SQLite data layer & schema migrations
│   ├── supabase.js         # Supabase PostgreSQL adapter & fallback handler
│   └── sync-to-supabase.js # Data migration CLI script
├── staff-portal/
│   ├── index.html          # Staff portal entry & authentication
│   ├── inventory.html      # Warehouse equipment manager & scanner
│   ├── plan.html           # Event production planning & booking
│   ├── app.js              # Portal frontend application logic
│   ├── style.css           # Portal responsive UI styles
│   └── sw.js               # Service Worker for offline PWA caching
├── supabase/
│   ├── schema.sql          # PostgreSQL DDL, RLS policies, indexes
│   └── seed.sql            # Seed dataset with all 538 consolidated assets
└── test/
    ├── api.test.js         # API and database test suite
    └── security.test.js    # Security & regression tests
```

---

## 📄 License
Private and Proprietary — Phenmo Events.
