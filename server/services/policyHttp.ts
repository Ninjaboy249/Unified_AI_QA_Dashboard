import { PolicyError } from "./policySchema.js";

export async function policyFetch(url: string | URL, init: RequestInit = {}) {
  try {
    return await fetch(url, { ...init, redirect: init.redirect ?? "error", signal: AbortSignal.timeout(12000) });
  } catch {
    throw new PolicyError("Policy source request failed or timed out. Retry after checking connectivity.");
  }
}

export async function readPolicyBytes(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new PolicyError("Policy source exceeds the supported size limit.", 422);
  }
  if (!response.body) throw new PolicyError("Policy source returned an empty response.");
  const reader = response.body.getReader();
  const buffers: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PolicyError("Policy source exceeds the supported size limit.", 422);
      }
      buffers.push(Buffer.from(value));
    }
    return Buffer.concat(buffers);
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    throw new PolicyError("Policy source download was interrupted. Retry the request.");
  } finally {
    reader.releaseLock();
  }
}

export async function readPolicyJson(response: Response, limit = 1024 * 1024): Promise<unknown> {
  try {
    return JSON.parse((await readPolicyBytes(response, limit)).toString("utf8"));
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    throw new PolicyError("Policy provider returned an invalid JSON response.");
  }
}
