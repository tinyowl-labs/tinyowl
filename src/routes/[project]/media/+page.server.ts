import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
  const slug = params.project;

  let media: Array<{
    hash: string;
    media_type: string;
    file_size: number;
    url: string;
    entities: Array<{ entity_type: string; entity_id: string }>;
  }> = [];

  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/media`,
    );
    if (res.ok) media = await res.json();
  } catch (_) {}

  // Group by media type for display
  const byType: Record<string, typeof media> = {};
  for (const item of media) {
    const type = item.media_type.split("/")[0] || "other";
    if (!byType[type]) byType[type] = [];
    byType[type].push(item);
  }

  return { media, byType };
};
