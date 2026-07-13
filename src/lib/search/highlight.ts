/** Escape HTML special characters. */
export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Query terms suitable for highlighting (skip tiny tokens). */
export function queryTerms(query: string): string[] {
	return query
		.trim()
		.split(/\s+/)
		.map((t) => t.replace(/^[#@]+/, ''))
		.filter((t) => t.length >= 2);
}

/**
 * Escape text then wrap query matches in <mark class="search-hit">.
 * Safe for {@html …}.
 */
export function highlightHtml(text: string, query: string): string {
	const escaped = escapeHtml(text ?? '');
	const terms = queryTerms(query);
	if (!terms.length) return escaped;
	const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
	return escaped.replace(re, '<mark class="search-hit">$1</mark>');
}

/**
 * Render a Postgres ts_headline snippet that uses <<hit>> markers.
 * Falls back to plain highlightHtml when markers are absent.
 */
export function headlineHtml(snippet: string, query: string): string {
	const raw = (snippet ?? '').replace(/\s+/g, ' ').trim();
	if (!raw) return '';
	if (!raw.includes('<<')) return highlightHtml(raw, query);
	const escaped = escapeHtml(raw);
	return escaped
		.replace(/&lt;&lt;/g, '<mark class="search-hit">')
		.replace(/&gt;&gt;/g, '</mark>');
}

/** True if text contains any query term (case-insensitive). */
export function textMatchesQuery(text: string, query: string): boolean {
	const lower = (text ?? '').toLowerCase();
	return queryTerms(query).some((t) => lower.includes(t.toLowerCase()));
}

/** Human-readable label for API match_detail. */
export function formatMatchDetail(detail: string): string {
	const raw = (detail ?? '').trim();
	if (!raw) return '';
	const hasSemantic =
		raw === 'semantic' || /\s*·\s*semantic$/i.test(raw);
	const d =
		raw === 'semantic'
			? ''
			: raw.replace(/\s*·\s*semantic$/i, '').trim();

	let labeled = '';
	if (d === 'title') labeled = 'Title';
	else if (d === 'description') labeled = 'Description';
	else if (d === 'slug') labeled = 'Slug';
	else if (d === 'readme') labeled = 'README';
	else if (d === 'tags') labeled = 'Tags';
	else if (d) {
		const vocab = d.match(/^(\d+)\s+vocabulary terms?$/i);
		if (vocab) {
			const n = Number(vocab[1]);
			labeled = n === 1 ? 'Vocabulary' : `${n} vocabulary terms`;
		} else if (/vocabulary/i.test(d) || /tag/i.test(d)) {
			labeled = d;
		} else {
			labeled = d.charAt(0).toUpperCase() + d.slice(1);
		}
	}

	if (hasSemantic) return labeled ? `${labeled} · semantic` : 'Semantic';
	return labeled;
}

/** True when match_detail is a vocabulary hit. */
export function isVocabularyMatch(detail: string): boolean {
	return /vocabulary/i.test(detail ?? '');
}
