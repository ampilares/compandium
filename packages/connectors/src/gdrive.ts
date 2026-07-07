/**
 * Google Drive connector (UNVERIFIED — built against the documented API
 * https://developers.google.com/drive/api/reference/rest/v3, needs OAuth
 * credentials to validate). Imports Google Docs + markdown/plain-text files
 * from one folder.
 *
 * Config takes an OAuth2 refresh token + client credentials; each run mints
 * a fresh access token. Cursor: modifiedTime high-water mark.
 */

import { z } from "zod";
import { getJson, httpFetch } from "./http";
import { pathFromStableId, type FetchResult, type PullConnector, type SourceRecord } from "./types";

export const gdriveConfigSchema = z.object({
  clientId: z.string().min(10),
  clientSecret: z.string().min(10),
  refreshToken: z.string().min(10),
  folderId: z.string().regex(/^[\w-]{10,}$/),
});
export type GdriveConfig = z.infer<typeof gdriveConfigSchema>;

export interface GdriveCursor extends Record<string, unknown> {
  modifiedAfter?: string;
  seenIds?: string[];
}

const FILES_API = "https://www.googleapis.com/drive/v3/files";
const TOKEN_API = "https://oauth2.googleapis.com/token";
const MAX_FILES = 1_000;
const IMPORTABLE = new Set([
  "application/vnd.google-apps.document",
  "text/markdown",
  "text/plain",
]);

async function accessToken(config: GdriveConfig): Promise<string> {
  const res = await httpFetch(TOKEN_API, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`gdrive token refresh failed: ${body.error ?? res.status}`);
  }
  return body.access_token;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  trashed?: boolean;
}

async function exportFile(token: string, file: DriveFile): Promise<string | null> {
  const url =
    file.mimeType === "application/vnd.google-apps.document"
      ? `${FILES_API}/${file.id}/export?mimeType=text/markdown`
      : `${FILES_API}/${file.id}?alt=media`;
  const res = await httpFetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null; // skip unexportable files, never fail the run
  return res.text();
}

export const gdriveConnector: PullConnector<GdriveConfig, GdriveCursor> = {
  type: "gdrive",
  mode: "pull",
  configSchema: gdriveConfigSchema,

  async validate(config) {
    const token = await accessToken(config);
    await getJson(`${FILES_API}/${config.folderId}?fields=id,name,mimeType`, {
      headers: { authorization: `Bearer ${token}` },
      errorLabel: "gdrive folder check",
    });
  },

  async fetch(config, cursor): Promise<FetchResult<GdriveCursor>> {
    const token = await accessToken(config);
    const clauses = [
      `'${config.folderId}' in parents`,
      "trashed = false",
      ...(cursor?.modifiedAfter ? [`modifiedTime > '${cursor.modifiedAfter}'`] : []),
    ];

    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(FILES_API);
      url.searchParams.set("q", clauses.join(" and "));
      url.searchParams.set("fields", "nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,trashed)");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await getJson<{ files: DriveFile[]; nextPageToken?: string }>(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
        errorLabel: "gdrive list",
      });
      files.push(...page.files.filter((f) => IMPORTABLE.has(f.mimeType)));
      pageToken = page.nextPageToken;
    } while (pageToken && files.length < MAX_FILES);

    const records: SourceRecord[] = [];
    let newest = cursor?.modifiedAfter ?? "";
    for (const file of files) {
      const content = await exportFile(token, file);
      if (content === null) continue;
      if (file.modifiedTime > newest) newest = file.modifiedTime;
      records.push({
        stableId: file.id,
        path: pathFromStableId("gdrive", `${file.name}-${file.id.slice(0, 8)}`),
        markdown: content.startsWith("#") ? content : `# ${file.name}\n\n${content}`,
        metadata: { origin: file.webViewLink ?? `gdrive:${file.id}`, modified: file.modifiedTime },
      });
    }

    return {
      records,
      nextCursor: { modifiedAfter: newest || undefined },
      stats: { imported: records.length },
    };
  },
};
