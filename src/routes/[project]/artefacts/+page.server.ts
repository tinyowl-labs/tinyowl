import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, parent }) => {
  const accessToken = await locals.getAccessToken();
  const parentData = await parent();
  return {
    accessToken: accessToken ?? "",
    role: (parentData as { role?: string }).role ?? "viewer",
    isMember: Boolean((parentData as { isMember?: boolean }).isMember),
  };
};
