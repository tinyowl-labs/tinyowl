import type { PageServerLoad, Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
  const slug = params.project;

  const accessToken = await locals.getAccessToken();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let readme: string | null = null;
  try {
    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/readme`,
      { headers },
    );
    if (res.ok) readme = await res.text();
  } catch (_) {}

  return { readme };
};

export const actions: Actions = {
  saveReadme: async ({ request, locals, params, fetch }) => {
    const { user } = await locals.getSession();
    if (!user) return { error: "Not signed in" };

    const data = await request.formData();
    const content = String(data.get("content") ?? "");

    const slug = params.project;
    const accessToken = await locals.getAccessToken();

    const res = await fetch(
      `${TINYOWL_CORE_URL}/api/v1/projects/${slug}/readme`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "text/markdown",
          Authorization: `Bearer ${accessToken}`,
        },
        body: content,
      },
    );

    if (!res.ok) return { error: "Failed to save readme" };
    return { success: true };
  },
};
