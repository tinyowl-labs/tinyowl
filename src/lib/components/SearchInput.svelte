<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { searchHref, type SearchBBox } from "$lib/search/params";

    type Props = {
        value?: string;
        placeholder?: string;
        /** Cycle these as placeholder when the input is empty and unfocused */
        examples?: string[];
        /** Extra classes for the input */
        class?: string;
        /** Preserve spatial/date filters when submitting from search page */
        lat?: number | null;
        lng?: number | null;
        radius?: number | null;
        bbox?: SearchBBox | null;
        dateFrom?: number | string | null;
        dateTo?: number | string | null;
        autofocus?: boolean;
    };

    let {
        value = $bindable(""),
        placeholder = "Search projects, entities, periods…",
        examples = [],
        class: klass = "",
        lat = null,
        lng = null,
        radius = null,
        bbox = null,
        dateFrom = null,
        dateTo = null,
        autofocus = false,
    }: Props = $props();

    const CYCLE_MS = 3200;
    const FADE_MS = 220;

    let focused = $state(false);
    let exampleIndex = $state(0);
    let exampleVisible = $state(true);
    let reduceMotion = $state(false);

    const cycling = $derived(examples.length > 0);
    const paused = $derived(focused || value.trim().length > 0);
    const activePlaceholder = $derived(
        cycling ? (examples[exampleIndex] ?? placeholder) : placeholder,
    );

    onMount(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const syncMotion = () => {
            reduceMotion = mq.matches;
        };
        syncMotion();
        mq.addEventListener("change", syncMotion);
        return () => mq.removeEventListener("change", syncMotion);
    });

    $effect(() => {
        if (reduceMotion || paused || examples.length < 2) return;

        let cancelled = false;
        let timeout: ReturnType<typeof setTimeout>;

        const tick = () => {
            timeout = setTimeout(async () => {
                if (cancelled) return;
                exampleVisible = false;
                await new Promise((r) => setTimeout(r, FADE_MS));
                if (cancelled) return;
                exampleIndex = (exampleIndex + 1) % examples.length;
                exampleVisible = true;
                tick();
            }, CYCLE_MS);
        };

        tick();

        return () => {
            cancelled = true;
            clearTimeout(timeout);
            exampleVisible = true;
        };
    });

    function handleSubmit(e: SubmitEvent) {
        e.preventDefault();
        goto(
            searchHref({
                q: value,
                lat,
                lng,
                radius,
                bbox,
                dateFrom,
                dateTo,
                tags: [],
                vocabularies: [],
            }),
        );
    }
</script>

<form onsubmit={handleSubmit} class="search-vt-bar relative w-full">
    <SearchIcon
        class="absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
    />
    {#if cycling && !paused}
        <span
            class="pointer-events-none absolute left-10 right-4 top-1/2 z-10 -translate-y-1/2 truncate text-sm text-muted-foreground transition-opacity duration-200 {exampleVisible
                ? 'opacity-100'
                : 'opacity-0'}"
            aria-hidden="true">{activePlaceholder}</span
        >
    {/if}
    <input
        bind:value
        placeholder={cycling && !paused ? "" : activePlaceholder}
        {autofocus}
        type="search"
        name="q"
        autocomplete="off"
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        class="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-sm {klass}"
    />
</form>
