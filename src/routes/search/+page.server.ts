import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";
import {
  formatBBox,
  hasActiveSearch,
  parseSearchParams,
} from "$lib/search/params";

export type SearchMatchHit = {
  entity_type: string;
  column_name: string;
  local_value: string;
};

export type SearchProject = {
  result_kind?: string;
  slug: string;
  title: string;
  description: string | null;
  entity_count: number;
  table_count: number;
  bbox: string | null;
  match_detail: string;
  match_snippet?: string;
  match_hits?: SearchMatchHit[];
  distance_m?: number;
  tags_manual?: string[];
  tags_auto?: string[];
  date_start?: number | null;
  date_end?: number | null;
  date_start_label?: string | null;
  date_end_label?: string | null;
};

export type SimilarMediaItem = {
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

type RelatedProjectHit = {
  slug: string;
  title: string;
  description?: string | null;
  entity_count?: number;
  table_count?: number;
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

function relatedToSearchProject(p: RelatedProjectHit): SearchProject {
  return {
    result_kind: "project",
    slug: p.slug,
    title: p.title,
    description: p.description ?? null,
    entity_count: p.entity_count ?? 0,
    table_count: p.table_count ?? 0,
    bbox: p.bbox ?? null,
    match_detail: p.match_detail || "visual",
    tags_manual: p.tags_manual,
    tags_auto: p.tags_auto,
    date_start: p.date_start ?? null,
    date_end: p.date_end ?? null,
    date_start_label: p.date_start_label ?? null,
    date_end_label: p.date_end_label ?? null,
  };
}

/** Prefer FTS/semantic hits; append CLIP-related projects that aren't already listed. */
function mergeProjects(
  primary: SearchProject[],
  related: RelatedProjectHit[],
): SearchProject[] {
  const seen = new Set(primary.map((p) => p.slug.toLowerCase()));
  const out = [...primary];
  for (const r of related) {
    const key = r.slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(relatedToSearchProject(r));
  }
  return out;
}

export const load: PageServerLoad = async ({ url, locals, fetch }) => {
  const parsed = parseSearchParams(url);
  const active = hasActiveSearch(parsed);

  if (!active) {
    const accessToken = await locals.getAccessToken();
    return {
      query: parsed.q,
      lat: null,
      lng: null,
      radius: null,
      bbox: null,
      dateFrom: null,
      dateTo: null,
      tags: [] as string[],
      vocabularies: [] as string[],
      semantic: parsed.semantic,
      mediaHash: null as string | null,
      imageQuery: false,
      similarItems: [] as SimilarMediaItem[],
      similarStatus: "" as string,
      projects: [] as SearchProject[],
      accessToken,
    };
  }

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let projects: SearchProject[] = [];
  let similarItems: SimilarMediaItem[] = [];
  let similarStatus = "";
  let relatedProjects: RelatedProjectHit[] = [];

  // Reverse-image: OpenCLIP neighbours for an existing media hash (+ related projects).
  if (parsed.mediaHash) {
    const qs = new URLSearchParams();
    qs.set("limit", "24");
    if (parsed.bbox) qs.set("bbox", formatBBox(parsed.bbox));
    if (parsed.dateFrom != null) qs.set("date_from", String(parsed.dateFrom));
    if (parsed.dateTo != null) qs.set("date_to", String(parsed.dateTo));
    if (parsed.tags[0]) qs.set("tag", parsed.tags[0]);
    try {
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/media/${parsed.mediaHash}/similar?${qs}`,
        { headers },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          items?: SimilarMediaItem[];
          projects?: RelatedProjectHit[];
          status?: string;
        };
        similarItems = body.items ?? [];
        relatedProjects = body.projects ?? [];
        if (body.status === "pending_embedding") {
          similarStatus = "Embedding still pending — try again shortly";
        } else if (body.status === "care_embed_blocked") {
          similarStatus =
            "Similar search blocked by CARE settings for this media";
        } else if (similarItems.length === 0) {
          similarStatus = "No similar photos found";
        }
      } else if (res.status === 404) {
        similarStatus =
          "Image not in the catalogue yet — upload it to a project artefacts shelf first";
      } else {
        similarStatus = "Similar search failed";
      }
    } catch {
      similarStatus = "Similar search failed";
    }
  }

  // Text → images (CLIP cross-modal) when there is a text query and semantic is on.
  if (parsed.q && parsed.semantic && !parsed.mediaHash && !parsed.imageQuery) {
    const qs = new URLSearchParams();
    qs.set("q", parsed.q);
    qs.set("limit", "24");
    if (parsed.bbox) qs.set("bbox", formatBBox(parsed.bbox));
    if (parsed.dateFrom != null) qs.set("date_from", String(parsed.dateFrom));
    if (parsed.dateTo != null) qs.set("date_to", String(parsed.dateTo));
    if (parsed.tags[0]) qs.set("tag", parsed.tags[0]);
    try {
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/search/media?${qs}`,
        { headers },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          items?: SimilarMediaItem[];
          status?: string;
        };
        similarItems = body.items ?? [];
        if (similarItems.length === 0 && body.status === "no_matches") {
          similarStatus = "";
        }
      }
    } catch {
      /* text→media is best-effort */
    }
  }

  // Text/project discovery still runs when q or non-media facets are set.
  const wantProjects =
    Boolean(parsed.q) ||
    parsed.bbox != null ||
    (parsed.lat != null && parsed.lng != null) ||
    parsed.dateFrom != null ||
    parsed.dateTo != null ||
    parsed.tags.length > 0 ||
    parsed.vocabularies.length > 0 ||
    parsed.types.length > 0;

  if (wantProjects) {
    const params = new URLSearchParams();
    if (parsed.q) params.set("q", parsed.q);
    if (parsed.q && !parsed.semantic) params.set("semantic", "0");
    if (parsed.bbox) {
      params.set("bbox", formatBBox(parsed.bbox));
    } else if (parsed.lat != null && parsed.lng != null) {
      params.set("lat", String(parsed.lat));
      params.set("lng", String(parsed.lng));
      if (parsed.radius != null) params.set("radius", String(parsed.radius));
    }
    if (parsed.dateFrom != null) params.set("date_from", String(parsed.dateFrom));
    if (parsed.dateTo != null) params.set("date_to", String(parsed.dateTo));
    for (const t of parsed.tags) params.append("tag", t);
    for (const v of parsed.vocabularies) params.append("vocab", v);

    try {
      const res = await fetch(
        `${TINYOWL_CORE_URL}/api/v1/search?${params.toString()}`,
        { headers },
      );
      if (res.ok) projects = (await res.json()) ?? [];
    } catch (_) {}
  }

  projects = mergeProjects(projects, relatedProjects);

  return {
    query: parsed.q,
    lat: parsed.lat,
    lng: parsed.lng,
    radius: parsed.radius,
    bbox: parsed.bbox,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    tags: parsed.tags,
    vocabularies: parsed.vocabularies,
    semantic: parsed.semantic,
    mediaHash: parsed.mediaHash,
    imageQuery: parsed.imageQuery,
    similarItems,
    similarStatus,
    projects,
    accessToken,
  };
};
