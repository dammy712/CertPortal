# CertPortal

**SSL Certificate Reseller Platform for the Nigerian Market**

CertPortal is a full-stack SSL/TLS certificate reseller platform built for the Nigerian market. It integrates directly with **Certum** and **GlobalSign** Certificate Authorities via their partner APIs, handles payment in Naira (₦) via Paystack, and provides a complete self-service portal for customers to purchase, validate, and download SSL certificates.

Built by [Valion Technologies Limited](https://valiontech.com) for [3CS Aquarah Limited](https://3csaquarah.com).

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Environment Variables](#environment-variables)
7. [Database Setup](#database-setup)
8. [CA Partner Setup](#ca-partner-setup)
9. [Running the Application](#running-the-application)
10. [Certificate Ordering Flow](#certificate-ordering-flow)
11. [API Reference](#api-reference)
12. [Admin Panel](#admin-panel)
13. [Background Services](#background-services)
14. [Project Structure](#project-structure)
15. [Deployment](#deployment)
16. [Troubleshooting](#troubleshooting)

---

## Features

### Customer Portal
- **Product Catalogue** — Browse SSL certificates from Certum and GlobalSign (DV, OV, EV, Wildcard, Multi-Domain)
- **Wallet System** — Pre-fund a NGN wallet via Paystack; all purchases are deducted from wallet balance
- **Certificate Ordering** — CSR upload/decode, domain configuration, SANs, validity period selection
- **Domain Validation (DCV)** — DNS TXT, DNS CNAME, HTTP File, and Admin Email verification methods
- **Live Order Tracking** — Real-time order status with 30-second auto-refresh on the order detail page
- **Email Verification Banner** — Guided instructions for Certum Admin Email DCV with all valid inbox addresses
- **Certificate Download** — Download certificate, CA bundle, or full chain as `.crt` files
- **Order Cancellation** — Cancel any pre-issuance order with automatic wallet refund; also cancels the order on Certum's side
- **KYC Verification** — Document upload for OV/EV certificates (identity, organisation, authorisation)
- **Notifications** — In-app and email notifications for certificate issuance, expiry, and order updates
- **Certificate Expiry Monitoring** — Alerts at 90, 60, 30, and 7 days before expiry

### Admin Panel
- **Dashboard** — Revenue, order counts, active certificates, and expiring certificate summary
- **Order Management** — Full order list with filtering by status, product type, and date range
- **User Management** — View users, roles, KYC status, and wallet balances
- **KYC Review** — Approve or reject customer identity and organisation documents
- **Product Management** — Enable/disable products, manage CA product code mappings
- **Pricing & Exchange Rates** — Set USD/EUR/PLN → NGN exchange rates and markup percentage; per-product price management for 1/2/3-year validity
- **CA Health Monitor** — Live status of Certum and GlobalSign API connectivity; manual health check trigger
- **Audit Logs** — Complete audit trail of all admin actions, logins, and certificate events
- **Invoice Settings** — Customise invoice header, company details, bank account, payment terms

### System
- **Automatic CA Submission** — DV orders are submitted to Certum immediately after payment
- **5-Minute CA Poller** — Background scheduler polls Certum for pending orders and downloads certificates when issued
- **Retry with Exponential Backoff** — Failed CA submissions automatically retry at 30s → 2min → 10min → 30min → 1hr intervals
- **IP Whitelist Support** — Certum requires your server IP to be whitelisted in the partner portal
- **Rate Limiting** — API-level rate limiting on all endpoints
- **JWT Auth with Refresh Tokens** — Secure authentication with 2FA support
- **Role-Based Access Control** — CUSTOMER, ADMIN, SUPER_ADMIN roles

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Customer Browser                     │
│              React 18 + Vite + Tailwind CSS              │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP (Vite proxy in dev)
                         ▼
┌─────────────────────────────────────────────────────────┐
│               Express API Server (Node.js)               │
│  Auth │ Orders │ Wallet │ Validation │ Certificates      │
│  Admin │ KYC │ Notifications │ Settings │ Monitoring     │
└──────────┬──────────────────────────────────────────────┘
           │                         │
           ▼                         ▼
┌──────────────────┐      ┌──────────────────────────────┐
│   PostgreSQL DB   │      │     Certificate Authorities  │
│   (via Prisma)    │      │  ┌─────────────────────────┐ │
└──────────────────┘      │  │ Certum (SOAP / WSDL)    │ │
                          │  │ gs.certum.pl/service/   │ │
                          │  │ PartnerApi.wsdl         │ │
                          │  └─────────────────────────┘ │
                          │  ┌─────────────────────────┐ │
                          │  │ GlobalSign (REST)        │ │
                          │  │ testsystem.globalsign.com│ │
                          │  └─────────────────────────┘ │
                          └──────────────────────────────┘
           │
           ▼
┌──────────────────┐
│  Paystack API     │
│  (NGN Payments)   │
└──────────────────┘
```

### Monorepo Structure

```
CertPortal/
├── apps/
│   ├── backend/          # Express + Prisma + TypeScript API
│   └── frontend/         # React + Vite + Tailwind SPA
├── package.json          # Root workspace config
└── docker-compose.yml    # Optional Docker setup
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, React Router v6, React Hook Form, Zod, Axios |
| Backend | Node.js, Express 4, TypeScript 5 |
| Database | PostgreSQL 14+, Prisma 5 ORM |
| Auth | JWT (access + refresh tokens), bcryptjs, 2FA |
| Payments | Paystack (NGN wallet top-up) |
| CA Integration | Certum SOAP API v5.17, GlobalSign REST API |
| Email | Nodemailer |
| Logging | Winston + winston-daily-rotate-file |
| Validation | express-validator, Zod |
| File Storage | Local filesystem (upgradeable to S3) |

---

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** v18 or higher — [nodejs.org](https://nodejs.org)
- **npm** v9+ (comes with Node.js)
- **PostgreSQL** v14 or higher — [postgresql.org](https://www.postgresql.org/download)
- **OpenSSL** (for Windows: [slproweb.com/products/Win32OpenSSL.html](https://slproweb.com/products/Win32OpenSSL.html))
- **Git**

You will also need accounts/credentials for:

- **Certum Partner Account** — [certum.eu](https://www.certum.eu) (apply for a reseller/partner account)
- **GlobalSign Partner Account** — [globalsign.com](https://www.globalsign.com) (optional)
- **Paystack Account** — [paystack.com](https://paystack.com) (for NGN wallet payments)

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/dammy712/CertPortal.git
cd CertPortal
```

### 2. Install all dependencies

```bash
npm install
```

This installs dependencies for both the backend and frontend workspaces.

### 3. Create environment files

```bash
cp apps/backend/.env.example  apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Now fill in the values — see [Environment Variables](#environment-variables) below.

---

## Environment Variables

### Backend — `apps/backend/.env`

```env
# ── Application ──────────────────────────────────────────
NODE_ENV=development
PORT=5000
APP_NAME=CertPortal
FRONTEND_URL=http://localhost:3000

# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://certuser:certpassword@localhost:5432/certportal_dev

# ── JWT Auth ─────────────────────────────────────────────
JWT_ACCESS_SECRET=your_access_secret_min_32_chars_here
JWT_REFRESH_SECRET=your_refresh_secret_min_32_chars_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ── Certum Partner API ───────────────────────────────────
# Test environment (use this for development)
CERTUM_API_URL=https://gs.test.certum.pl/service/PartnerApi.wsdl
# Production (uncomment when going live)
# CERTUM_API_URL=https://gs.certum.pl/service/PartnerApi.wsdl

CERTUM_API_KEY=your_certum_partner_username
CERTUM_API_SECRET=your_certum_partner_password

# ── GlobalSign Partner API ───────────────────────────────
# Test environment
GLOBALSIGN_API_URL=https://testsystem.globalsign.com
# Production
# GLOBALSIGN_API_URL=https://system.globalsign.com
GLOBALSIGN_API_KEY=your_globalsign_api_key
GLOBALSIGN_API_SECRET=your_globalsign_api_secret

# ── Paystack ─────────────────────────────────────────────
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key

# ── Email ────────────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=CertPortal <noreply@yourdomain.com>

# ── File Storage ─────────────────────────────────────────
UPLOAD_DIR=uploads
# For S3 (optional):
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=
# AWS_S3_BUCKET=
```

### Frontend — `apps/frontend/.env`

```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key
VITE_APP_NAME=CertPortal
```

---

## Database Setup

### 1. Create the PostgreSQL database and user

```bash
psql -U postgres
```

```sql
CREATE USER certuser WITH PASSWORD 'certpassword';
CREATE DATABASE certportal_dev OWNER certuser;
ALTER USER certuser CREATEDB;
\q
```

### 2. Run Prisma migrations

```bash
cd apps/backend
npx prisma generate
npx prisma migrate dev --name init
```

### 3. Seed the database

This creates the initial product catalogue (Certum + GlobalSign products):

```bash
npx prisma db seed
```

### 4. (Optional) Open Prisma Studio

A visual database browser:

```bash
npx prisma studio
```

---

## CA Partner Setup

### Certum Setup

Certum uses a **SOAP API** with IP-based access control. Both the test and production environments require your server's IP to be whitelisted before any API calls will succeed.

**Step 1 — Get a partner account**

Apply for a Certum reseller/partner account at [certum.eu](https://www.certum.eu). You will receive a partner username and password.

**Step 2 — Whitelist your server IP**

1. Find your server's public IP:
   ```bash
   curl ifconfig.me
   ```

2. Log into the Certum CertManager test portal:
   - Test: [certmanager.test.certum.pl](https://certmanager.test.certum.pl?language=en)
   - Production: [certmanager.certum.pl](https://certmanager.certum.pl?language=en)

3. Go to **Account Settings → API Access** and add your IP address.

**Step 3 — Verify the integration**

Restart the backend. You should see in the logs:
```
[CA Health] Certum API reachable and authenticated ✓
[CA Health] Product catalog updated — Certum: ✓ active
```

**Important SOAP API facts (for developers):**
- The WSDL URL IS the service endpoint — POST directly to it, do not strip `.wsdl`
- Namespace: `http://webservice.api.muc.unizeto.pl/`
- Auth goes inside the SOAP body as `<requestHeader><authToken>`, NOT in WS-Security headers
- `<password>` comes before `<userName>` in the schema
- Order statuses: `AWAITING → VERIFICATION → ACCEPTED → ENROLLED` (ENROLLED = issued)
- Revocation requires the certificate serial number in HEX, not the order ID
- DCV methods: `ADMIN`, `DNS_TXT`, `DNS_CNAME`, `DNS_TXT_PREFIX`, `DNS_CNAME_PREFIX`, `FILE`

### GlobalSign Setup

GlobalSign uses a **REST API**. Contact GlobalSign for partner API credentials and follow their onboarding process.

---

## Running the Application

### Development (recommended)

Run both frontend and backend simultaneously from the root:

```bash
# Terminal 1 — Backend
cd apps/backend
npm run dev
# Runs on http://localhost:5000

# Terminal 2 — Frontend
cd apps/frontend
npm run dev
# Runs on http://localhost:3000
```

The Vite dev server proxies all `/api` requests to `http://localhost:5000`, so you never hit CORS issues in development.

### Production Build

```bash
# Build frontend
cd apps/frontend
npm run build

# Build backend
cd apps/backend
npm run build

# Start backend (serves compiled JS)
npm start
```

### First-time admin account

After seeding, create the first admin user directly in the database:

```sql
UPDATE users SET role = 'SUPER_ADMIN' WHERE email = 'your@email.com';
```

Or use Prisma Studio to update the role field.

---

## Certificate Ordering Flow

Understanding the full lifecycle of an order:

```
1. PENDING_PAYMENT
   Customer selects product → enters domain + CSR → proceeds to checkout
   ↓
2. PAID
   Wallet balance checked → amount deducted → order created in DB
   ↓ (DV certs: auto-submitted immediately)
   (OV/EV certs: wait for KYC/org verification)
3. PENDING_ISSUANCE
   Order submitted to Certum via SOAP quickOrder API
   → Certum assigns a CA order ID (e.g. d6d28131-cbec-49c6-...)
   ↓
   [Domain Validation required]
   Certum sends email to admin@domain.com (ADMIN method)
   Customer must click the link in that email
   ↓
4. PENDING_ISSUANCE (CA processing)
   CA poller checks every 5 minutes via getOrderState API
   Status cycles: AWAITING → VERIFICATION → ACCEPTED → ENROLLED
   ↓
5. ISSUED
   CA returns ENROLLED → backend calls getCertificate API
   PEM files saved to disk → Certificate record created in DB
   → Customer notified via email + in-app notification
   → Certificate available for download
```

### Domain Validation Methods

| Method | How it works | Best for |
|--------|-------------|----------|
| **ADMIN Email** | Certum emails `admin@`, `webmaster@`, `hostmaster@`, `postmaster@`, or `administrator@` your domain | Most common for DV |
| **DNS TXT** | Add a TXT record to your domain's DNS | No email access needed |
| **DNS CNAME** | Add a CNAME record pointing to Certum | Wildcard certs |
| **HTTP File** | Place a file at `/.well-known/pki-validation/` | Server access required; no wildcards |

### Order Cancellation and Refunds

- Orders in `PENDING_PAYMENT`, `PAID`, `PENDING_VALIDATION`, or `PENDING_ISSUANCE` can be cancelled
- If a `caOrderId` exists, the cancellation is also sent to Certum's API before cancelling locally
- Full NGN amount is automatically refunded to the customer's wallet
- `ISSUED` certificates cannot be cancelled — they must be revoked

---

## API Reference

All endpoints are prefixed with `/api/v1/`.

### Authentication — `/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Create a new customer account |
| POST | `/auth/login` | Public | Login, returns access + refresh tokens |
| POST | `/auth/refresh` | Public | Refresh the access token |
| POST | `/auth/logout` | Bearer | Logout and invalidate tokens |
| POST | `/auth/forgot-password` | Public | Send password reset email |
| POST | `/auth/reset-password` | Public | Reset password with token |
| POST | `/auth/2fa/setup` | Bearer | Enable two-factor authentication |
| POST | `/auth/2fa/verify` | Bearer | Verify 2FA code |

### Certificate Products — `/products`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/products` | Bearer | List all active products with prices |
| GET | `/products/:id` | Bearer | Get single product details |

### Certificate Orders — `/certificates`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/certificates/decode-csr` | Bearer | Decode a CSR and extract fields |
| POST | `/certificates/orders` | Bearer | Place a new certificate order |
| GET | `/certificates/orders` | Bearer | List all orders (paginated, filterable) |
| GET | `/certificates/orders/:id` | Bearer | Get order details |
| POST | `/certificates/orders/:id/cancel` | Bearer | Cancel an order + refund wallet |

### Domain Validation — `/validations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/validations` | Bearer | Create a domain validation record |
| GET | `/validations/order/:orderId` | Bearer | Get validation status for an order |
| POST | `/validations/:id/check` | Bearer | Trigger immediate DNS/HTTP check |
| POST | `/validations/:id/resend-email` | Bearer | Resend verification email |

### Issued Certificates — `/issued-certificates`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/issued-certificates` | Bearer | List all issued certificates |
| GET | `/issued-certificates/order/:orderId` | Bearer | Get certificate for an order |
| GET | `/issued-certificates/:id/download` | Bearer | Download cert file (type: cert/chain/fullchain) |
| POST | `/issued-certificates/check-status/:orderId` | Bearer | Immediately poll CA for latest status |

### Wallet — `/wallet`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/wallet` | Bearer | Get wallet balance and recent transactions |
| POST | `/wallet/fund` | Bearer | Initiate Paystack payment to top up wallet |
| POST | `/wallet/verify` | Bearer | Verify Paystack callback and credit wallet |
| GET | `/wallet/transactions` | Bearer | List all wallet transactions |

### KYC — `/kyc`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/kyc/submit` | Bearer | Submit KYC documents |
| GET | `/kyc/status` | Bearer | Check KYC status |
| PUT | `/kyc/:id/approve` | Admin | Approve KYC submission |
| PUT | `/kyc/:id/reject` | Admin | Reject KYC submission |

### Admin — `/admin`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/admin/dashboard` | Admin | Dashboard stats (revenue, orders, certs) |
| GET | `/admin/users` | Admin | List all users |
| GET | `/admin/orders` | Admin | List all orders with full details |
| GET | `/admin/ca-status` | Admin | Current CA health status |
| POST | `/admin/ca-health-check` | Admin | Trigger immediate CA health check |
| POST | `/admin/issue/:orderId` | Admin | Manually trigger certificate issuance |

### Settings — `/settings`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/settings/invoice` | Admin | Get invoice/company settings |
| PUT | `/settings/invoice` | Admin | Save invoice settings |
| GET | `/settings/pricing` | Admin | Get exchange rates and markup |
| PUT | `/settings/pricing` | Admin | Update exchange rates and markup |
| PUT | `/settings/products/:id/prices` | Admin | Update product NGN prices |

---

## Admin Panel

Access the admin panel at `/admin` after logging in with an ADMIN or SUPER_ADMIN account.

### Tabs

| Tab | Description |
|-----|-------------|
| **Overview** | Revenue charts, order funnel, active certificate count, expiry warnings |
| **Analytics** | Order volume by product, revenue by period, CA breakdown |
| **Users** | All registered users, roles, KYC status, wallet balances |
| **KYC Review** | Pending document reviews — approve or reject with notes |
| **Orders** | Full order history with status filters and date range |
| **Certificates** | All issued certificates, expiry dates, revocation controls |
| **Products** | Enable/disable products, manage CA product code mappings |
| **Pricing** | Set USD/EUR/PLN → NGN exchange rates + markup; set prices per product per validity period |
| **Audit Logs** | Complete event log — logins, orders, downloads, admin actions |
| **Invoice Settings** | Company name, address, bank details, invoice prefix |
| **Admin Management** | (Super Admin only) Create and manage admin accounts |

---

## Background Services

### CA Health Check (every 60 minutes)

Runs `getProductList` on Certum and GlobalSign to verify credentials are valid. Automatically marks all products for a CA as hidden if the CA becomes unreachable or credentials expire.

### CA Status Poller (every 5 minutes)

Checks all orders in `PENDING_ISSUANCE` status that have a `caOrderId`:
1. Calls `getOrderState` on the CA
2. If the CA returns `ENROLLED`, calls `getCertificate` to download the PEM
3. Saves the cert to disk and creates a `Certificate` record in the database
4. Updates order status to `ISSUED` and notifies the customer

### Certificate Expiry Monitor (daily at midnight)

Scans all active certificates for upcoming expiry and creates notifications at:
- 90 days before expiry
- 60 days before expiry
- 30 days before expiry
- 7 days before expiry

### CA Submission Retry

If a CA submission fails, exponential backoff is applied:

| Attempt | Wait before retry |
|---------|-------------------|
| 1 → 2 | 30 seconds |
| 2 → 3 | 2 minutes |
| 3 → 4 | 10 minutes |
| 4 → 5 | 30 minutes |
| 5 (final) | 1 hour, then admin notification |

---

## Project Structure

```
apps/backend/src/
├── controllers/          # Route handler functions
│   ├── auth.controller.ts
│   ├── certificate.controller.ts
│   ├── issuance.controller.ts
│   ├── wallet.controller.ts
│   ├── kyc.controller.ts
│   ├── admin.controller.ts
│   ├── settings.controller.ts
│   └── notification.controller.ts
├── services/             # Business logic
│   ├── ca/               # Certificate Authority integrations
│   │   ├── index.ts      # CAProvider interface + resolveProvider factory
│   │   ├── certum.provider.ts    # Certum SOAP API integration
│   │   ├── globalsign.provider.ts # GlobalSign REST API integration
│   │   └── dev.provider.ts       # Local self-signed certs for dev
│   ├── caHealthCheck.service.ts
│   ├── certificate.service.ts    # Order creation, cancellation, CSR decode
│   ├── issuance.service.ts       # CA submission, polling, cert download
│   ├── validation.service.ts     # Domain validation (DNS/HTTP checks)
│   ├── wallet.service.ts
│   ├── kyc.service.ts
│   ├── monitoring.service.ts     # Expiry checking
│   └── settings.service.ts
├── routes/               # Express routers
├── middleware/           # Auth, error handling, rate limiting
├── utils/
│   ├── scheduler.ts      # Cron-style background jobs
│   ├── prisma.ts         # Prisma client singleton
│   ├── logger.ts         # Winston logger
│   ├── fileUpload.ts     # File storage (local/S3)
│   ├── email.ts          # Email templates
│   └── orderHistory.ts   # Order status change logging
├── app.ts                # Express app setup
└── index.ts              # Server entry point

apps/backend/prisma/
├── schema.prisma         # Full database schema
├── migrations/           # Migration history
└── seed.ts               # Product catalogue seed

apps/frontend/src/
├── pages/
│   ├── admin/            # AdminPanel.tsx — all admin tabs
│   ├── auth/             # Login, Register, ForgotPassword
│   ├── orders/           # OrdersPage, NewOrderPage, OrderDetailPage
│   ├── products/         # Product catalogue
│   ├── wallet/           # Wallet and transactions
│   ├── certificates/     # Issued certificates list
│   ├── validation/       # Domain validation flow
│   ├── kyc/              # KYC document upload
│   ├── dashboard/        # Customer dashboard
│   └── profile/          # Profile settings, 2FA
├── api/                  # Typed API client functions
│   ├── certificate.api.ts
│   ├── admin.api.ts
│   └── wallet.api.ts
├── components/           # Shared UI components
├── lib/
│   ├── api.ts            # Axios instance with auth interceptors
│   └── utils.ts          # Tailwind merge helpers
└── hooks/                # Custom React hooks
```

---

## Deployment

### Environment checklist before going live

1. **Switch to production CA endpoints:**
   ```env
   CERTUM_API_URL=https://gs.certum.pl/service/PartnerApi.wsdl
   GLOBALSIGN_API_URL=https://system.globalsign.com
   ```

2. **Whitelist your production server IP** in the Certum production CertManager

3. **Switch Paystack to live keys:**
   ```env
   PAYSTACK_SECRET_KEY=sk_live_...
   PAYSTACK_PUBLIC_KEY=pk_live_...
   ```

4. **Set `NODE_ENV=production`** — disables the dev CA provider

5. **Set strong JWT secrets** — use at least 64 random characters

6. **Set up S3 or persistent storage** — local file storage won't survive container restarts

7. **Run production migration:**
   ```bash
   cd apps/backend
   npx prisma migrate deploy
   ```

### Using Docker (optional)

```bash
docker-compose up -d
```

See `docker-compose.yml` for service configuration.

---

## Troubleshooting

### Certum API returns 403 Forbidden

Your server IP is not whitelisted. Log into [certmanager.test.certum.pl](https://certmanager.test.certum.pl) and add your IP under Account Settings → API Access.

### Certum API returns 404

The `CERTUM_API_URL` in your `.env` is wrong. It must end in `.wsdl`:
```
CERTUM_API_URL=https://gs.test.certum.pl/service/PartnerApi.wsdl
```
Do not strip the `.wsdl` extension — the URL IS the service endpoint.

### "This order cannot be cancelled at its current stage"

The backend `certificate.service.ts` was not updated to include `PENDING_ISSUANCE` in the cancellable statuses. Ensure you are running the latest version of `certificate.service.ts`.

### CSR decode not working (Windows)

OpenSSL is not installed or not in your PATH. Install Win64 OpenSSL from [slproweb.com](https://slproweb.com/products/Win32OpenSSL.html), then add it to PATH:
```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\OpenSSL-Win64\bin", "Machine")
```
Restart your terminal and run `openssl version` to confirm.

### Certificate files keep generating (duplicate certs)

Run the cleanup script to remove duplicate records and junk self-signed files:
```bash
cd apps/backend
npx ts-node cleanup-certs.ts
```

### Order stuck on "Pending Issuance" after email verification

Click the **Check Status** button on the order detail page. This immediately polls Certum's API and downloads the certificate if it's been issued. Alternatively, the CA poller will pick it up within 5 minutes automatically.

### Database connection error

Check that PostgreSQL is running and that your `DATABASE_URL` in `.env` matches the credentials you created in the setup step:
```bash
psql -U certuser -d certportal_dev -c "SELECT 1"
```

### "pollCAStatus is not a function"

An old version of `scheduler.ts` is importing `submitToCA` which no longer exists. Replace `scheduler.ts` with the latest version.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

Proprietary — © 2026 Valion Technologies Limited / 3CS Aquarah Limited. All rights reserved.
