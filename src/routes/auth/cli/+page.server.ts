import type { PageServerLoad } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals }) => {
  const accessToken = await locals.getAccessToken();
  return { accessToken, serverUrl: TINYOWL_CORE_URL };
};
