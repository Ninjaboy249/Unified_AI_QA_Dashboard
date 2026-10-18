# Unified AI Operations Dashboard for Quality Assurance

Unified AI Operations Dashboard is a full-stack QA productivity platform. It gives QA teams one structured workspace for test-case generation, bug drafting, device inventory lookup, policy assistance, workflow routing, knowledge-source visibility, and implementation evidence.

## Problem Statement

QA teams often work across many disconnected tools: requirement documents, test cases, bug reports, device sheets, account records, and policy guidance. This causes slow preparation, repeated context switching, inconsistent QA artifacts, and difficulty finding approved information quickly.

The main problem this project solves is:

> How can a QA team use AI to speed up repeated operational work while keeping outputs structured, reviewable, traceable, and controlled by humans?

## Solution

The dashboard provides a unified operations interface with focused modules instead of a generic chatbot. Each module captures structured input, sends requests through the backend, validates generated results, and returns editable outputs for human review.

Key solutions included:

- Test Case Generator: converts requirements into structured positive, negative, and edge test cases.
- Bug Drafter: converts issue context into a triage-ready defect draft.
- Device & Account: provides an Excel-style searchable, sortable, filterable device inventory.
- Policy Assistant: answers only from approved local knowledge files and refuses unsupported questions.
- AI Assistant: routes natural-language intent to the correct workflow.
- Knowledge Sources: shows the local evidence documents used by the policy assistant.
- Health & Evidence: shows AI mode, configured model, validation controls, and project proof points.

## What We Used

- Frontend: React 19, TypeScript, Vite, React Router, Lucide icons.
- Backend: Express 5, TypeScript, Zod validation.
- AI provider: OpenAI GPT-5 mini through a backend-only API integration.
- Knowledge base: local Markdown files in `knowledge/`.
- Styling: custom responsive CSS with premium dashboard layout and spreadsheet-style inventory table.
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
- Policy retrieval is in `server/services/policyService.ts`.
- Shared backend types are in `server/types.ts`.
- Frontend types are in `src/types.ts`.

AI-generated outputs are not blindly trusted. The backend checks required fields and expected shapes before returning data to the browser. If the OpenAI API key is missing or the model is unavailable, the app falls back to deterministic demo output so the project can still be demonstrated.

## Device Inventory

The Device & Account module uses the provided device sheet data and displays it as an Excel-style table.

It supports:

- Search by owner, device, OS, serial number, or accessories.
- Filter by owner, platform, and status.
- Sort by any visible column.
- Active and obsolete device status.
- Android, iOS, and iPadOS platform badges.
- CSV export for the currently visible rows.

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
npm run build
```

`npm run typecheck` verifies frontend and backend TypeScript. `npm run build` verifies the production frontend and server build.

## API Routes

- `GET /api/health`
- `GET /api/metrics`
- `GET /api/activity`
- `POST /api/test-cases/generate`
- `POST /api/bugs/draft`
- `GET /api/directory/search?q=`
- `POST /api/policy/ask`
- `POST /api/assistant/route`
- `GET /api/knowledge/sources`

## Project Evidence

- `docs/demo-script.md` contains the five-minute live demo flow.
- `docs/project-report.md` explains the project design, architecture, controls, limitations, and roadmap.
- `knowledge/` contains the approved local policy sources.
