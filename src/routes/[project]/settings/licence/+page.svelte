<script lang="ts">
    import { enhance } from "$app/forms";
    import CheckIcon from "@lucide/svelte/icons/check";
    import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
    import { LICENCES } from "$lib/project/licences";

    let { data, form: rawForm } = $props();
    const form = $derived(rawForm as any);

    const projectTitle = $derived(data?.project?.title ?? "Project");
    const currentLicence = $derived((data?.project as any)?.licence ?? "");
</script>

<svelte:head>
    <title>Licence — {projectTitle} — echidna</title>
</svelte:head>

<section>
    <h2 class="text-sm font-medium text-foreground mb-1">Licence</h2>
    <p class="text-sm text-muted-foreground mb-4">
        How others may use and share this project’s data.
    </p>
    {#if form?.error}
        <p
            class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
            {form.error}
        </p>
    {/if}

    <div class="rounded-lg border border-border divide-y divide-border">
        {#each LICENCES as lic}
            <form method="POST" action="?/updateLicence" use:enhance>
                <input type="hidden" name="licence" value={lic.key} />
                <button
                    type="submit"
                    class="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/40 transition-colors {currentLicence ===
                    lic.key
                        ? 'bg-secondary/50'
                        : ''}"
                >
                    <span
                        class="flex size-4 shrink-0 items-center justify-center rounded-full border {currentLicence ===
                        lic.key
                            ? 'border-primary bg-primary'
                            : 'border-border'}"
                    >
                        {#if currentLicence === lic.key}
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
                            class="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                            title="View licence"
                            onclick={(e) => e.stopPropagation()}
                        >
                            <ExternalLinkIcon class="size-3.5" />
                        </a>
                    {/if}
                </button>
            </form>
        {/each}
    </div>
</section>
