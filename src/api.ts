export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await getMessage(response));
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await getMessage(response));
  return response.json() as Promise<T>;
}

export async function apiSend<T>(method: "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
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
