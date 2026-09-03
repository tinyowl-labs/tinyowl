import type { Actions } from "./$types";
import { TINYOWL_CORE_URL } from "$env/static/private";

function parseTags(data: FormData): string[] {
    const tags = data
        .getAll("tag")
        .map((v) => String(v).trim())
        .filter(Boolean);
    const draft = String(data.get("tag_draft") ?? "").trim();
    if (draft) tags.push(draft);
    return tags;
}

function parseYear(raw: string): number | null | { error: string } {
    const s = raw.trim();
    if (!s) return null;
    const n = Number(s);
    if (!Number.isInteger(n)) return { error: "Years must be whole numbers." };
    if (n < -1000000 || n > 10000) return { error: "Year out of range." };
    return n;
}

export const actions: Actions = {
    updateGeneral: async ({ request, locals, params, fetch }) => {
        const { user } = await locals.getSession();
        if (!user) return { error: "Not signed in" };

        const data = await request.formData();
        const title = String(data.get("title") ?? "").trim();
        const description = String(data.get("description") ?? "");
        const tags = parseTags(data);
        const dateStart = parseYear(String(data.get("date_start") ?? ""));
        const dateEnd = parseYear(String(data.get("date_end") ?? ""));
        const dateStartLabel = String(data.get("date_start_label") ?? "").trim();
        const dateEndLabel = String(data.get("date_end_label") ?? "").trim();

        if (!title) return { error: "Title is required." };
        if (dateStart && typeof dateStart === "object") return dateStart;
        if (dateEnd && typeof dateEnd === "object") return dateEnd;
        if (
            typeof dateStart === "number" &&
            typeof dateEnd === "number" &&
            dateStart > dateEnd
        ) {
            return { error: "Start year must be on or before end year." };
        }

        const slug = params.project;
        const accessToken = await locals.getAccessToken();

        const res = await fetch(`${TINYOWL_CORE_URL}/api/v1/projects/${slug}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                title,
                description,
                tags_manual: tags,
                date_start: dateStart,
                date_end: dateEnd,
                date_start_label: dateStartLabel,
                date_end_label: dateEndLabel,
            }),
        });
        if (!res.ok) return { error: `Failed: ${await res.text()}` };
        return { success: true };
    },
};
