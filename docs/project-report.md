# Unified AI Operations Dashboard Report

## Problem

QA teams work across requirements, bug trackers, device records and policy documents. The result is context switching, inconsistent artifacts and slow access to approved guidance.

## Objective

Create a backend-controlled, workflow-focused AI dashboard that converts natural-language QA intent into structured, reviewable actions while keeping human approval mandatory.

## Capabilities

- Test Case Generator: requirement input to typed `TestCase[]`.
- Bug Drafter: issue context to complete defect draft.
- Device & Account: searchable enterprise-style records.
- Policy Assistant: local source retrieval with refusal below relevance threshold.
- AI Assistant: deterministic routing to the correct workflow.
- Knowledge Sources: visibility into approved evidence.
- Health & Evidence: model mode, validation and implementation proof.

## Architecture

Browser requests go through the Express API. The frontend never calls OpenAI directly and never reads environment configuration. Service interfaces separate AI generation, knowledge retrieval, directory data and metrics.

## Responsible AI Controls

- Backend-only OpenAI inference using GPT-5 mini.
- Backend-only AI access.
- Schema validation before returning generated artifacts.
- Grounded policy answers with source title and file name.
- Refusal when local evidence is insufficient.
- Human review flag for generated defects.

## Production Gaps

Add Entra ID authentication, role-based authorization, encrypted persistence, rate limiting, audit logs, secret-store integration, Graph/Intune/SharePoint connectors and a formal evaluation dataset before real enterprise use.
