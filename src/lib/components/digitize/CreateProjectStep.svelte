<script lang="ts">
    import CheckIcon from "@lucide/svelte/icons/check";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import SearchIcon from "@lucide/svelte/icons/search";
    import {
        LICENCES,
        LOCATION_PRECISIONS,
    } from "$lib/project/licences";

    type Props = {
        accessToken: string;
        onCreated: (info: { slug: string; title: string }) => void;
    };

    let { accessToken, onCreated }: Props = $props();

    let title = $state("");
    let slug = $state("");
    let description = $state("");
    let licence = $state("CC_BY_4");
    let licenceQuery = $state("");
    let embargoUntil = $state("");
    let embargoNote = $state("");
    let locationPrecision = $state("exact");
    let busy = $state(false);
    let error = $state("");
    let slugTouched = $state(false);

    const filteredLicences = $derived.by(() => {
        const q = licenceQuery.trim().toLowerCase();
        if (!q) return LICENCES;
        return LICENCES.filter(
            (l) =>
                l.key.toLowerCase().includes(q) ||
                l.label.toLowerCase().includes(q) ||
                l.desc.toLowerCase().includes(q),
        );
    });

    function slugify(s: string) {
        return s
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 64);
    }

    $effect(() => {
        if (!slugTouched) slug = slugify(title);
    });

    /** datetime-local → RFC3339 for API */
    function embargoUntilISO(local: string): string | undefined {
        const t = local.trim();
        if (!t) return undefined;
        const d = new Date(t);
        if (Number.isNaN(d.getTime())) return undefined;
        return d.toISOString();
    }

    async function submit(e: Event) {
        e.preventDefault();
        error = "";
        if (!title.trim() || !slug.trim()) {
            error = "Title and slug are required";
            return;
        }
        busy = true;
        try {
            const body: Record<string, string> = {
                slug: slug.trim(),
                title: title.trim(),
                description: description.trim(),
                licence: licence || "CC_BY_4",
                location_precision: locationPrecision || "exact",
            };
            if (embargoNote.trim()) body.embargo_note = embargoNote.trim();
            const until = embargoUntilISO(embargoUntil);
            if (until) body.embargo_until = until;

            const res = await fetch("/api/v1/projects", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                error =
                    data.error ||
                    data.message ||
                    `Create failed (${res.status})`;
                return;
            }
            onCreated({ slug: data.slug ?? slug.trim(), title: title.trim() });
        } catch (err) {
            error = err instanceof Error ? err.message : "Create failed";
        } finally {
            busy = false;
        }
    }
</script>

<form class="flex flex-col gap-6" onsubmit={submit}>
    <div>
        <h2 class="text-base font-semibold text-foreground">New project</h2>
        <p class="text-sm text-muted-foreground mt-0.5 max-w-lg">
            Same licence and embargo controls as Settings. Schema still comes
            from your files next — not a shared template.
        </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span class="text-muted-foreground">Title</span>
            <input
                class="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                bind:value={title}
                required
                placeholder="Çatalhöyük zooarchaeology"
            />
        </label>

        <label class="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span class="text-muted-foreground">Slug</span>
            <input
                class="rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
                bind:value={slug}
                oninput={() => (slugTouched = true)}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="catalhoyuk-zooarch"
            />
        </label>

        <label class="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span class="text-muted-foreground">Description</span>
            <textarea
                class="rounded-md border border-input bg-background px-3 py-2 text-foreground min-h-[64px]"
                bind:value={description}
                placeholder="Source, citation, short context…"
            ></textarea>
        </label>
    </div>

    <section class="flex flex-col gap-2">
        <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
                <h3 class="text-sm font-medium text-foreground">Licence</h3>
                <p class="text-xs text-muted-foreground">
                    How others may use this project’s data
                </p>
            </div>
            <label
                class="relative flex items-center gap-1.5 text-xs text-muted-foreground"
            >
                <SearchIcon class="size-3.5 absolute left-2 pointer-events-none" />
                <input
                    class="rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs text-foreground w-40"
                    placeholder="Search…"
                    bind:value={licenceQuery}
                />
            </label>
        </div>
        <div
            class="rounded-lg border border-border divide-y divide-border max-h-56 overflow-y-auto"
        >
            {#each filteredLicences as lic}
                <button
                    type="button"
                    class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors {licence ===
                    lic.key
                        ? 'bg-secondary/50'
                        : ''}"
                    onclick={() => (licence = lic.key)}
                >
                    <span
                        class="flex size-4 shrink-0 items-center justify-center rounded-full border {licence ===
                        lic.key
                            ? 'border-primary bg-primary'
                            : 'border-border'}"
                    >
                        {#if licence === lic.key}
                            <CheckIcon class="size-2.5 text-primary-foreground" />
                        {/if}
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="text-sm text-foreground">{lic.label}</span>
                        {#if lic.desc}
                            <span class="text-sm text-muted-foreground">
                                — {lic.desc}</span
                            >
                        {/if}
                    </span>
                    {#if lic.url}
                        <a
                            href={lic.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                            title="View licence"
                            onclick={(e) => e.stopPropagation()}
                        >
                            <ExternalLinkIcon class="size-3.5" />
                        </a>
                    {/if}
                </button>
            {:else}
                <p class="px-3 py-4 text-sm text-muted-foreground">
                    No licences match “{licenceQuery}”
                </p>
            {/each}
        </div>
    </section>

    <section class="flex flex-col gap-3">
        <div>
            <h3 class="text-sm font-medium text-foreground">
                Embargo & location precision
            </h3>
            <p class="text-xs text-muted-foreground mt-0.5">
                While embargoed, or when precision is reduced, non-collaborators
                see fuzzed or hidden locations (same as Settings).
            </p>
        </div>
        <div
            class="rounded-lg border border-border divide-y divide-border"
        >
            <label
                class="flex flex-col gap-1.5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
                <span class="text-sm text-foreground">Embargo until</span>
                <input
                    type="datetime-local"
                    class="rounded-md border border-input bg-background px-2 py-1.5 text-sm w-full sm:w-56"
                    bind:value={embargoUntil}
                />
            </label>
            <label class="flex flex-col gap-1.5 px-3 py-3">
                <span class="text-sm text-foreground">Embargo note</span>
                <textarea
                    class="rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[48px]"
                    bind:value={embargoNote}
                    placeholder="Optional reason for admins / CARE context"
                ></textarea>
            </label>
            <label
                class="flex flex-col gap-1.5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
                <span class="min-w-0">
                    <span class="block text-sm text-foreground"
                        >Location precision</span
                    >
                    <span class="block text-xs text-muted-foreground"
                        >Maps & search for non-collaborators</span
                    >
                </span>
                <select
                    class="rounded-md border border-input bg-background px-2 py-1.5 text-sm w-full sm:w-40"
                    bind:value={locationPrecision}
                >
                    {#each LOCATION_PRECISIONS as p}
                        <option value={p.key}>{p.label}</option>
                    {/each}
                </select>
            </label>
        </div>
    </section>

    {#if error}
        <p class="text-sm text-destructive">{error}</p>
    {/if}

    <button
        type="submit"
        disabled={busy}
        class="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
    >
        {busy ? "Creating…" : "Create project"}
    </button>
</form>
