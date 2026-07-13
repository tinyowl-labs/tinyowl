import { error } from "@sveltejs/kit";
import { marked } from "marked";
import type { PageServerLoad } from "./$types";

const docs = import.meta.glob<string>(
  "../../../lib/docs/**/*.md",
  { eager: true, query: "?raw", import: "default" },
);

export const load: PageServerLoad = async ({ params }) => {
  const slug = params.path || "index";

  // Try exact file match first, then directory index
  const exact = `../../../lib/docs/${slug}.md`;
  const dirIndex = `../../../lib/docs/${slug}/index.md`;
  const key = docs[exact] !== undefined ? exact : dirIndex;
  const raw = docs[key];

  if (raw === undefined) {
    throw error(404, "Page not found");
  }

  const html = marked.parse(raw) as string;

  const titleMatch = raw.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Documentation";

  return { html, title };
};
