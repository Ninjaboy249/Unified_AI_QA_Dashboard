import fs from "node:fs";
import path from "node:path";
import type { PolicyAnswer } from "../types.js";

interface Source {
  title: string;
  fileName: string;
  body: string;
}

const knowledgeDir = path.resolve(process.cwd(), "knowledge");

export function listKnowledgeSources() {
  return loadSources().map((source) => ({
    title: source.title,
    fileName: source.fileName,
    preview: source.body.split(/\s+/).slice(0, 28).join(" ")
  }));
}

export async function answerPolicyQuestion(question: string): Promise<PolicyAnswer> {
  const sources = loadSources();
  const scored = sources
    .map((source) => ({ source, score: score(question, source.body + " " + source.title) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 2) {
    return {
      found: false,
      confidence: 0,
      answer: "I could not find enough approved local evidence to answer this policy question. Please add a source or ask an administrator to confirm it."
    };
  }

  const lines = best.source.body
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("-"))
    .slice(0, 5)
    .map((line) => line.replace(/^-\s*/, "").trim());

  return {
    found: true,
    confidence: Math.min(0.95, 0.55 + best.score * 0.08),
    sourceTitle: best.source.title,
    fileName: best.source.fileName,
    answer: lines.length
      ? lines.join(" ")
      : "Approved guidance was found, but it should be reviewed in the source document before use."
  };
}

function loadSources(): Source[] {
  return fs
    .readdirSync(knowledgeDir)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => {
      const body = fs.readFileSync(path.join(knowledgeDir, fileName), "utf8");
      const title = body.match(/^#\s+(.+)$/m)?.[1] ?? fileName;
      return { title, fileName, body };
    });
}

function score(query: string, text: string): number {
  const tokens = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2)
  );
  const haystack = text.toLowerCase();
  return [...tokens].reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
}
