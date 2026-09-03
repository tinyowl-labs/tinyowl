import { TINYOWL_CORE_URL } from "$env/static/private";
import {
  formatBBox,
  hasActiveSearch,
  parseSearchParams,
} from "$lib/search/params";
import type { DiscoveryProject } from "$lib/search/discovery";
import type {
  DiscoveryPageData,
  SearchEntityHit,
  SearchProject,
  SimilarMediaItem,
} from "$lib/search/discoveryLoad";

export type {
  DiscoveryPageData,
  SearchEntityHit,
  SearchMatchHit,
  SearchProject,
  SimilarMediaItem,
} from "$lib/search/discoveryLoad";

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

type MembershipProject = {
  slug: string;
  title: string;
  role?: string;
  description?: string | null;
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
    date_start: asNum(p.date_start),
    date_end: asNum(p.date_end),
    date_start_label: p.date_start_label ?? null,
    date_end_label: p.date_end_label ?? null,
  };
}

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

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asSearchProject(p: DiscoveryProject): SearchProject {
  return {
    result_kind: "project",
    slug: p.slug,
    title: p.title,
    description: p.description ?? null,
    entity_count: p.entity_count ?? 0,
    table_count: p.table_count ?? 0,
    bbox: p.bbox ?? null,
    lat: asNum(p.lat),
    lng: asNum(p.lng),
    match_detail: p.match_detail ?? "",
    match_snippet: p.match_snippet,
    match_hits: p.match_hits,
    distance_m: p.distance_m,
    tags_manual: p.tags_manual,
    tags_auto: p.tags_auto,
    date_start: asNum(p.date_start),
    date_end: asNum(p.date_end),
    date_start_label: p.date_start_label ?? null,
    date_end_label: p.date_end_label ?? null,
  };
}

type LoadArgs = {
  url: URL;
  locals: {
    getAccessToken: () => Promise<string | null | undefined>;
  };
  fetch: typeof fetch;
};

