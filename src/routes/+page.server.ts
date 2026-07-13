import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export type Centroid = {
  slug: string;
  title: string;
  entity_count: number;
  table_count: number;
  lat: number;
  lng: number;
};

export const load: PageServerLoad = async ({ locals, fetch }) => {
  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let centroids: Centroid[] = [];
  try {
    const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/centroids`, {
      headers,
    });
    if (res.ok) centroids = await res.json();
  } catch (_) {}

  return { centroids, accessToken };
};
