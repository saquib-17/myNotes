# MyNotes — Local PostgreSQL Environment & Safe Setup Plan (Stage 2A)

This document records the verified local PostgreSQL environment inspection results, tooling compatibility findings, and safe, user-executed provisioning instructions for the `MyNotes` local development database.

> [!IMPORTANT]
> **Stage 2A Scope & Authorization:** This document provides inspection findings and safe planning only. In compliance with Stage 2A constraints, no database instances, roles, tables, or schema modifications have been executed by the agent, and no packages have been installed yet.

---

## 1. Confirmed Environment Inspection Findings

An automated, non-destructive inspection was performed on the local Windows environment. The findings are categorized into confirmed states and intentionally unknown properties (to preserve credential privacy).

### Confirmed Findings (Verified via CLI & System Queries)
| Component | Status | Details |
| :--- | :--- | :--- |
| **Operating System** | Confirmed | Windows |
| **Node.js Runtime** | Confirmed | `v22.14.0` (Node.js 22 LTS) |
| **Package Manager** | Confirmed | `npm 11.6.2` |
| **PostgreSQL Client Binaries** | Confirmed | `psql.exe`, `pg_dump.exe`, `pg_isready.exe` version **18.6** |
| **Binary Location** | Confirmed | `C:\Program Files\PostgreSQL\18\bin` (Present in system `PATH`) |
| **Windows Service** | Confirmed | Name: `postgresql-x64-18`<br>Display: `postgresql-x64-18 - PostgreSQL Server 18`<br>Status: **`Running`**<br>StartType: **`Automatic`** |
| **TCP Port Availability** | Confirmed | Port **`5432`** on `127.0.0.1` (`TcpTestSucceeded: True`) |
| **Server Responsiveness** | Confirmed | `pg_isready -h localhost -p 5432` reports: `localhost:5432 - accepting connections`<br>*(Note: `pg_isready` establishes server acceptance of incoming connection attempts; it does not prove successful authenticated application access).* |
| **Existing Server Manifest** | Confirmed | `server/package.json` (`dotenv ^16.4.7`, `express ^4.21.2`, `pg ^8.23.1`, `node-pg-migrate ^9.0.0`, ES modules) |
| **Environment File Security** | Confirmed | `.gitignore` explicitly ignores `.env`, `*.env`, `.env.local` while preserving `!*.env.example` |

### Intentionally Unknown Properties (Preserving Credential Privacy)
- **Superuser Password:** The password for the administrative `postgres` role was not queried, requested, or brute-forced.
- **Existing User Roles:** Existing roles inside the PostgreSQL cluster have not been inspected to avoid unauthorized catalog enumeration.
- **Existing Databases:** Other databases residing on the local cluster have not been queried or inspected.

---

## 2. Tooling Compatibility Verification

The approved direction for Stage 2B requires:
- **Database:** PostgreSQL (verified local version 18.6).
- **Node.js Driver:** `pg` (`node-postgres`).
- **Migration Framework:** `node-pg-migrate` executing SQL migration files.

### Compatibility Matrix
- **Node.js `v22.14.0`:**
  - `pg` (`^8.13.0` / `^8.23.0`): Supports Node.js `>= 16.0.0`. Fully compatible with Node 22.
  - `node-pg-migrate` (`^7.9.0` / `^9.0.0`): Requires Node.js `>= 20.11.0`. Fully compatible with Node 22.
- **PostgreSQL 18.6:**
  - Standard PostgreSQL frontend/backend protocol 3.0 is used by `pg` and `node-pg-migrate`. Both tools operate seamlessly with PostgreSQL 18.x.
- **Zero-Cost Constraint:**
  - The entire database stack runs locally on `localhost:5432`. No external accounts, third-party cloud services, or paid tiers are needed.

*Package dependencies will be added to `server/package.json` in Stage 2B.*

---

## 3. Environment Branch Guidance

### Branch A: PostgreSQL Is Installed and Running (Current Machine State)
**This is the confirmed state of your local machine.**
- PostgreSQL 18.6 is installed and actively listening on port 5432.
- The `postgresql-x64-18` service is already running.
- You do **not** need to install PostgreSQL or start any services. Proceed directly to **Section 4: Safe Database Provisioning Instructions**.

---

### Branch B: PostgreSQL Is Installed but Not Running (Reference for Other Environments)
If the service is stopped in the future or on another machine:
1. Open PowerShell as Administrator.
2. Check the service status:
   ```powershell
   Get-Service postgresql*
   ```
3. Start the service:
   ```powershell
   Start-Service postgresql-x64-18
   ```
4. Verify responsiveness without authenticating:
   ```powershell
   pg_isready -h localhost -p 5432
   ```

---

