/** Read a complete related table only when a graph or FK consumer needs it. */
export async function readTableRows(opts: {
    slug: string; table: string; ref: string; headers?: HeadersInit;
    signal?: AbortSignal; fetcher?: typeof fetch;
}): Promise<Record<string, unknown>[]> {
    const fetcher = opts.fetcher ?? fetch;
    const result: Record<string, unknown>[] = [];
    let commit = "";
    for (let offset = 0;;) {
        const qs = new URLSearchParams({ref: opts.ref, limit: "1000", offset: String(offset)});
        if (commit) qs.set("expected_commit", commit);
        const res = await fetcher(`/api/v1/projects/${encodeURIComponent(opts.slug)}/tables/${encodeURIComponent(opts.table)}/rows?${qs}`, {headers: opts.headers, signal: opts.signal});
        if (!res.ok) throw new Error(`Could not load ${opts.table}: HTTP ${res.status}`);
        const body = await res.json();
        if (!Array.isArray(body.rows)) throw new Error(`Invalid table response for ${opts.table}`);
        if (!commit) commit = body.commit_id ?? "";
        result.push(...body.rows);
        offset += body.rows.length;
        if (body.rows.length < 1000 || offset >= Number(body.total ?? Infinity)) return result;
    }
}
