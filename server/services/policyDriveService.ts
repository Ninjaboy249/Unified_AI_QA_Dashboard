import { z } from "zod";
import { policyFetch, readPolicyBytes, readPolicyJson } from "./policyHttp.js";
import { driveFileId, PolicyError, type PolicyDocument } from "./policySchema.js";
import { extractDocumentText } from "./requirementService.js";

const wordMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const googleDocMime = "application/vnd.google-apps.document";
const folderMime = "application/vnd.google-apps.folder";
const maxDocuments = 3;
const resourceKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const fileSchema = z.object({
  id: driveFileId,
  name: z.string().min(1).max(1000),
  mimeType: z.string(),
  size: z.string().regex(/^\d+$/).optional(),
  parents: z.array(driveFileId).optional(),
  resourceKey: resourceKeySchema.optional()
});
type DriveFile = z.infer<typeof fileSchema>;

function config() {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  const folderId = driveFileId.safeParse(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim());
  const resourceKey = resourceKeySchema.optional().safeParse(process.env.GOOGLE_DRIVE_FOLDER_RESOURCE_KEY?.trim() || undefined);
  if (!apiKey || !folderId.success || !resourceKey.success) {
    throw new PolicyError("Configure GOOGLE_DRIVE_API_KEY and a valid GOOGLE_DRIVE_FOLDER_ID on the backend. If required by the share link, also set GOOGLE_DRIVE_FOLDER_RESOURCE_KEY.", 503);
  }
  return { apiKey, folderId: folderId.data, resourceKey: resourceKey.data };
}

function sourceUrl(id: string, resourceKey?: string, folder = false) {
  const url = new URL(folder ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`);
  if (resourceKey) url.searchParams.set("resourcekey", resourceKey);
  return url.href;
}

async function driveRequest(path: string, parameters: Record<string, string>, file?: Pick<DriveFile, "id" | "resourceKey">) {
  const { apiKey, folderId, resourceKey } = config();
  const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
  url.search = new URLSearchParams({ ...parameters, key: apiKey }).toString();
  const keys = [
    ...(resourceKey ? [`${folderId}/${resourceKey}`] : []),
    ...(file?.resourceKey ? [`${file.id}/${file.resourceKey}`] : [])
  ];
  const response = await policyFetch(url, {
    headers: keys.length ? { "X-Goog-Drive-Resource-Keys": [...new Set(keys)].join(",") } : {}
  });
  if (response.status === 401) throw new PolicyError("Google rejected the Drive API key. Check the backend key and enable the Google Drive API.", 503);
  if (response.status === 403 || response.status === 404) {
    throw new PolicyError("Google could not read the public folder or file. Check the folder ID, API-key restrictions, Anyone with the link access, resource key and download permissions.", 403);
  }
  if (response.status === 429) throw new PolicyError("Google Drive is rate-limited. Retry later.", 503);
  if (!response.ok) throw new PolicyError("Google Drive retrieval failed. Check the source configuration and retry.", 502);
  return response;
}

async function metadata(id: string, file?: Pick<DriveFile, "id" | "resourceKey">) {
  const result = fileSchema.safeParse(await readPolicyJson(await driveRequest(`files/${id}`, {
    fields: "id,name,mimeType,size,parents,resourceKey", supportsAllDrives: "true"
  }, file)));
  if (!result.success || result.data.id !== id) throw new PolicyError("Google returned invalid public document metadata.");
  return result.data;
}

export function driveStatus() {
  try {
    const { folderId, resourceKey } = config();
    return {
      configured: true, mode: "public-folder", folderUrl: sourceUrl(folderId, resourceKey, true),
      message: "Public Drive folder configured. Word documents are discovered automatically; Google sign-in is not required."
    };
  } catch (error) {
    if (!(error instanceof PolicyError)) throw error;
    return { configured: false, mode: "public-folder", message: error.message };
  }
}

async function discoverDocuments() {
  const { folderId } = config();
  const folder = await metadata(folderId);
  if (folder.mimeType !== folderMime) throw new PolicyError("GOOGLE_DRIVE_FOLDER_ID must identify a public Google Drive folder, not an individual file.", 422);
  const documents = new Map<string, DriveFile>();
  const visitedTokens = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page++) {
    const response = await driveRequest("files", {
      q: `'${folderId}' in parents and trashed = false and (mimeType = '${wordMime}' or mimeType = '${googleDocMime}')`,
      fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,size,parents,resourceKey)",
      pageSize: String(maxDocuments + 1), orderBy: "name",
      supportsAllDrives: "true", includeItemsFromAllDrives: "true",
      ...(pageToken ? { pageToken } : {})
    }, folder);
    const result = z.object({
      files: z.array(fileSchema).max(maxDocuments + 1).default([]),
      nextPageToken: z.string().min(1).max(2000).optional(),
      incompleteSearch: z.boolean().default(false)
    }).safeParse(await readPolicyJson(response));
    if (!result.success) throw new PolicyError("Google returned an invalid public-folder document list.");
    if (result.data.incompleteSearch) throw new PolicyError("Google returned an incomplete folder search. Narrow the configured folder and retry.");
    for (const file of result.data.files) {
      if (file.mimeType !== wordMime && file.mimeType !== googleDocMime) throw new PolicyError("Google returned an unsupported file in the Word document search.");
      documents.set(file.id, file);
    }
    if (documents.size > maxDocuments) {
      throw new PolicyError("The public folder contains more than three supported documents. Configure a smaller policy folder; no documents were silently omitted.", 422);
    }
    pageToken = result.data.nextPageToken;
    if (!pageToken) return { folder, documents: [...documents.values()] };
    if (visitedTokens.has(pageToken)) throw new PolicyError("Google repeated a folder pagination token. Retry discovery.");
    visitedTokens.add(pageToken);
  }
  throw new PolicyError("Public folder discovery exceeded the pagination limit. Configure a smaller folder.");
}

export async function listDriveDocuments() {
  const { folder, documents } = await discoverDocuments();
  return {
    folderTitle: folder.name,
    documents: documents.map((file) => ({ id: file.id, name: file.name, sourceUrl: sourceUrl(file.id, file.resourceKey) }))
  };
}

export async function retrieveDriveDocuments(): Promise<PolicyDocument[]> {
  const { folderId } = config();
  const { documents } = await discoverDocuments();
  return Promise.all(documents.map(async (listedFile) => {
    const file = await metadata(listedFile.id, listedFile);
    if (!file.parents?.includes(folderId)) throw new PolicyError("A discovered document is no longer in the configured public folder. Refresh the folder and retry.", 403);
    if (file.mimeType !== wordMime && file.mimeType !== googleDocMime) throw new PolicyError("Only DOCX and Google Docs documents are supported. Legacy .doc files are not supported.", 422);
    if (Number(file.size) > 5 * 1024 * 1024) throw new PolicyError("A public Drive document exceeds 5 MB. Split it before retrieval.", 422);
    const response = file.mimeType === googleDocMime
      ? await driveRequest(`files/${file.id}/export`, { mimeType: wordMime }, file)
      : await driveRequest(`files/${file.id}`, { alt: "media", supportsAllDrives: "true" }, file);
    let text: string;
    const buffer = await readPolicyBytes(response, 5 * 1024 * 1024);
    try {
      text = await extractDocumentText("policy.docx", buffer);
    } catch {
      throw new PolicyError("A public Drive document could not be read. Use valid DOCX/Google Docs content with 8 to 60,000 extracted characters and at most 5 MB.", 422);
    }
    return { title: file.name, fileName: file.name, kind: "drive", sourceUrl: sourceUrl(file.id, file.resourceKey), text };
  }));
}
