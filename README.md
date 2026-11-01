# Unified AI Operations Dashboard for Quality Assurance

Unified AI Operations Dashboard is a full-stack QA productivity platform. It gives QA teams one structured workspace for test-case generation, bug drafting, device inventory lookup, policy assistance, workflow routing, knowledge-source visibility, and implementation evidence.

## Problem Statement

QA teams often work across many disconnected tools: requirement documents, test cases, bug reports, device sheets, account records, and policy guidance. This causes slow preparation, repeated context switching, inconsistent QA artifacts, and difficulty finding approved information quickly.

The main problem this project solves is:

> How can a QA team use AI to speed up repeated operational work while keeping outputs structured, reviewable, traceable, and controlled by humans?

## Solution

The dashboard provides a unified operations interface with focused modules instead of a generic chatbot. Each module captures structured input, sends requests through the backend, validates generated results, and returns editable outputs for human review.

Key solutions included:

- Test Case Generator: converts Microsoft Teams Android/iOS requirements into structured positive, negative, and edge test cases with a web table, JSON export, and Excel export. Web and desktop targets are not supported.
- Bug Drafter: converts issue context into a triage-ready defect draft.
- Devices: provides a shared PostgreSQL-backed device inventory with manual editing, same-user device additions, and confirmed AI change previews. Account is removed from navigation.
- Policy Setup Assistant: uses OpenAI to recommend an allowlisted Microsoft admin portal and navigation steps; supports protected local browser login with manual MFA. Supporting guidance comes from Microsoft Learn or local knowledge files.
- AI Assistant: routes natural-language intent to the correct workflow.
- Knowledge Sources: shows the local evidence documents used by the policy assistant.
- Health & Evidence: shows AI mode, configured model, validation controls, and project proof points.

## What We Used

- Frontend: React 19, TypeScript, Vite, React Router, Lucide icons.
- Backend: Express 5, TypeScript, Zod validation.
- AI provider: OpenAI GPT-5 mini through a backend-only API integration.
- Knowledge base: Microsoft Learn search extraction plus local Markdown fallback files in `knowledge/`.
- Styling: custom responsive CSS with premium desktop and mobile dashboard layouts.
- Runtime: Node.js. This workspace also includes a portable Node setup in `.tools/` for local execution.

## How It Implements

The browser never calls OpenAI directly. All AI and data operations go through the Express API.

Request flow:

```text
React UI -> Express API -> Service layer -> OpenAI or local knowledge/data -> validated response -> React UI
```

Implementation details:

- The frontend routes live in `src/App.tsx`.
- API endpoints are defined in `server/index.ts`.
- AI calls are handled by `server/services/openaiService.ts`.
- Test-case generation logic is in `server/services/testCaseService.ts`.
- Bug drafting logic is in `server/services/bugService.ts`.
- Device inventory data and search are in `server/services/directoryService.ts`.
- Policy retrieval from Microsoft Learn and local fallback data is in `server/services/policyService.ts`.
- Shared backend types are in `server/types.ts`.
- Frontend types are in `src/types.ts`.

AI-generated outputs are not blindly trusted. The backend checks required fields and expected shapes before returning data to the browser. Test generation explicitly labels deterministic demo output when AI is unavailable or invalid; it is not requirement-complete coverage. Policy portal recommendations fail explicitly rather than guessing a destination when OpenAI is unavailable.

## Test Case Table and Excel Export

The Test Case Generator displays generated cases in a table on the web page and includes a `Download Excel` action. Both use these columns:

- `ID`
- `Test Title`
- `Action Steps`
- `Expected Steps`
- `Attachments`

Action Steps and Expected Steps are numbered for readability. The Excel file is generated in the browser from the current test-case results. Optional screenshot lookup searches Microsoft Learn, reads Teams documentation, and includes matching platform image links with source attribution in the table, JSON, and Excel exports. Images are external reference material, not proof of test execution. Missing images and retrieval failures are reported explicitly; screenshots are never fabricated by AI.

### Requirement documents

Upload TXT, Markdown, text-based PDF or DOCX files up to 5 MB and 60,000 extracted characters. The backend extracts text and asks the configured OpenAI provider to structure requirements into IDs, titles and descriptions. If structuring is unavailable, paragraph-based extraction is explicitly labeled. Original text remains visible and populates an editable Requirement field, so AI summaries cannot silently drop acceptance criteria. Review the structured draft before generating cases. Scanned PDFs require OCR before upload. Legacy `.doc` files are not supported.

Document text is sent to the configured AI provider. Remove credentials, secrets and personal data before upload. Uploaded documents are processed in memory rather than saved by the application.

## Policy Assistant

The Policy Setup Assistant chat asks OpenAI to choose from fixed Teams, Intune, Entra, Microsoft 365 and Purview portal IDs, never arbitrary URLs. It shows the portal link, role considerations and suggested navigation steps. Up to three previous requests provide follow-up context. Use the separate supporting-guidance action to search Microsoft Learn, with approved local Markdown fallback.

### Optional automated admin login: local/private Node desktop only

