function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function routeIntent(intent: string) {
  const normalized = intent.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!normalized) {
    return { path: null, label: "Invalid navigation", confidence: 0, reason: "Enter Test Case or Account." };
  }

  const alternatives = [
    { path: "/test-cases", label: "Test Case", text: "testcase" },
    { path: "/account", label: "Account", text: "account" }
  ];
  const exact = alternatives.find((item) =>
    normalized === item.text ||
    normalized.includes(item.text) ||
    item.text.includes(normalized));
  if (exact) return { path: exact.path, label: exact.label, confidence: 0.95, reason: "Navigation name matched." };

  const ranked = alternatives
    .map((item) => ({ ...item, distance: editDistance(normalized, item.text) }))
    .sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  const allowedDistance = normalized.length <= 4 ? 1 : 3;
  if (best.distance <= allowedDistance) {
    return { path: best.path, label: best.label, confidence: 0.75, reason: `Predicted ${best.label} from a similar name.` };
  }
  return { path: null, label: "Invalid navigation", confidence: 0, reason: "Invalid navigation. Try Test Case or Account." };
}
