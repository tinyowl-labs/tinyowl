<script lang="ts">
    import type { CreditLink } from "$lib/components/cesiumProviders";

    type Props = {
        class?: string;
        credits?: CreditLink[];
        /** When World Terrain / Ion imagery is in use. */
        ion?: boolean;
    };

    let { class: klass = "", credits = [], ion = false }: Props = $props();

    const shown = $derived.by(() => {
        const out: CreditLink[] = [];
        const seen = new Set<string>();
        for (const c of credits) {
            if (seen.has(c.label)) continue;
            seen.add(c.label);
            out.push(c);
        }
        if (ion && !seen.has("Ion")) {
            out.push({ label: "Ion", href: "https://cesium.com/ion/" });
        }
        return out;
    });
</script>

<div
    class="surface pointer-events-auto flex max-w-[11rem] flex-wrap items-center gap-x-1 gap-y-0 rounded px-1 py-0.5 text-[9px] leading-tight text-muted-foreground {klass}"
>
    {#each shown as c, i}
        {#if i > 0}
            <span class="opacity-40">·</span>
        {/if}
        {#if c.href}
            <a
                class="hover:text-foreground hover:underline"
                href={c.href}
                target="_blank"
                rel="noopener noreferrer">{c.label}</a
            >
        {:else}
            <span>{c.label}</span>
        {/if}
    {/each}
    {#if shown.length > 0}
        <span class="opacity-40">·</span>
    {/if}
    <a
        class="inline-flex items-center hover:opacity-90"
        href="https://cesium.com/"
        target="_blank"
        rel="noopener noreferrer"
        title="Cesium"
        aria-label="Cesium"
    >
        <img
            src="/brand/cesium-icon.svg"
            alt=""
            width="14"
            height="14"
            class="size-3.5"
            draggable="false"
        />
    </a>
</div>
