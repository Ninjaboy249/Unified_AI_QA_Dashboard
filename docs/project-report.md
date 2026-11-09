# Unified AI Operations Dashboard Report

## Problem

QA teams work across requirements, bug trackers, device records and policy documents. The result is context switching, inconsistent artifacts and slow access to approved guidance.

## Objective

Create a backend-controlled, workflow-focused AI dashboard that converts natural-language QA intent into structured, reviewable actions while keeping human approval mandatory.

## Capabilities

- Test Case Generator: requirement input to typed `TestCase[]`.
- Bug Drafter: issue context to complete defect draft.
- Device & Account: searchable enterprise-style records.
- Policy Assistant: full Microsoft Learn articles and automatically discovered public Google Drive DOCX/Google Docs through embedding-based RAG, with excerpt citations, explicit source errors and no-answer behavior.
- AI Assistant: deterministic routing to the correct workflow.
- Knowledge Sources: visibility into approved evidence.
- Health & Evidence: model mode, validation and implementation proof.

## Architecture

Browser requests go through the Express API. The frontend never calls OpenAI directly and never reads environment configuration. Service interfaces separate AI generation, knowledge retrieval, directory data and metrics.

## Responsible AI Controls

- Backend-only OpenAI inference using GPT-5 mini.
- Backend-only AI access.
- Schema validation before returning generated artifacts.
- Policy drafts with validated excerpt IDs, original-source links and retrieval similarity (not an answer-correctness guarantee).
- No answer when evidence is insufficient; Drive failures never silently omit documents.
- Backend-configured public Drive folder and API key; no Google user login or individual download links. All supported direct-child documents are processed, subject to an explicit three-document limit. AI processing requires consent; text and vectors are not persisted by the dashboard. Only non-sensitive, approved documents may be made public.
- Human review flag for generated defects.

## Production Gaps

Add Entra ID authentication, role-based authorization, encrypted persistence, rate limiting, audit logs, secret-store integration, Graph/Intune/SharePoint connectors and a formal evaluation dataset before real enterprise use.
