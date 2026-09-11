export type QuerySpanType =
	| "operation"
	| "record_set"
	| "scope"
	| "concept"
	| "time"
	| "place"
	| "identifier"
	| "field"
	| "comparator"
	| "value"
	| "relation"
	| "measure"
	| "group"
	| "view"
	| "quantifier";

export type QuerySpan = {
	type: QuerySpanType;
	surface: string;
	span: [number, number];
	confidence: number;
};

export type QuerySpanResponse = {
	contract: "query-plan-spans-v1";
	carrier: string;
	model: string;
	spans: QuerySpan[];
};

export async function classifyQuerySpans(
	carrier: string,
	opts?: { accessToken?: string | null; signal?: AbortSignal },
): Promise<QuerySpanResponse> {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (opts?.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
	const res = await fetch("/api/v1/search/nlp", {
		method: "POST",
		headers,
		body: JSON.stringify({ carrier }),
		signal: opts?.signal,
	});
	if (!res.ok) throw new Error(res.status === 429 ? "Smart terms is busy" : "Smart terms is unavailable");
	const data = (await res.json()) as QuerySpanResponse;
	if (data.contract !== "query-plan-spans-v1" || data.carrier !== carrier || !Array.isArray(data.spans)) {
		throw new Error("Smart terms returned an invalid response");
	}
	return data;
}

export function normalizedLabel(raw: string): string {
	return raw
		.toLocaleLowerCase()
		.replace(/^\s*(?:(?:in|at|within|from|across)\s+)?(?:the\s+)?/, "")
		.replace(/\s+(?:project|site|table)$/i, "")
		.replace(/[_\-]+/g, " ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}
