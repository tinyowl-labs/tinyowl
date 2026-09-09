import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { TINYOWL_CORE_URL } from "$env/static/private";

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
    const { user } = await locals.getSession();
    const next = url.pathname + url.search;
    if (!user) throw redirect(303, `/auth/login?next=${encodeURIComponent(next)}`);
    const accessToken = await locals.getAccessToken();
    if (!accessToken) {
        throw redirect(303, `/auth/login?next=${encodeURIComponent(next)}`);
    }

    let qfieldAccounts: {
        id: string;
        base_url: string;
        username: string;
        label?: string | null;
    }[] = [];
    try {
        const response = await fetch(
            `${TINYOWL_CORE_URL}/api/v1/integrations/qfieldcloud/accounts`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (response.ok) qfieldAccounts = await response.json();
    } catch (_) {}

    return {
        accessToken,
        qfieldAccounts,
        org: url.searchParams.get("org")?.trim() ?? "",
    };
};
