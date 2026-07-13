<script lang="ts">
    import SearchIcon from "@lucide/svelte/icons/search";
    import { goto } from "$app/navigation";
    import { searchHref, type SearchBBox } from "$lib/search/params";

    type Props = {
        value?: string;
        placeholder?: string;
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
        class: klass = "",
        lat = null,
        lng = null,
        radius = null,
        bbox = null,
        dateFrom = null,
        dateTo = null,
        autofocus = false,
    }: Props = $props();

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
            }),
        );
    }
</script>

<form onsubmit={handleSubmit} class="search-vt-bar relative w-full">
    <SearchIcon
        class="absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <input
        bind:value
        {placeholder}
        {autofocus}
        type="search"
        name="q"
        autocomplete="off"
        class="w-full rounded-xl border border-border bg-background pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none shadow-sm {klass}"
    />
</form>
