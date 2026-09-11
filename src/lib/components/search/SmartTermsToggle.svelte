<script lang="ts">
    import SparklesIcon from "@lucide/svelte/icons/sparkles";
    import LoaderIcon from "@lucide/svelte/icons/loader";

    type Props = {
        enabled: boolean;
        busy?: boolean;
        class?: string;
    };

    let {
        enabled = $bindable(false),
        busy = false,
        class: klass = "",
    }: Props = $props();
</script>

<button
    type="button"
    role="switch"
    aria-checked={enabled}
    aria-label="Smart terms"
    onclick={() => (enabled = !enabled)}
    class="smart-toggle {enabled ? 'is-on' : ''} {klass}"
    title={enabled
        ? "Smart terms on — interpret natural-language searches"
        : "Smart terms off — search exactly as typed"}
>
    <span class="shine" aria-hidden="true"></span>
    {#if busy}
        <LoaderIcon class="relative z-10 size-3.5 animate-spin" />
    {:else}
        <SparklesIcon class="relative z-10 size-3.5" />
    {/if}
    <span class="relative z-10 whitespace-nowrap">Smart terms</span>
    <span class="track" aria-hidden="true">
        <span class="thumb"></span>
    </span>
</button>

<style>
    .smart-toggle {
        position: relative;
        display: inline-flex;
        height: 2rem;
        align-items: center;
        gap: 0.375rem;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 9999px;
        background: color-mix(in oklab, var(--muted) 72%, transparent);
        padding: 0 0.4rem 0 0.65rem;
        color: var(--muted-foreground);
        font-size: 0.6875rem;
        font-weight: 650;
        transition: color 180ms ease, border-color 180ms ease, transform 180ms ease,
            background 180ms ease, box-shadow 180ms ease;
    }
    .smart-toggle:hover { color: var(--foreground); }
    .smart-toggle:active { transform: scale(0.98); }
    .smart-toggle.is-on {
        border-color: color-mix(in oklab, #8b5cf6 72%, white 10%);
        background: linear-gradient(105deg, #4568e9 0%, #7658ec 54%, #9659ea 100%);
        color: white;
        box-shadow: 0 4px 14px color-mix(in oklab, #7658ec 30%, transparent),
            inset 0 1px 0 rgba(255, 255, 255, 0.32);
    }
    .shine {
        position: absolute;
        inset: 0;
        transform: translateX(-120%);
        background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.28) 48%, transparent 66%);
        pointer-events: none;
    }
    .is-on .shine { animation: smart-shine 3.8s ease-in-out infinite; }
    .track {
        position: relative;
        z-index: 10;
        width: 1.85rem;
        height: 1.1rem;
        flex: none;
        border-radius: 9999px;
        background: color-mix(in oklab, var(--foreground) 13%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 12%, transparent);
    }
    .is-on .track {
        background: rgba(54, 31, 135, 0.25);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.28);
    }
    .thumb {
        position: absolute;
        top: 0.15rem;
        left: 0.15rem;
        width: 0.8rem;
        height: 0.8rem;
        border-radius: 9999px;
        background: currentColor;
        box-shadow: 0 1px 3px rgba(0,0,0,.25);
        transition: transform 200ms cubic-bezier(.2,.8,.2,1);
    }
    .is-on .thumb { transform: translateX(0.75rem); }
    @keyframes smart-shine {
        0%, 58% { transform: translateX(-120%); }
        82%, 100% { transform: translateX(120%); }
    }
    @media (prefers-reduced-motion: reduce) {
        .smart-toggle, .thumb { transition-duration: 1ms; }
        .is-on .shine { animation: none; }
    }
</style>