export async function loadDiscoverySearch(
  args: LoadArgs,
): Promise<Omit<DiscoveryPageData, "browse">> {
  const parsed = parseSearchParams(args.url);
  const accessToken = (await args.locals.getAccessToken()) ?? null;
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let projects: SearchProject[] = [];
  let similarItems: SimilarMediaItem[] = [];
  let similarStatus = "";
  let relatedProjects: RelatedProjectHit[] = [];

  if (parsed.mediaHash) {
    const qs = new URLSearchParams();
    qs.set("limit", "24");
    if (parsed.bbox) qs.set("bbox", formatBBox(parsed.bbox));
    if (parsed.dateFrom != null) qs.set("date_from", String(parsed.dateFrom));
    if (parsed.dateTo != null) qs.set("date_to", String(parsed.dateTo));
    if (parsed.tags[0]) qs.set("tag", parsed.tags[0]);
    try {
      const res = await args.fetch(
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

  if (parsed.q && parsed.semantic && !parsed.mediaHash && !parsed.imageQuery) {
    const qs = new URLSearchParams();
    qs.set("q", parsed.q);
    qs.set("limit", "24");
    if (parsed.bbox) qs.set("bbox", formatBBox(parsed.bbox));
    if (parsed.dateFrom != null) qs.set("date_from", String(parsed.dateFrom));
    if (parsed.dateTo != null) qs.set("date_to", String(parsed.dateTo));
    if (parsed.tags[0]) qs.set("tag", parsed.tags[0]);
    try {
      const res = await args.fetch(
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

  const wantProjects =
    Boolean(parsed.q) ||
    parsed.bbox != null ||
    (parsed.lat != null && parsed.lng != null) ||
    parsed.dateFrom != null ||
    parsed.dateTo != null ||
    parsed.tags.length > 0 ||
    parsed.vocabularies.length > 0 ||
    parsed.projects.length > 0 ||
    parsed.types.length > 0;

  if (wantProjects) {
    const params = new URLSearchParams();
    const scoped = parsed.projects.length > 0;
    if (parsed.q && !scoped) params.set("q", parsed.q);
    if (parsed.q && !parsed.semantic && !scoped) params.set("semantic", "0");
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
    for (const p of parsed.projects) params.append("project", p);

    try {
      const res = await args.fetch(
        `${TINYOWL_CORE_URL}/api/v1/search?${params.toString()}`,
        { headers },
      );
      if (res.ok) projects = (await res.json()) ?? [];
    } catch (_) {}
  }

  const entityHits: Record<string, SearchEntityHit[]> = {};
  if (parsed.projects.length > 0 && parsed.q) {
    await Promise.all(
      parsed.projects.map(async (slug) => {
        try {
          const qs = new URLSearchParams({
            q: parsed.q,
            limit: "20",
          });
          const res = await args.fetch(
            `${TINYOWL_CORE_URL}/api/v1/projects/${encodeURIComponent(slug)}/search-entities?${qs}`,
            { headers },
          );
          if (!res.ok) return;
          const rows = (await res.json()) as SearchEntityHit[];
          entityHits[slug] = Array.isArray(rows) ? rows : [];
        } catch {
          /* entity search is best-effort */
        }
      }),
    );
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
    projectSlugs: parsed.projects,
    semantic: parsed.semantic,
    mediaHash: parsed.mediaHash,
    imageQuery: parsed.imageQuery,
    similarItems,
    similarStatus,
    projects,
    entityHits,
    placeName: parsed.placeName,
    accessToken,
  };
}

async function loadCentroids(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
): Promise<DiscoveryProject[]> {
  try {
    const res = await fetchFn(`${TINYOWL_CORE_URL}/api/v1/projects/centroids`, {
      headers,
    });
    if (res.ok) return (await res.json()) as DiscoveryProject[];
  } catch (_) {}
  return [];
}

async function loadMembership(
  fetchFn: typeof fetch,
  headers: Record<string, string>,
): Promise<MembershipProject[]> {
  try {
    const res = await fetchFn(`${TINYOWL_CORE_URL}/api/v1/projects`, {
      headers,
    });
    if (res.ok) return (await res.json()) as MembershipProject[];
  } catch (_) {}
  return [];
}

function mergeMembership(
  membership: MembershipProject[],
  centroids: DiscoveryProject[],
): SearchProject[] {
  const bySlug = new Map(centroids.map((c) => [c.slug.toLowerCase(), c]));
  const out: SearchProject[] = [];
  const seen = new Set<string>();
  for (const m of membership) {
    const key = m.slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const c = bySlug.get(key);
    if (c) {
      out.push(asSearchProject(c));
    } else {
      out.push({
        result_kind: "project",
        slug: m.slug,
        title: m.title,
        description: m.description ?? null,
        entity_count: 0,
        table_count: 0,
        bbox: null,
        match_detail: "",
      });
    }
  }
  return out;
}

export async function loadHomeDiscovery(args: LoadArgs): Promise<DiscoveryPageData> {
  const parsed = parseSearchParams(args.url);
  if (hasActiveSearch(parsed)) {
    const search = await loadDiscoverySearch(args);
    return { browse: false, ...search };
  }

  const accessToken = (await args.locals.getAccessToken()) ?? null;
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const centroids = await loadCentroids(args.fetch, headers);
  let projects: SearchProject[];
  if (accessToken) {
    const membership = await loadMembership(args.fetch, headers);
    projects = mergeMembership(membership, centroids);
  } else {
    projects = centroids.map(asSearchProject);
  }

  return {
    browse: true,
    query: "",
    lat: null,
    lng: null,
    radius: null,
    bbox: null,
    dateFrom: null,
    dateTo: null,
    tags: [],
    vocabularies: [],
    projectSlugs: [],
    semantic: true,
    mediaHash: null,
    imageQuery: false,
    similarItems: [],
    similarStatus: "",
    projects,
    entityHits: {},
    placeName: null,
    accessToken,
  };
}
