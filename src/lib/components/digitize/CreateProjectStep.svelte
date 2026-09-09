<script lang="ts">
    import { untrack } from "svelte";
    import CheckIcon from "@lucide/svelte/icons/check";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import SearchIcon from "@lucide/svelte/icons/search";
    import CloudIcon from "@lucide/svelte/icons/cloud";
    import {
        LICENCES,
        LOCATION_PRECISIONS,
    } from "$lib/project/licences";

    type QFieldAccount = {
        id: string;
        base_url: string;
        username: string;
        label?: string | null;
    };

    type Props = {
        accessToken: string;
        onCreated: (info: {
            slug: string;
            title: string;
            fieldSync: boolean;
        }) => void;
        source?: "template" | "import";
        template?: string;
        org?: string;
        qfieldAccounts?: QFieldAccount[];
    };

    let {
        accessToken,
        onCreated,
        source = "import",
        template = "",
        org = "",
        qfieldAccounts = [],
    }: Props = $props();

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
    let createdSlug = $state("");
    let slugTouched = $state(false);
    let enableFieldSync = $state(false);
    let qfieldAccountID = $state(
        untrack(() => qfieldAccounts[0]?.id ?? ""),
    );

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
            if (org) body.org = org;
            if (template) body.template = template;
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
            createdSlug = data.slug ?? slug.trim();
            if (enableFieldSync) {
                if (!qfieldAccountID) {
                    error = "Choose a connected QFieldCloud account";
                    return;
                }
                const cloudRes = await fetch(
                    `/api/v1/projects/${encodeURIComponent(createdSlug)}/qfieldcloud-provision`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            account_id: qfieldAccountID,
                            name: createdSlug.replaceAll("/", "-"),
                            description: description.trim(),
                        }),
                    },
                );
                const cloudData = await cloudRes.json().catch(() => ({}));
                if (!cloudRes.ok) {
                    error = `Project created, but field sync setup failed: ${cloudData.error || cloudData.message || cloudRes.status}`;
                    return;
                }
            }
            onCreated({
                slug: createdSlug,
                title: title.trim(),
                fieldSync: enableFieldSync,
            });
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
            {source === "template"
                ? "Set the project details before the recording schema is created."
                : "Set the project details now; the schema will come from your first import."}
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
                            ? 'border-selected bg-selected'
                            : 'border-border'}"
                    >
                        {#if licence === lic.key}
                            <CheckIcon class="size-2.5 text-selected-foreground" />
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

    <section class="flex flex-col gap-3">
        <div>
            <h3 class="text-sm font-medium text-foreground">Field sync</h3>
            <p class="text-xs text-muted-foreground mt-0.5 max-w-lg">
                Optional. Creates a private project on your self-hosted
                QFieldCloud and keeps its field package projected from develop.
            </p>
        </div>
        <div class="rounded-lg border border-border px-3 py-3">
            <label class="flex items-start gap-3">
                <input
                    type="checkbox"
                    class="mt-1"
                    bind:checked={enableFieldSync}
                    disabled={qfieldAccounts.length === 0}
                />
                <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <CloudIcon class="size-4" />
                        Enable QField sync
                    </span>
                    <span class="block text-xs text-muted-foreground mt-0.5">
                        {#if qfieldAccounts.length === 0}
                            Connect a QFieldCloud account in Settings first.
                        {:else if source === "import"}
                            Cloud projection waits for the first table import.
                        {:else}
                            The template dataset is queued for Cloud immediately.
                        {/if}
                    </span>
                </span>
            </label>
            {#if enableFieldSync && qfieldAccounts.length > 0}
                <label class="mt-3 flex flex-col gap-1.5 text-sm">
                    <span class="text-muted-foreground">QFieldCloud account</span>
                    <select
                        class="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                        bind:value={qfieldAccountID}
                    >
                        {#each qfieldAccounts as account (account.id)}
                            <option value={account.id}>
                                {account.label || account.base_url} — {account.username}
                            </option>
                        {/each}
                    </select>
                </label>
            {/if}
        </div>
        {#if qfieldAccounts.length === 0}
            <a
                href="/settings"
                class="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >Connect QFieldCloud in Settings</a>
        {/if}
    </section>

    {#if error}
        <div class="text-sm text-destructive">
            <p>{error}</p>
            {#if createdSlug}
                <a
                    href="/{encodeURIComponent(createdSlug)}/settings/qfieldcloud"
                    class="mt-1 inline-block underline underline-offset-4"
                >Open the created project</a>
            {/if}
        </div>
    {/if}

    <button
        type="submit"
        disabled={busy}
        class="self-start rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
    >
        {busy
            ? "Creating…"
            : source === "template"
              ? "Create from template"
              : "Create and import"}
    </button>
</form>