This is deliberately unavailable on Vercel. Playwright runs directly in the backend; an MCP server is not required. A browser controlled through an editor's MCP connection is not a deployed application backend.

1. Install Chromium with `npx playwright install chromium`.
2. Set `POLICY_AUTOMATION_ENABLED=true` in the local `.env`.
3. Generate an operator token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and set `POLICY_AUTOMATION_TOKEN` to that value (at least 32 characters). Never commit it.
4. Run `npm run dev:api` and, in another terminal, `npm run dev:web -- --host 127.0.0.1`. Or run `npm run build` followed by `npm start`.
5. Access the dashboard on localhost. Use `CLIENT_ORIGIN=http://localhost:5173` for Vite, or `http://localhost:4000` when serving the production build on the default port.
6. Request a policy recommendation, expand automated login, and enter the operator token and admin credentials in the separate form. Do not enter credentials in the AI chat.

When enabled, the Node server binds only to `127.0.0.1`. Login endpoints require the operator bearer token, a loopback connection/Host, and an approved Origin when present. Do not expose this service through a reverse proxy or shared remote desktop. The token grants access to the single local operator's browser session.

The backend opens a visible, nonpersistent, isolated Chromium browser on **the backend computer** and submits credentials only on `login.microsoftonline.com`. Browser traffic is restricted to Microsoft portal/identity domains. Passwords are excluded from AI prompts and application logs, cleared from form state after submission, and not deliberately saved to disk. JavaScript strings cannot provide guaranteed secure memory erasure. No screenshots, traces, storage state or credential files are recorded by this feature.

Complete MFA, Conditional Access prompts, sign-in errors and policy navigation in that visible window. Submission is not reported as successful authentication. Federated/custom identity providers require the manual portal link. At most one automation session runs at a time; it closes after ten minutes, when the browser is closed, or via the Close session button. No MFA bypass, policy editing or policy saving is automated. A real tenant's sign-in and permissions must be verified by an authorized administrator.

## Device Inventory

The Devices module uses hosted PostgreSQL as the shared source of truth. The original device sheet is seeded once when the database is first initialized. Subsequent changes are read from the database, not overwritten by hard-coded starter data.

It supports:

- Search by owner, device, ID, OS, serial number, accessories or notes.
- Filter by owner, platform, and status.
- Sort by any visible column.
- Active and obsolete device status.
- Android, iOS, and iPadOS platform badges.
- CSV export for the currently visible rows, including IDs and notes. Spreadsheet formula-like values are escaped.
- Edit every device field except the immutable record ID, including name, grouping number, device, platform, OS, serial, accessories, status and notes.
- Add a device manually, or use **Add for user** to add another row without replacing that person's existing devices.
- Remove a row after reviewing and confirming its deletion.
- Describe several changes in one prompt, review the AI's before/after preview, then confirm the save. Ambiguous requests ask for a device ID or serial number instead of guessing.
- Save a batch atomically. Revision checks reject stale editors/previews instead of overwriting someone else's changes.
- Refresh open device pages every 10 seconds and when the window gains focus. Search, filters, counts and exports all use the same current records.

### Connect a shared hosted database

1. Create a PostgreSQL database with Neon, Supabase or your existing provider. In Neon Console, select **Connect** and copy the PostgreSQL connection string; a pooled endpoint is suitable for serverless deployments.
2. Set `DATABASE_URL` in the local backend environment and in every deployed instance that should share the same inventory:

   ```env
   DATABASE_URL=postgresql://ROLE:PASSWORD@HOST/DATABASE?sslmode=require
   ```

   Use the provider's recommended TLS settings and keep the real value private. Never use a `VITE_` prefix, put the URL in frontend code, or commit it.
3. Restart the backend. The database role needs permission to create the `qa_inventory_state` and `qa_device_inventory` tables on first use, then read/write them.
4. Open Devices and verify it says **Shared PostgreSQL inventory**. Save a manual or confirmed AI change; another instance connected to the same database will see it on its next refresh.

Without `DATABASE_URL`, the starter inventory remains visible but is explicitly **read-only**, and mutation endpoints return an actionable error. If a configured database is unavailable, the app reports the error rather than falling back to stale starter data. A failed refresh preserves the last visible records and labels them as potentially stale.

AI proposals send the inventory and prompt to the configured backend AI provider; do not put secrets in device notes. Proposals are not persisted until confirmation. Row IDs are generated server-side and independent of owner names, so one user can have multiple devices.

Shared saving does not add a user identity/role system. Keep deployments behind your organization's access controls; any user with access to this dashboard's API can edit the shared inventory. Provision database access and backups according to your organization's requirements.

## Admin / Dev Accounts

Signing in with the configured admin or dev credentials adds an **Account** item to the navigation bar. Anonymous visitors see an **Admin / Dev sign in** link instead.

1. Configure `DATABASE_URL` (see above).
2. Set the credentials in the backend environment (never with a `VITE_` prefix):

   ```env
   ADMIN_USERNAME=admin-username
   ADMIN_PASSWORD=a-strong-admin-password
   DEV_USERNAME=dev-username
   DEV_PASSWORD=a-strong-dev-password
   ```

