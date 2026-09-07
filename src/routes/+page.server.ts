import type { PageServerLoad } from "./$types";
import { loadHomeDiscovery } from "$lib/search/loadDiscovery.server";

export type { SearchProject } from "$lib/search/discoveryLoad";

export const load: PageServerLoad = async (event) => {
  return loadHomeDiscovery(event);
};
