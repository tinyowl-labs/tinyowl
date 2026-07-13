/** Ephemeral reverse-image query results (sessionStorage). */

export type ImageQueryHit = {
  hash: string;
  media_type: string;
  file_size: number;
  url: string;
  project_slug: string;
  project_title: string;
  entity_type?: string;
  entity_id?: string;
  distance: number;
};

export type ImageQueryProject = {
  slug: string;
  title: string;
  description?: string | null;
  entity_count: number;
  table_count: number;
  bbox?: string | null;
  match_detail?: string;
  distance?: number;
  tags_manual?: string[];
  tags_auto?: string[];
  date_start?: number | null;
  date_end?: number | null;
  date_start_label?: string | null;
  date_end_label?: string | null;
};

export type ImageQuerySession = {
  previewDataUrl: string;
  items: ImageQueryHit[];
  projects: ImageQueryProject[];
  status: string;
  at: number;
};

const KEY = "tinyowl:imageQuery";

export function saveImageQuery(session: ImageQuerySession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* quota / private mode */
  }
}

export function loadImageQuery(): ImageQuerySession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImageQuerySession;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (!Array.isArray(parsed.projects)) parsed.projects = [];
    // Drop stale sessions older than 1 hour.
    if (parsed.at && Date.now() - parsed.at > 60 * 60 * 1000) {
      clearImageQuery();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearImageQuery(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Resize for a small preview data URL (keeps sessionStorage small). */
export async function previewDataUrlFromFile(
  file: File,
  maxEdge = 320,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return URL.createObjectURL(file);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function postSimilarByImage(
  file: File,
  opts: {
    accessToken?: string | null;
    limit?: number;
    bbox?: string | null;
    dateFrom?: string | number | null;
    dateTo?: string | number | null;
    tag?: string | null;
  } = {},
): Promise<{
  items: ImageQueryHit[];
  projects: ImageQueryProject[];
  status: string;
}> {
  const qs = new URLSearchParams();
  qs.set("limit", String(opts.limit ?? 24));
  if (opts.bbox) qs.set("bbox", opts.bbox);
  if (opts.dateFrom != null && opts.dateFrom !== "")
    qs.set("date_from", String(opts.dateFrom));
  if (opts.dateTo != null && opts.dateTo !== "")
    qs.set("date_to", String(opts.dateTo));
  if (opts.tag?.trim()) qs.set("tag", opts.tag.trim());

  const form = new FormData();
  form.append("file", file, file.name || "query.jpg");

  const headers: Record<string, string> = {};
  if (opts.accessToken) {
    headers.Authorization = `Bearer ${opts.accessToken}`;
  }

  const res = await fetch(`/api/v1/media/similar?${qs}`, {
    method: "POST",
    headers,
    body: form,
  });
  if (res.status === 503) {
    throw new Error("Image embedding service unavailable — try again shortly");
  }
  if (res.status === 413) {
    throw new Error("Image too large (max 20MB)");
  }
  if (!res.ok) {
    let msg = `Similar search failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = String(body.error);
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const body = (await res.json()) as {
    items?: ImageQueryHit[];
    projects?: ImageQueryProject[];
    status?: string;
  };
  return {
    items: body.items ?? [],
    projects: body.projects ?? [],
    status: body.status ?? "",
  };
}
