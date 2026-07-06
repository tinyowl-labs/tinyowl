import { error } from "@sveltejs/kit";
import { marked } from "marked";
import { readFileSync } from "fs";
import { resolve } from "path";

export const load = async ({ params }) => {
  const slug = params.path || "index";
  const filePath = resolve("src/lib/docs", `${slug}.md`);

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw error(404, "Page not found");
  }

  const html = marked.parse(raw) as string;

  const titleMatch = raw.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : "Documentation";

  return { html, title };
};
