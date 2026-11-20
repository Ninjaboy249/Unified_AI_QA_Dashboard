<div align="center">
  <img src="./docs/assets/readme-hero.gif" width="1024" alt="Animated QA workflow illustration: requirements, AI-assisted test cases and bug drafts, source-cited policy guidance, and human review." />

  <h1>Unified AI Operations Dashboard</h1>
  <p><strong>One workspace. Clear evidence. Human control.</strong></p>
  <p>A full-stack workspace for quality testers to prepare tests, investigate defects,<br />manage devices and retrieve source-cited policy guidance.</p>

  <p>
    <img src="https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&amp;logo=react&amp;logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&amp;logo=typescript&amp;logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&amp;logo=nodedotjs&amp;logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&amp;logo=postgresql&amp;logoColor=white" alt="PostgreSQL" />
  </p>
  <p>
    <img src="https://img.shields.io/badge/AI-Backend_only-0F172A?style=flat-square" alt="Backend-only AI access" />
    <img src="https://img.shields.io/badge/RAG-Source_cited-087F83?style=flat-square" alt="Source-cited retrieval-augmented generation" />
    <img src="https://img.shields.io/badge/Workflow-Human_in_the_loop-7253AB?style=flat-square" alt="Human-in-the-loop workflows" />
  </p>

  <p>
    <a href="#run"><strong>Get started</strong></a> &middot;
    <a href="#solution"><strong>Explore workflows</strong></a> &middot;
    <a href="#policy-assistant"><strong>Set up policy RAG</strong></a> &middot;
    <a href="./docs/demo-script.md"><strong>Demo walkthrough</strong></a>
  </p>
  <sub>Animated workflow illustration, not test-execution evidence. Prefer no motion? <a href="./docs/assets/readme-hero.png">View the static banner.</a></sub>
</div>

---

> [!IMPORTANT]
> AI assists the tester; it does not replace their judgment. Generated tests, bug drafts and policy guidance require human review. The dashboard does not execute generated test cases or apply policies.

## Explore the Workspace

| Prepare | Investigate | Coordinate |
| :--- | :--- | :--- |
| **Test Case Generator**<br />Turn requirements into structured Android/iOS test cases, with Excel and JSON exports. | **Bug Drafter**<br />Convert issue context into a reviewable defect draft with reproduction steps. | **Device Inventory**<br />Find shared devices, edit records and confirm AI-proposed changes. |
| **Policy Evidence**<br />Retrieve Microsoft Learn and public Drive document excerpts through RAG. | **Policy Setup Assistant**<br />Find an approved Microsoft admin portal and review suggested navigation. | **Accounts & Routing**<br />Manage ring test accounts and route natural-language requests to the right workflow. |

<details>
<summary><strong>Documentation navigation</strong></summary>

