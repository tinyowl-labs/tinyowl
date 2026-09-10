<script lang="ts">
    import type { CreditLink } from "$lib/components/cesiumProviders";

    type Props = {
        class?: string;
        credits?: CreditLink[];
        /** When World Terrain / Ion imagery is in use. */
        ion?: boolean;
    };

    let { class: klass = "", credits = [], ion = false }: Props = $props();

    /** Basemap / terrain credits only — Ion is rendered with the Cesium mark. */
    const others = $derived.by(() => {
        const out: CreditLink[] = [];
        const seen = new Set<string>();
        for (const c of credits) {
            if (c.label === "Ion" || c.label === "Cesium") continue;
            if (seen.has(c.label)) continue;
            seen.add(c.label);
            out.push(c);
        }
        return out;
    });

    const showIon = $derived(
        ion || credits.some((c) => c.label === "Ion"),
    );
</script>

<div
    class="surface pointer-events-auto flex max-w-[14rem] flex-wrap items-center gap-x-1 gap-y-0 rounded px-1 py-0.5 text-[9px] leading-tight text-muted-foreground {klass}"
>
    <a
        class="inline-flex shrink-0 items-center hover:opacity-90"
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
    {#if showIon}
        <a
            class="hover:text-foreground hover:underline"
            href="https://cesium.com/ion/"
            target="_blank"
            rel="noopener noreferrer"
            title="Cesium ion"
            >Ion</a
        >
    {/if}
    {#each others as c}
        <span class="opacity-40">·</span>
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
</div>
