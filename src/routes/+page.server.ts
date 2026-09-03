import type { PageServerLoad } from "./$types";
import { loadHomeDiscovery } from "$lib/search/loadDiscovery.server";

export type { SearchProject } from "$lib/search/discoveryLoad";
/** @deprecated Use SearchProject — kept for ProjectMap imports. */
export type Centroid = import("$lib/search/discovery").DiscoveryProject;

export const load: PageServerLoad = async (event) => {
  return loadHomeDiscovery(event);
};