- [Problem statement](#problem-statement)
- [Solution and capabilities](#solution)
- [Technology stack](#what-we-used)
- [Architecture and implementation](#how-it-implements)
- [Test cases, documents and exports](#test-case-table-and-excel-export)
- [Policy RAG and public Drive setup](#policy-assistant)
- [Shared device inventory](#device-inventory)
- [Admin/dev and ring test accounts](#admin--dev-accounts)
- [Local development](#run)
- [Vercel deployment](#deploy-to-vercel)
- [Environment configuration](#environment)
- [Verification](#verification)
- [API reference](#api-routes)
- [Project evidence](#project-evidence)

</details>

## Problem Statement

QA teams often work across many disconnected tools: requirement documents, test cases, bug reports, device sheets, account records, and policy guidance. This causes slow preparation, repeated context switching, inconsistent QA artifacts, and difficulty finding approved information quickly.

The main problem this project solves is:

> How can a QA team use AI to speed up repeated operational work while keeping outputs structured, reviewable, traceable, and controlled by humans?

## Solution

The dashboard provides a unified operations interface with focused modules instead of a generic chatbot. Each module captures structured input, sends requests through the backend, validates generated results, and returns editable outputs for human review.

| Workflow | What it delivers | Human control |
| :--- | :--- | :--- |
| **Test Case Generator** | Positive, negative and edge cases for Microsoft Teams Android/iOS; web table, JSON and Excel exports. Web and desktop targets are not supported. | Review the requirements and generated cases before execution. |
| **Bug Drafter** | A structured, triage-ready defect draft from issue context. | Confirm reproduction steps, severity and priority. |
| **Devices** | Shared PostgreSQL inventory, manual edits and same-user device additions. | Preview and confirm AI-proposed changes before saving. |
| **Policy Setup Assistant** | Allowlisted Microsoft admin portals and suggested navigation; optional protected local login with manual MFA. | An authorized administrator completes sign-in and reviews policy changes manually. |
| **Policy Evidence** | Full Microsoft Learn articles and automatically discovered public Drive Word documents through RAG. | Inspect original-source links and retrieved excerpts. |
| **AI Assistant** | Natural-language intent routed to the relevant workflow. | Choose and complete the suggested action. |
| **Knowledge & Evidence** | Local fallback sources, AI mode, configured model and implementation proof points. | Check source relevance and operational readiness. |

## What We Used

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Interface** | React 19, TypeScript, Vite, React Router, Lucide | Responsive, workflow-focused desktop and mobile dashboard. |
| **API** | Node.js, Express 5, TypeScript, Zod | Backend-controlled requests and structured validation. |
| **AI** | OpenAI GPT-5 mini; configurable chat and embedding models | Test preparation, bug drafting, recommendations and policy RAG. |
| **Persistence** | PostgreSQL | Shared device inventory, admin/dev sessions and encrypted ring test credentials. |
| **Retrieval** | Microsoft Learn, Google Drive API, Cheerio, Mammoth | Read article bodies and public DOCX/Google Docs content. |
| **RAG** | Overlapping chunks, OpenAI embeddings, cosine similarity | Retrieve relevant excerpts and validate citation IDs. |
| **Presentation** | Custom responsive CSS | Dashboard layouts and consistent workflow components. |

The browser never receives the backend AI or database credentials. Local Markdown remains an explicitly labeled Microsoft Learn fallback. A portable Node setup in `.tools/` can also be used locally when present.

## How It Implements

The browser never calls OpenAI directly. All AI and data operations go through the Express API.

```mermaid
flowchart LR
    UI["React interface"] --> API["Express API + Zod"]
    API --> Services["Workflow services"]
    Services --> AI["OpenAI chat + embeddings"]
    Services --> DB["PostgreSQL inventory + accounts"]
    Services --> Sources["Microsoft Learn + public Drive"]
    AI --> Results["Validated drafts + cited evidence"]
    DB --> Results
    Sources --> Results
    Results --> Review["Tester review + export"]

    classDef interface fill:#0F172A,stroke:#38BDF8,color:#F8FAFC;
    classDef backend fill:#123C46,stroke:#5EEAD4,color:#F0FDFA;
    classDef evidence fill:#32254F,stroke:#C4B5FD,color:#FAF5FF;
    class UI,Review interface;
    class API,Services,DB backend;
    class AI,Sources,Results evidence;
```

<details>
<summary><strong>Explore the implementation map</strong></summary>

| Surface | Entry point |
| :--- | :--- |
| Frontend routes | [`src/App.tsx`](./src/App.tsx) |
| API endpoints / local server | [`server/app.ts`](./server/app.ts) / [`server/index.ts`](./server/index.ts) |
| Backend AI integration | [`openaiService.ts`](./server/services/openaiService.ts) |
| Test generation / bug drafting | [`testCaseService.ts`](./server/services/testCaseService.ts) / [`bugService.ts`](./server/services/bugService.ts) |
| Shared device inventory | [`directoryService.ts`](./server/services/directoryService.ts) |
| Policy RAG orchestration | [`policyService.ts`](./server/services/policyService.ts) |
| Microsoft Learn / public Drive retrieval | [`policyLearnService.ts`](./server/services/policyLearnService.ts) / [`policyDriveService.ts`](./server/services/policyDriveService.ts) |
| Backend / frontend types | [`server/types.ts`](./server/types.ts) / [`src/types.ts`](./src/types.ts) |

</details>

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

### Source-cited policy RAG

Choose **Microsoft Learn**, **Public Google Drive folder**, or **both**, enter a policy question, and click **Find source-cited policy guidance**.

- Learn search locates up to two articles. The backend downloads their article bodies, removes navigation/scripts, and follows only HTTPS `learn.microsoft.com` redirects. Search descriptions alone are not treated as policy evidence.
- Drive documents are discovered automatically from one backend-configured public folder. No Google user login, per-file download links or manual file selection is needed. DOCX and Google Docs (exported to DOCX) directly inside the folder are supported; subfolders, shortcuts and legacy `.doc` files are not included.
- The existing three-document processing limit now applies to the whole public folder. If more than three supported documents are found, retrieval fails explicitly; it never silently processes only the first three. Use a small dedicated policy folder. Each file is limited to 5 MB and 60,000 extracted characters.
- The folder is rediscovered and file membership/access rechecked on every question before extracting document text. Files moved out of the folder or made private cannot be answered from a stale index.
- The backend splits text into 1,600-character chunks with 200-character overlap, embeds the question and chunks, and retrieves up to eight excerpts with cosine similarity of at least 0.25. No vector database extension is required.
- OpenAI produces a draft answer using only these excerpts. Every claim must cite a retrieved excerpt ID. Unknown citations and malformed AI responses are rejected. The UI exposes original-source links and the exact retrieved excerpts.
- If no evidence answers the question, the dashboard says so. Learn failures and local fallback use are explicitly shown; Drive failures stop retrieval rather than silently omitting documents. An empty Drive folder is labeled explicitly. Retrieval similarity is not a probability that an answer is correct.

**Public Google Drive folder setup**

1. Create a dedicated Google Drive folder containing up to three non-sensitive DOCX or Google Docs policy documents directly inside it.
2. Set the folder's **Share > General access > Anyone with the link > Viewer**. Confirm that every document can be opened and downloaded/exported in a signed-out browser. Public folder sharing does not override restricted file permissions or an organization's policy blocking public sharing.
3. Copy the folder ID from `https://drive.google.com/drive/folders/FOLDER_ID`. This is configured once, not entered as a download link for each question.
4. Enable the **Google Drive API** in a Google Cloud project and create an API key. Restrict the key to the Google Drive API and, where possible, your backend's outbound IPs. A browser-referrer restriction is not suitable for server-to-server requests. An API key identifies the project for public data; it does not grant access to private Drive files. See Google's [public-folder listing guide](https://developers.google.com/workspace/drive/api/guides/search-files#list_files_in_a_public_folder).
5. Configure these backend-only environment variables and restart the backend:

   ```env
   GOOGLE_DRIVE_FOLDER_ID=your-public-folder-id
   GOOGLE_DRIVE_API_KEY=your-private-backend-api-key
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   ```

   If the folder share link also contains `resourcekey=...`, set `GOOGLE_DRIVE_FOLDER_RESOURCE_KEY` to that value. File resource keys are read from Drive metadata and carried into downloads and source links.

   Do not commit API keys or give secrets a `VITE_` prefix. Configure `OPENAI_API_KEY`, a chat model and an embedding model supported by your AI endpoint. Public-folder retrieval does not require `DATABASE_URL`, OAuth client credentials, a redirect URI or a Google login.
6. In Policy, choose the public folder or both sources. The dashboard lists supported documents automatically. Authorize AI processing of the configured folder, then ask a question. **Refresh public folder** rechecks configuration and discovery; no individual file links are required.

**Privacy:** Public documents can be read by anyone with their share links. Their contents and resulting answers are available to dashboard users. Do not make confidential policy documents, secrets or personal data public; use only organization-approved material. The backend reads only supported files in the configured folder, never a caller-supplied file ID or URL. Extracted text and embeddings are processed in memory per question, not persisted by the dashboard. Text is sent to the configured AI provider for embeddings, and relevant excerpts for answers; provider retention follows your agreement. Questions, document content and raw Google request URLs (which contain the API key) are not logged by policy routes.

**Migrating from Google sign-in:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and `GOOGLE_DRIVE_SECRET` are no longer used by policy retrieval. The old connect/callback/disconnect endpoints return HTTP 410 and clear old browser cookies. Previously stored `qa_drive_oauth_states` and `qa_drive_sessions` rows are no longer read; have your database administrator remove these obsolete token records and revoke previous Google app grants through Google Account permissions if needed. This migration does not automatically delete your database records or retract answers already received.

RAG performs several sequential upstream calls. The Vercel function budget is 300 seconds; confirm that your hosting plan supports it. With `AI_TIMEOUT_MS=55000`, each AI call is capped at 55 seconds and source requests at 12 seconds. Smaller hosting budgets may terminate retrieval early; use a compatible plan or a persistent Node backend.

### Portal navigation (separate from retrieved guidance)

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

Users can create an account with their name and Gmail address. The backend generates a random temporary password and sends it through Gmail SMTP. Passwords are stored as scrypt hashes, while browser sessions use SHA-256 token hashes. Users set a permanent password from their Account profile. After sign-in, navigation is limited to **Test Case** and **Account**.

1. Configure `DATABASE_URL` (see above).
2. Set the credentials in the backend environment (never with a `VITE_` prefix):

   ```env
   ADMIN_USERNAME=admin-username
   ADMIN_PASSWORD=a-strong-admin-password
   DEV_USERNAME=dev-username
   DEV_PASSWORD=a-strong-dev-password
   ```

3. Restart the backend. On first use it creates `qa_accounts` and `qa_account_sessions`, storing only scrypt password hashes and SHA-256 session-token hashes.

- Usernames are case-insensitive; the two usernames must differ. Short passwords are allowed but log a warning; use strong passwords for shared or hosted deployments.
- The environment is the source of truth: changing a password or username, or removing a pair, revokes the old credentials and their sessions on the next backend start.
- Sessions last 8 hours in an `HttpOnly`, `SameSite=Strict` cookie (`Secure` over HTTPS). Sign out from the Account page.
- The Account page shows the username, role and session expiry. Admins also see the list of configured accounts.
- Failed sign-ins are limited to 5 per client and username every 15 minutes (per backend instance).

This is an account section, not an access gate: other dashboard workflows remain available without admin/dev sign-in. Public-folder policy retrieval does not use Google user sessions.

### Ring test accounts

The Account page also lists shared Microsoft 365 test accounts grouped by ring (R0–R4). Any signed-in admin or dev can **add**, **edit** (ring, username, notes, password), **show/copy** the password, or **remove** an account. Leave the password blank while editing to keep the current one.

- Passwords are encrypted with AES-256-GCM using `TEST_ACCOUNT_SECRET` (at least 32 characters) and stored in `qa_test_accounts`. They are only decrypted for a signed-in user who clicks show or copy, and are never logged.
- Generate the secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Use the same value in every instance that shares the database. Changing or losing it makes stored passwords unreadable.
- Each change records which admin/dev made it and when. Usernames must be unique (case-insensitive).
- Never put test account passwords in source code or `.env.example`. Enter them through the Account page.

## Run

**1. Install dependencies** with Node.js and npm available:

```bash
npm install
```

**2. Create a local `.env`** using the [environment configuration](#environment) below. Keep an existing environment file intact; never commit credentials.

**3. Start the dashboard:**

```bash
npm run dev
```

| Service | Local address |
| :--- | :--- |
| Frontend | http://localhost:5173 |
| Express API | http://localhost:4000 |

> [!TIP]
> Start with test generation or bug drafting. Configure the [public policy folder](#policy-assistant) for Drive RAG, and a [shared PostgreSQL database](#device-inventory) for inventory editing and account workflows.

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
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
AI_TIMEOUT_MS=55000
CLIENT_ORIGIN=https://your-vercel-domain.vercel.app
GOOGLE_DRIVE_FOLDER_ID=your-public-folder-id
GOOGLE_DRIVE_API_KEY=your-private-backend-api-key
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

Add backend-only configuration to `.env` before using live AI generation. Replace placeholder values locally; do not publish real keys, passwords or connection strings.

```env
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
AI_TIMEOUT_MS=55000
```

| Capability | Additional configuration | Setup |
| :--- | :--- | :--- |
| Public Drive policy RAG | `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_DRIVE_API_KEY`; optional `GOOGLE_DRIVE_FOLDER_RESOURCE_KEY` | [Public folder instructions](#policy-assistant) |
| Shared device inventory | `DATABASE_URL` | [Database connection](#device-inventory) |
| Admin/dev accounts | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DEV_USERNAME`, `DEV_PASSWORD` | [Account configuration](#admin--dev-accounts) |
| Email account passwords | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail account and 16-character app password |
| Ring test credential storage | `TEST_ACCOUNT_SECRET` | [Ring test accounts](#ring-test-accounts) |
| Optional local Microsoft portal login | `POLICY_AUTOMATION_ENABLED`, `POLICY_AUTOMATION_TOKEN` | [Protected local automation](#optional-automated-admin-login-localprivate-node-desktop-only) |

> [!WARNING]
> Keep `.env` out of Git, never prefix backend secrets with `VITE_`, and remove confidential or personal data before sending documents to an AI provider. Only approved, non-sensitive documents belong in a public Drive folder.

## Verification

Use these commands to verify the project:

```bash
npm run typecheck
npm test
npm run build
```

`npm run typecheck` verifies frontend and backend TypeScript. `npm run build` verifies the production frontend and server build.
`npm test` covers mobile scope, document parsing, screenshot attribution, portal validation, login access controls and an isolated browser sign-in fixture. Install Chromium with `npx playwright install chromium` before running the browser test. The tests use fake credentials and mock AI/Microsoft pages; they do not authenticate to a real tenant.
Policy tests mock Google/Microsoft/AI calls to verify public-folder discovery/pagination, folder membership, API-key isolation, resource keys, DOCX/Google Docs extraction, revoked public access, size limits, semantic retrieval, citation validation and explicit failures without a database or Google login. They do not access a real Google Drive or send documents to a live AI provider.
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
- `GET /api/policy/drive/status`
- `GET /api/policy/drive/documents` (discovers supported files in the configured public folder)
- Legacy `POST /api/policy/drive/connect`, `GET /api/policy/drive/callback`, `POST /api/policy/drive/disconnect` return HTTP 410; Google sign-in is no longer used.
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

| Resource | What to explore |
| :--- | :--- |
| [Demo walkthrough](./docs/demo-script.md) | A five-minute tour of the QA workflows. |
| [Project report](./docs/project-report.md) | Design, architecture, controls, limitations and roadmap. |
| [Local knowledge sources](./knowledge/) | Approved local policy fallback documents. |
| [Policy tests](./server/services/policy.test.ts) | Retrieval, citations, public-folder access and explicit failure behavior. |

---

<div align="center">
  <p><strong>Less context switching. More focused testing.</strong></p>
  <p><a href="#run">Start locally</a> &middot; <a href="#policy-assistant">Configure policy RAG</a> &middot; <a href="#verification">Verify the project</a></p>
</div>
