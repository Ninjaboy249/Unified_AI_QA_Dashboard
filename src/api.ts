export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await getMessage(response));
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await getMessage(response));
  return response.json() as Promise<T>;
}

async function getMessage(response: Response) {
  try {
    const data = (await response.json()) as { message?: string };
    return data.message ?? "Request failed.";
  } catch {
    return "Request failed.";
  }
}
