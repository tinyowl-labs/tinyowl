import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export type {
  SearchEntityHit,
  SearchMatchHit,
  SearchProject,
  SimilarMediaItem,
} from "$lib/search/discoveryLoad";

export const load: PageServerLoad = async ({ url }) => {
  throw redirect(302, url.search ? `/${url.search}` : "/");
};
