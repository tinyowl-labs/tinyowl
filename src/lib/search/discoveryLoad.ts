import type { SearchBBox } from "$lib/search/params";

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
  lat?: number | null;
  lng?: number | null;
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

export type SearchEntityHit = {
  entity_type: string;
  entity_id: string;
  column_name: string;
  match_value: string;
  project_slug?: string;
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

export type DiscoveryPageData = {
  browse: boolean;
  query: string;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  bbox: SearchBBox | null;
  dateFrom: number | null;
  dateTo: number | null;
  tags: string[];
  vocabularies: string[];
  projectSlugs: string[];
  semantic: boolean;
  mediaHash: string | null;
  imageQuery: boolean;
  similarItems: SimilarMediaItem[];
  similarStatus: string;
  projects: SearchProject[];
  entityHits: Record<string, SearchEntityHit[]>;
  placeName: string | null;
  accessToken: string | null;
};
