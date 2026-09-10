<script lang="ts">
    import { goto } from "$app/navigation";
    import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
    import FileInputIcon from "@lucide/svelte/icons/file-input";
    import LayoutTemplateIcon from "@lucide/svelte/icons/layout-template";
    import CreateProjectStep from "$lib/components/digitize/CreateProjectStep.svelte";

    type StartSource = "template" | "import";
    type QFieldAccount = {
        id: string;
        base_url: string;
        username: string;
        label?: string | null;
    };

    type Props = {
        accessToken: string;
        org?: string;
        qfieldAccounts?: QFieldAccount[];
		managedQField?: { enabled: boolean; base_url?: string; label?: string };
    };

    let { accessToken, org = "", qfieldAccounts = [], managedQField = { enabled: false } }: Props = $props();
    let source = $state<StartSource | null>(null);
    let template = $state("mola-scr");

    function finish(info: { slug: string; fieldSync: boolean }) {
        const project = encodeURIComponent(info.slug);
        if (source === "import") {
            goto(`/${encodeURIComponent(project)}/import`);
            return;
        }
        goto(
            info.fieldSync
                ? `/${project}/settings/qfieldcloud`
                : `/${project}/dashboard`,
        );
    }
</script>

<article class="mx-auto max-w-4xl px-6 py-12">
    <div class="mb-8">
        <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {org ? `New project in ${org}` : "New project"}
        </p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight text-foreground">
            How do you want to start?
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
            Choose a recording schema now, or let the first dataset define it.
            Field sync is available in either path.
        </p>
    </div>

    {#if source === null}
        <div class="grid gap-4 sm:grid-cols-2">
            <button
                type="button"
                class="group rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/25 hover:bg-accent/30"
                onclick={() => (source = "template")}
            >
                <span class="flex size-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <LayoutTemplateIcon class="size-5" />
                </span>
                <span class="mt-4 block text-base font-semibold text-foreground">
                    Start from template
                </span>
                <span class="mt-1 block text-sm text-muted-foreground">
                    Begin with a ready recording schema and an empty, valid
                    GeoPackage.
                </span>
            </button>
            <button
                type="button"
                class="group rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-foreground/25 hover:bg-accent/30"
                onclick={() => (source = "import")}
            >
                <span class="flex size-10 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <FileInputIcon class="size-5" />
                </span>
                <span class="mt-4 block text-base font-semibold text-foreground">
                    Start from import
                </span>
                <span class="mt-1 block text-sm text-muted-foreground">
                    Create the project, then infer its first table from CSV or
                    GeoJSON.
                </span>
            </button>
        </div>
    {:else}
        <button
            type="button"
            class="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            onclick={() => (source = null)}
        >
            <ArrowLeftIcon class="size-4" />
            Change starting point
        </button>
        <div class="rounded-xl border border-border bg-card">
            {#if source === "template"}
                <div class="border-b border-border p-5 sm:p-6">
                    <label class="flex flex-col gap-1.5 text-sm">
                        <span class="font-medium text-foreground">Template</span>
                        <select
                            class="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                            bind:value={template}
                        >
                            <option value="mola-scr">
                                MOLA single-context recording
                            </option>
                        </select>
                        <span class="text-xs text-muted-foreground">
                            Contexts, finds, samples, relations, and QField-ready
                            geometry fields.
                        </span>
                    </label>
                </div>
            {/if}
            <div class="p-5 sm:p-6">
                <CreateProjectStep
                    {accessToken}
                    {org}
                    {qfieldAccounts}
					{managedQField}
                    {source}
                    template={source === "template" ? template : ""}
                    onCreated={finish}
                />
            </div>
        </div>
    {/if}
</article>
