<script lang="ts">
    import { untrack } from "svelte";
    import CreateProjectStep from "./CreateProjectStep.svelte";
    import ImportDataStep from "./ImportDataStep.svelte";
    import ImportMediaStep from "./ImportMediaStep.svelte";
    import DoneStep from "./DoneStep.svelte";
    import CheckIcon from "@lucide/svelte/icons/check";
    import FileInputIcon from "@lucide/svelte/icons/file-input";
    import type { MediaKind } from "$lib/project/uploadMedia";

    type Step = "create" | "import" | "done";
    type ImportKind = "table" | "media";

    type Props = {
        accessToken: string;
        existingSlug?: string;
        existingTitle?: string;
        initialImportKind?: ImportKind;
    };

    let {
        accessToken,
        existingSlug = "",
        existingTitle = "",
        initialImportKind = "table",
    }: Props = $props();

    let step = $state<Step>(
        untrack(() => (existingSlug ? "import" : "create")),
    );
    let slug = $state(untrack(() => existingSlug));
    let title = $state(untrack(() => existingTitle));
    let tableKey = $state("");
    let rowCount = $state(0);
    let pendingReview = $state(false);
    let changesetId = $state("");
    let importKind = $state<ImportKind>(untrack(() => initialImportKind));
    let mediaStored = $state(0);
    let mediaQueued = $state(0);
    let mediaNames = $state.raw<string[]>([]);
    let mediaKinds = $state.raw<MediaKind[]>([]);
    let doneKind = $state<ImportKind>("table");

    const steps = $derived.by((): { id: Step; label: string; hint: string }[] =>
        existingSlug
            ? [
                  {
                      id: "import",
                      label: "Import",
                      hint: "Table or media",
                  },
                  { id: "done", label: "Done", hint: "Browse & link" },
              ]
            : [
                  { id: "create", label: "Create", hint: "Licence & embargo" },
                  {
                      id: "import",
                      label: "Import",
                      hint: "Table or media",
                  },
                  { id: "done", label: "Done", hint: "Browse & link" },
              ],
    );

    function stepIndex(s: Step) {
        return steps.findIndex((x) => x.id === s);
    }

    const inProject = $derived(Boolean(existingSlug));

    function finishTable(info: {
        tableKey: string;
        rows: number;
        format?: string;
        pending?: boolean;
        changesetId?: string;
    }) {
        doneKind = "table";
        tableKey = info.tableKey;
        rowCount = info.rows;
        pendingReview = Boolean(info.pending);
        changesetId = info.changesetId ?? "";
        step = "done";
    }

    function finishMedia(info: {
        stored: number;
        queued: number;
        names: string[];
        kinds: MediaKind[];
    }) {
        doneKind = "media";
        mediaStored = info.stored;
        mediaQueued = info.queued;
        mediaNames = info.names;
        mediaKinds = info.kinds;
        pendingReview = false;
        changesetId = "";
        tableKey = "";
        rowCount = 0;
        step = "done";
    }
</script>

<article class="mx-auto max-w-4xl px-6 py-12">
    <div class="mb-8">
        <div class="flex items-center gap-3">
            <FileInputIcon class="size-6 text-muted-foreground" />
            <h1 class="text-2xl font-bold tracking-tight text-foreground">
                {inProject ? "Import" : "Start from a file"}
            </h1>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
            {#if inProject}
                Add a CSV/GeoJSON table, or drop photos, a PDF, an ortho, or a
                3D tileset into {existingTitle || existingSlug} — no spatial
                file required for media.
            {:else}
                Every site keeps its own tables. Import a table, or land media
                first and link it later.
            {/if}
        </p>
    </div>

    <nav class="mb-6" aria-label="Progress">
        <ol
            class="grid gap-2 {steps.length === 2
                ? 'sm:grid-cols-2'
                : 'sm:grid-cols-3'}"
        >
            {#each steps as s, i (s.id)}
                {@const active = s.id === step}
                {@const done = stepIndex(step) > i}
                <li
                    class="flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors {active
                        ? 'selected'
                        : done
                          ? 'border-border bg-card/40'
                          : 'border-border/60 opacity-70'}"
                >
                    <span
                        class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold {done
                            ? 'bg-primary text-primary-foreground'
                            : active
                              ? 'bg-foreground text-background'
                              : 'bg-secondary text-muted-foreground'}"
                    >
                        {#if done}
                            <CheckIcon class="size-3.5" />
                        {:else}
                            {i + 1}
                        {/if}
                    </span>
                    <span class="min-w-0">
                        <span class="block text-sm font-medium text-foreground"
                            >{s.label}</span
                        >
                        <span class="block text-[11px] text-muted-foreground"
                            >{s.hint}</span
                        >
                    </span>
                </li>
            {/each}
        </ol>
    </nav>

    <div class="rounded-lg border border-border overflow-hidden">
        <div class="p-5 sm:p-6">
            {#if step === "create"}
                <CreateProjectStep
                    {accessToken}
                    onCreated={(info) => {
                        slug = info.slug;
                        title = info.title;
                        step = "import";
                    }}
                />
            {:else if step === "import"}
                <div
                    class="mb-5 inline-flex rounded-lg border border-border p-0.5"
                    role="tablist"
                    aria-label="Import kind"
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={importKind === "table"}
                        class="rounded-md px-3 py-1.5 text-sm {importKind ===
                        'table'
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'}"
                        onclick={() => (importKind = "table")}
                    >
                        Table
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={importKind === "media"}
                        class="rounded-md px-3 py-1.5 text-sm {importKind ===
                        'media'
                            ? 'bg-secondary text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground'}"
                        onclick={() => (importKind = "media")}
                    >
                        Media
                    </button>
                </div>
                <div class={importKind === "table" ? "" : "hidden"}>
                    <ImportDataStep
                        {accessToken}
                        {slug}
                        onImported={finishTable}
                    />
                </div>
                <div class={importKind === "media" ? "" : "hidden"}>
                    <ImportMediaStep
                        {accessToken}
                        {slug}
                        onUploaded={finishMedia}
                    />
                </div>
            {:else}
                <DoneStep
                    {slug}
                    {title}
                    {tableKey}
                    {rowCount}
                    pending={pendingReview}
                    {changesetId}
                    importKind={doneKind}
                    {mediaStored}
                    {mediaQueued}
                    {mediaNames}
                    {mediaKinds}
                />
            {/if}
        </div>
    </div>
</article>
