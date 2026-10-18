const routes = [
  { path: "/test-cases", label: "Test Case Generator", keywords: ["test", "case", "coverage", "scenario", "requirement"] },
  { path: "/bug-drafter", label: "Bug Drafter", keywords: ["bug", "defect", "crash", "triage", "reproduce"] },
  { path: "/directory", label: "Device & Account", keywords: ["device", "account", "owner", "directory", "compliance"] },
  { path: "/policy", label: "Policy Assistant", keywords: ["policy", "mfa", "intune", "teams", "configuration", "external"] },
  { path: "/knowledge", label: "Knowledge Sources", keywords: ["source", "evidence", "document", "knowledge"] },
  { path: "/evidence", label: "Health & Evidence", keywords: ["health", "openai", "chatgpt", "gpt", "model", "build", "validation"] }
];

export function routeIntent(intent: string) {
  const normalized = intent.toLowerCase();
  const ranked = routes
    .map((route) => ({
      ...route,
      score: route.keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return {
    path: best.score > 0 ? best.path : "/",
    label: best.score > 0 ? best.label : "Command Center",
    confidence: best.score > 0 ? Math.min(0.95, 0.45 + best.score * 0.18) : 0.35,
    reason: best.score > 0 ? `Matched ${best.score} workflow signal(s).` : "No strong module signal was found."
  };
}
