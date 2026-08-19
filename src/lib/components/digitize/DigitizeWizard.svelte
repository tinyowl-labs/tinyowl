<script lang="ts">
    import CreateProjectStep from "./CreateProjectStep.svelte";
    import ImportDataStep from "./ImportDataStep.svelte";
    import MediaStep from "./MediaStep.svelte";
    import DoneStep from "./DoneStep.svelte";
    import CheckIcon from "@lucide/svelte/icons/check";
    import FileInputIcon from "@lucide/svelte/icons/file-input";

    type Props = {
        accessToken: string;
        existingSlug?: string;
        existingTitle?: string;
    };

    let { accessToken, existingSlug = "", existingTitle = "" }: Props =
        $props();

    type Step = "create" | "import" | "media" | "done";

    let step = $state<Step>(existingSlug ? "import" : "create");
    let slug = $state(existingSlug);
    let title = $state(existingTitle);
    let tableKey = $state("");
    let rowCount = $state(0);

    const steps: { id: Step; label: string; hint: string }[] = existingSlug
        ? [
              {
                  id: "import",
                  label: "Import",
                  hint: "CSV or GeoJSON",
              },
              { id: "media", label: "Media", hint: "Optional photos" },
              { id: "done", label: "Done", hint: "Browse & link" },
          ]
        : [
              { id: "create", label: "Create", hint: "Licence & embargo" },
              {
                  id: "import",
                  label: "Import",
                  hint: "CSV or GeoJSON",
              },
              { id: "media", label: "Media", hint: "Optional photos" },
              { id: "done", label: "Done", hint: "Browse & link" },
          ];

    function stepIndex(s: Step) {
        return steps.findIndex((x) => x.id === s);
    }

    const inProject = $derived(Boolean(existingSlug));
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
                Add CSV or GeoJSON into {existingTitle || existingSlug}. Tables
                stay project-owned — map values when you’re ready.
            {:else}
                Every site keeps its own tables. Import what you have, then link
                foreign keys and map values when you’re ready.
            {/if}
        </p>
    </div>

    <nav class="mb-6" aria-label="Progress">
        <ol
            class="grid gap-2 {steps.length === 3
                ? 'sm:grid-cols-3'
                : 'sm:grid-cols-4'}"
        >
            {#each steps as s, i}
                {@const active = s.id === step}
                {@const done = stepIndex(step) > i}
                <li
                    class="flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors {active
                        ? 'border-primary/60 bg-primary/5'
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
                <ImportDataStep
                    {accessToken}
                    {slug}
                    onImported={(info) => {
                        tableKey = info.tableKey;
                        rowCount = info.rows;
                        step = "media";
                    }}
                />
            {:else if step === "media"}
                <MediaStep
                    {accessToken}
                    projectSlug={slug}
                    onContinue={() => (step = "done")}
                    onSkip={() => (step = "done")}
                />
            {:else}
                <DoneStep {slug} {title} {tableKey} {rowCount} />
            {/if}
        </div>
    </div>
</article>