### Branch C: PostgreSQL Is Absent (New Machine / Clean Setup Reference)
If setting up on a clean Windows machine without PostgreSQL:
1. Download the official installer from the [PostgreSQL Official Windows Downloads (EDB)](https://www.postgresql.org/download/windows/).
2. Run the installer and select the essential components:
   - **PostgreSQL Server** (Required)
   - **Command Line Tools** (Required — includes `psql` and `pg_dump`)
   - *pgAdmin 4* (Optional GUI; not required for CLI/automated development)
   - *Stack Builder* (Not required; uncheck to save space and time)
3. Set an administrator password for the `postgres` user during the setup wizard. **Store this password securely in a personal password manager.**
4. Leave the default port set to `5432`.
5. Complete installation and verify in PowerShell using:
   ```powershell
   psql --version
   pg_isready -h localhost -p 5432
   ```

---

## 4. Safe User-Executed Database Provisioning Instructions

Follow these exact steps in your own terminal to create the isolated development database and application role.

> [!SECURITY]
> - Never share your database password in chat, Git commits, or public tickets.
> - Setting the password with the interactive `\password` command in `psql` prevents credentials from appearing in your command history or process monitors.
> - The application role is intentionally non-superuser and cannot create other databases or roles.

### Step 1: Connect as Superuser in `psql`
Open your terminal (PowerShell or Command Prompt) and launch `psql` as the administrative user:

```powershell
psql -U postgres -h localhost -p 5432
```
*Enter the superuser password you selected when PostgreSQL was originally installed.*

---

### Step 2: Check for Existing Roles and Databases
Before creating new objects, confirm that `mynotes_app` and `mynotes_dev` do not already exist:

```sql
-- Check existing roles:
\du

-- Check existing databases:
\l
```
*If either `mynotes_app` or `mynotes_dev` is already listed from a previous project, do not drop or overwrite them. Review whether they can be reused or if an alternate name is required.*

---

### Step 3: Create the Dedicated Application Role
Create a dedicated non-superuser login role without cluster administration rights:

```sql
CREATE ROLE mynotes_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
```

---

### Step 4: Interactively Assign a Secure Password
Run the `\password` meta-command. This prompts you to enter and confirm a password privately without writing it to shell history or SQL logs:

```sql
\password mynotes_app
```
*(Enter your chosen local development password twice).*

---

### Step 5: Create the Dedicated Development Database
Create the `mynotes_dev` database and assign ownership directly to the `mynotes_app` role:

```sql
CREATE DATABASE mynotes_dev OWNER mynotes_app;
```

---

### Step 6: Grant Schema Permissions in PostgreSQL 15+
PostgreSQL 15 and later restrict the default `public` schema. Connect to `mynotes_dev` and ensure `mynotes_app` has full authority over the `public` schema for running migrations:

```sql
\c mynotes_dev

GRANT ALL ON SCHEMA public TO mynotes_app;
ALTER SCHEMA public OWNER TO mynotes_app;
```

Exit `psql`:
```sql
\q
```

---

### Step 7: Verify Connectivity with the Dedicated Role
Test connecting directly with the new credentials:

```powershell
psql -U mynotes_app -d mynotes_dev -h localhost -p 5432
```
*When prompted, enter the password you assigned to `mynotes_app`.*

Run the verification query inside `psql`:
```sql
SELECT current_user, current_database(), version();
```
Expected output:
- `current_user`: `mynotes_app`
- `current_database`: `mynotes_dev`

Exit `psql`:
```sql
\q
```

> [!NOTE]
> **Single-Role Local Development:** Using `mynotes_app` for both application queries and migration execution is an approved local development simplification. In Stage 13 (Deployment and Hardening), separate migration and least-privilege runtime roles will be evaluated for production environments.

---

## 5. Planned Local Configuration Strategy

In Stage 2B, backend database connections will be configured via environment variables.

### Recommended Approach: Granular `PG*` Variables
The official `pg` driver natively recognizes standard PostgreSQL environment variables. Using distinct variables prevents URL-encoding issues with complex passwords and simplifies local debugging:

```env
# Database Connection Configuration (Stage 2)
PGHOST=localhost
PGPORT=5432
PGDATABASE=mynotes_dev
PGUSER=mynotes_app
PGPASSWORD=your_secure_password_here
```

### Alternative: `DATABASE_URL` Considerations
If a single connection URL is used (e.g., `postgresql://mynotes_app:password@localhost:5432/mynotes_dev`):
- Special characters in passwords (such as `#`, `@`, `%`, `&`, `?`) **must be percent-encoded** (RFC 3986) to prevent parsing errors.
- Connection strings must **never** be logged to stdout, files, or error messages because they contain embedded secrets in plain text.
- Because discrete `PG*` variables are cleanly supported by both `pg` and `node-pg-migrate`, discrete variables are the primary recommended standard for `MyNotes`.

### Security and TLS Rules
- Real `.env` files containing `PGPASSWORD` must remain untracked by Git.
- Local connections over loopback (`localhost` / `127.0.0.1`) do not require TLS.
- In production / hosted environments, TLS will be enforced. Never globally disable SSL verification (`rejectUnauthorized: false`) in application configurations.

---

## 6. Verification and Troubleshooting Checklist

| Symptom / Error | Cause | Remediation |
| :--- | :--- | :--- |
| `psql: error: connection to server at "localhost" (127.0.0.1), port 5432 failed: Connection refused` | PostgreSQL service is stopped or listening on a different port. | Verify service state via `Get-Service postgresql*` and start it with `Start-Service postgresql-x64-18`. |
| `FATAL: password authentication failed for user "mynotes_app"` | Incorrect password entered or character encoding issue. | Reconnect as `postgres` and re-run `\password mynotes_app` to reset the password. |
| `FATAL: database "mynotes_dev" does not exist` | Step 5 was skipped or typo in database name. | Connect as `postgres` and verify `\l`. Run `CREATE DATABASE mynotes_dev OWNER mynotes_app;` if missing. |
| `permission denied for schema public` | PostgreSQL 15+ default public schema ownership restriction. | Connect as `postgres` to `mynotes_dev` (`\c mynotes_dev`) and execute `ALTER SCHEMA public OWNER TO mynotes_app;`. |
| Port conflict on 5432 | Another local service (e.g., Docker container or older PostgreSQL version) is bound to 5432. | Run `Get-NetTCPConnection -LocalPort 5432` to inspect the owning process ID. |

---

## 7. Stage 2B Operational Architecture and Migration Guide

### First-Run Sequence
For a newly configured environment or new developer machine:
1. Ensure `mynotes_app` role and `mynotes_dev` database exist (Sections 3 & 4).
2. Configure `server/.env` with discrete `PG*` variables (Section 5).
3. Run `npm run db:check`: Confirms identity, database target, and warns that `app_metadata` is not yet present.
4. Run `npm run db:migrate`: Executes pending SQL migrations atomically.
5. Run `npm run db:migrate:status`: Verifies that all migrations are recorded and zero are pending.
6. Run `npm run db:check`: Confirms full database and schema readiness with exit code 0.
7. Start the server (`npm run dev`) and query `GET /api/ready` over HTTP.

### Migration Commands
- **`npm run db:migrate`**: Executes pending version-controlled migrations in `server/migrations/` using `node-pg-migrate`. Performs pre-execution safety checks:
  - Asserts that connected user is `mynotes_app` and connected database is `mynotes_dev`.
  - Halts immediately on target mismatches or table collisions.
  - Applies migrations inside a single transaction (`singleTransaction: true`).
- **`npm run db:migrate:status`**: Read-only inspector querying the official `pgmigrations` table. Reports applied migrations with execution timestamps and any unapplied files in `server/migrations/`.
- **`npm run db:check`**: Standalone verification script checking database reachability, identity, and foundation table presence. Exits nonzero on failure. Always closes pool connections cleanly.

### Foundation Table: `app_metadata`
The initial migration (`1700000000000_create-app-metadata.sql`) creates a minimal key-value foundation table:
- `key` (text, primary key)
- `value` (jsonb, not null)
- `created_at` (timestamptz, not null default `now()`)

**Purpose:** Provides a generic, application-owned place to store system-level flags (such as schema initialization markers, maintenance state, or version tags) without creating business domain tables prematurely. It contains no secrets or environment-specific credentials.

### Why Migrations Are Not Executed on API Startup
Automatic migration execution on server boot is intentionally **avoided**:
- **Race conditions:** When multiple backend workers or processes start concurrently, simultaneous migration execution causes lock contention or duplicate execution errors.
- **Slow deployments & boot failures:** DDL statements can take time. Coupling them to server boot blocks HTTP health checks and fails orchestrator rollouts.
- **Failure blast radius:** A failed migration should be diagnosed explicitly via CLI before traffic routes to the service, rather than crashing the HTTP server with 500 boot crashes.

### Process Health (`/api/health`) vs. Database Readiness (`/api/ready`)
- **`GET /api/health`**: Checks Node.js process liveliness only. Returns HTTP 200 `{ status: "ok", service: "mynotes-api" }`. Never connects to PostgreSQL.
- **`GET /api/ready`**: Verifies that the backend can communicate with PostgreSQL and that the foundation schema (`app_metadata`) exists.
  - Ready: HTTP 200 `{ status: "ready", database: "connected" }`.
  - Unready / Down: HTTP 503 `{ status: "unavailable", message: "Service is not ready" }`.
  - **Security:** Error responses are strictly redacted. Raw database error messages, hosts, ports, credentials, and SQL statements are never sent to the client.

### How Tests Avoid Touching the Real Database
The Express application factory `createApp({ checkReadiness })` in `server/src/app.js` supports dependency injection. Unit and API tests inject mock readiness functions (`async () => true`, `async () => false`, or throwing errors), allowing exhaustive verification of status codes, JSON formats, and error redactions without requiring a running PostgreSQL server or mutating developer databases.

### Scope Boundaries for Stage 2
- Domain tables (notes, tasks, documents, tags) remain strictly unimplemented.

---

## 8. Stage 3A Authentication and PostgreSQL Session Store Architecture

### Database Schema (Migration `1700000000001_create-users-and-sessions.sql`)

#### 1. `users` Table
- `id` (`uuid`, Primary Key, default `gen_random_uuid()`): Stable, collision-free user identifier.
- `email` (`text`, Not Null): Normalized email address.
- `password_hash` (`text`, Not Null): Argon2id password hash.
- `created_at` (`timestamptz`, Not Null, default `now()`): Account creation timestamp.
- `updated_at` (`timestamptz`, Not Null, default `now()`): Last account update timestamp.
- **Email Normalization & Uniqueness:** Enforced at the database level via unique index `idx_users_email_unique ON users (lower(trim(email)))`. Application logic trims and lowercases emails before insertion/lookup (`normalizeEmail`). Concurrent registration conflicts raise PostgreSQL error `23505`, safely mapped to HTTP `409 Conflict`.

#### 2. `"session"` Table (Managed by `connect-pg-simple`)
- `sid` (`varchar`, Primary Key): Signed session ID cookie key.
- `sess` (`json`, Not Null): Serialized session payload (contains `userId`, `csrfToken`).
- `expire` (`timestamp(6)`, Not Null): Session expiration timestamp.
- **Index:** `CREATE INDEX "IDX_session_expire" ON "session" ("expire")`.
- **Automatic Pruning:** The session store runs an automated prune timer every 15 minutes (`pruneSessionInterval: 900`) to remove expired sessions. The timer is cleanly stopped during server shutdown via `closeSessionStore()`.

### Password Policy & Argon2id Hashing
- **Algorithm:** Argon2id with explicit OWASP parameters:
  - Memory cost: `19456 KiB` (~19 MiB)
  - Time cost: `2` iterations
  - Parallelism: `1` lane
- **Policy:** Minimum 15 characters, maximum 128 characters. Spaces and Unicode characters are permitted. Passwords are never trimmed, truncated, or logged.
- **Timing Protection:** Unknown accounts execute a precomputed dummy Argon2id hash verification (`verifyDummyPassword`), ensuring identical CPU/memory execution time and preventing timing-based account enumeration. Failed logins return generic HTTP 401 `Invalid email or password.`

### Session Configuration & Cookie Security
- **Cookie Name:** `mynotes.sid`
- **HTTP-Only:** `httpOnly: true` (prevents JavaScript access, mitigating XSS token theft).
- **SameSite:** `sameSite: "lax"` (protects against cross-site request forgery).
- **Path:** `path: "/"`
- **Secure:** `secure: false` in local development (HTTP); `secure: true` in production (HTTPS).
- **Expiration:** Fixed 7-day lifetime (`604,800,000 ms`). `rolling: false` prevents session extension indefinitely without re-authentication.
- **Session Regeneration:** Session ID is regenerated on successful login (`req.session.regenerate`) to protect against session fixation attacks.

### CSRF & Request Boundary Protection
- **Synchronizer Token:** Session-bound 256-bit cryptographic token generated via `crypto.randomBytes(32).toString('hex')`.
- **Token Acquisition:** `GET /api/auth/csrf` generates an anonymous session token with strict `Cache-Control: no-store` headers.
- **Enforcement:** State-changing requests (`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`) require:
  1. A valid `X-CSRF-Token` header compared in constant time (`crypto.timingSafeEqual`).
  2. A valid `Origin` header matching `CLIENT_ORIGIN` (default `http://localhost:5173`).
- **CSRF Rotation:** CSRF token is regenerated and replaced upon successful login.

### In-Process Rate Limiting
- **Login Throttling:** Maximum 5 failed attempts per 15 minutes per IP.
- **Registration Throttling:** Maximum 10 registration attempts per 60 minutes per IP.
- **Throttled Response:** HTTP `429 Too Many Requests` with a `Retry-After` header.

### Scope Boundaries for Stage 3A
- Frontend authentication screens and AuthContext remain unimplemented (deferred to Stage 3B).
- Email verification, password reset, and MFA are not implemented.