3. Restart the backend. On first use it creates `qa_accounts` and `qa_account_sessions`, storing only scrypt password hashes and SHA-256 session-token hashes.

- Usernames are case-insensitive; passwords must be at least 8 characters and the two usernames must differ.
- The environment is the source of truth: changing a password or username, or removing a pair, revokes the old credentials and their sessions on the next backend start.
- Sessions last 8 hours in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` over HTTPS). Sign out from the Account page.
- The Account page shows the username, role and session expiry. Admins also see the list of configured accounts.
- Failed sign-ins are limited to 5 per client and username every 15 minutes (per backend instance).

This is an account section, not an access gate: other dashboard workflows remain available without signing in.

### Ring test accounts

The Account page also lists shared Microsoft 365 test accounts grouped by ring (R0–R4). Any signed-in admin or dev can **add**, **edit** (ring, username, notes, password), **show/copy** the password, or **remove** an account. Leave the password blank while editing to keep the current one.

- Passwords are encrypted with AES-256-GCM using `TEST_ACCOUNT_SECRET` (at least 32 characters) and stored in `qa_test_accounts`. They are only decrypted for a signed-in user who clicks show or copy, and are never logged.
- Generate the secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Use the same value in every instance that shares the database. Changing or losing it makes stored passwords unreadable.
- Each change records which admin/dev made it and when. Usernames must be unique (case-insensitive).
- Never put test account passwords in source code or `.env.example`. Enter them through the Account page.

## Run

Install Node.js first, then:

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

The API runs on:

```text
http://localhost:4000
```

## Deploy to Vercel

This project is configured for Vercel with `vercel.json`.

Deployment structure:

- Vite builds the React frontend into `dist/`.
- Vercel serves `dist/` as the web app.
- `api/index.ts` exports the Express app as a Vercel Node function.
- `vercel.json` rewrites `/api/*` requests to the Express function.
- All other routes rewrite to `index.html` so React Router works after refresh.
- `knowledge/**` is included with the function so the Policy Assistant can read local Markdown sources.

Recommended Vercel settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Add these environment variables in Vercel Project Settings:

```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5-mini
AI_TIMEOUT_MS=55000
CLIENT_ORIGIN=https://your-vercel-domain.vercel.app
DATABASE_URL=your-private-hosted-postgresql-connection-string
ADMIN_USERNAME=your-admin-username
ADMIN_PASSWORD=your-admin-password
DEV_USERNAME=your-dev-username
DEV_PASSWORD=your-dev-password
TEST_ACCOUNT_SECRET=your-random-32-plus-character-secret
```

You can deploy by pushing this folder to GitHub and importing the repository in Vercel, or by using the Vercel CLI:

```bash
npm install -g vercel
vercel
vercel --prod
```

## Environment

Add your OpenAI API key to `.env` before using live AI generation:

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5-mini
AI_TIMEOUT_MS=55000
```

## Verification

Use these commands to verify the project:

```bash
npm run typecheck
npm test
npm run build
```

`npm run typecheck` verifies frontend and backend TypeScript. `npm run build` verifies the production frontend and server build.
`npm test` covers mobile scope, document parsing, screenshot attribution, portal validation, login access controls and an isolated browser sign-in fixture. Install Chromium with `npx playwright install chromium` before running the browser test. The tests use fake credentials and mock AI/Microsoft pages; they do not authenticate to a real tenant.
Device tests run against an isolated, temporary embedded PostgreSQL instance using the real `pg` driver. They cover field edits, same-owner additions, transaction rollback, revision conflicts, confirmed AI plans, durable restart persistence and empty-inventory behavior. They do not connect to your hosted database or modify real device records.

## API Routes

- `GET /api/health`
- `GET /api/metrics`
- `GET /api/activity`
- `POST /api/test-cases/generate`
- `POST /api/requirements/extract`
- `POST /api/bugs/draft`
- `GET /api/directory/search?q=`
- `POST /api/directory/plan` (`prompt`, current `revision`; preview only)
- `POST /api/directory/changes` (`changes`, current `revision`; atomic save)
- `POST /api/policy/ask`
- `POST /api/policy/setup`
- `POST /api/policy/login/start` (protected localhost-only)
- `POST /api/policy/login/close` (protected localhost-only)
- `POST /api/assistant/route`
- `GET /api/knowledge/sources`
- `POST /api/auth/login` (`username`, `password`; sets session cookie)
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/account` (signed-in admin/dev only)
- `GET /api/test-accounts`, `POST /api/test-accounts`, `PUT /api/test-accounts/:id`, `DELETE /api/test-accounts/:id`, `POST /api/test-accounts/:id/reveal` (signed-in admin/dev only)

## Project Evidence

- `docs/demo-script.md` contains the five-minute live demo flow.
- `docs/project-report.md` explains the project design, architecture, controls, limitations, and roadmap.
- `knowledge/` contains the approved local policy sources.
