export function jsonAuthHeaders(accessToken: string): HeadersInit {
    const h: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
    return h;
}

export function canWriteRole(role: string): boolean {
    return role === "owner" || role === "admin" || role === "collaborator";
}

export function formatCommitDate(ts: string, withTime = true): string {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
}

export type GeodiffTableSummary = {
    table: string;
    insert?: number;
    update?: number;
    delete?: number;
};

export function entitySummary(summary: unknown): GeodiffTableSummary[] {
    return (Array.isArray(summary) ? summary : []).filter(
        (s: GeodiffTableSummary) => !String(s?.table ?? "").startsWith("_"),
    );
}

export type InvertResult =
    | { ok: true; commitId: string }
    | { ok: false; error: string };

export async function invertCommit(opts: {
    slug: string;
    accessToken: string;
    commitId: string;
    message: string;
}): Promise<InvertResult> {
    try {
        const res = await fetch(
            `/api/v1/projects/${opts.slug}/commits/${opts.commitId}/invert`,
            {
                method: "POST",
                headers: jsonAuthHeaders(opts.accessToken),
                body: JSON.stringify({ message: opts.message.trim() }),
            },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                ok: false,
                error: body.error || `Failed (${res.status})`,
            };
        }
        return { ok: true, commitId: String(body.commit_id ?? "") };
    } catch (e: any) {
        return { ok: false, error: e?.message || "Invert failed" };
    }
}
