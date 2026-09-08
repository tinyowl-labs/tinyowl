<script lang="ts">
    import { onDestroy } from "svelte";
    import type { Snippet } from "svelte";
    import InfoIcon from "@lucide/svelte/icons/info";
    import * as Popover from "$lib/components/ui/popover/index.js";
    import { cn } from "$lib/utils.js";
    import { inspectTerm, type TermInspectDoc } from "$lib/search/terms";
    import TermInspectPane from "./TermInspectPane.svelte";

    type Props = {
        uri: string;
        label?: string;
        title?: string;
        class?: string;
        align?: "start" | "center" | "end";
        children?: Snippet;
        allowMatch?: boolean;
        matchClose?: boolean;
        matchNarrower?: boolean;
        onMatchChange?: (next: { close: boolean; narrower: boolean }) => void;
        onOpen?: (uri: string) => void;
    };

    let {
        uri,
        label,
        title = "Inspect term",
        class: klass = "",
        align = "end",
        children,
        allowMatch = false,
        matchClose = false,
        matchNarrower = false,
        onMatchChange,
        onOpen,
    }: Props = $props();

    let open = $state(false);
    let loading = $state(false);
    let empty = $state<string | null>(null);
    let doc = $state.raw<TermInspectDoc | null>(null);
    let abort: AbortController | null = null;
    let requestId = 0;

    const triggerClass = $derived(
        children
            ? cn("inline-flex min-w-0 items-center gap-1", klass)
            : cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                  klass,
              ),
    );

    const accessibleName = $derived(label ?? title);

    function abortPending() {
        abort?.abort();
        abort = null;
    }

    async function loadInspect() {
        abortPending();
        const ac = new AbortController();
        abort = ac;
        const id = ++requestId;
        const requested = uri;
        loading = true;
        doc = null;
        empty = null;
        try {
            const result = await inspectTerm(requested, { signal: ac.signal });
            if (id !== requestId || requested !== uri) return;
            if (result) {
                doc = result;
                empty = null;
            } else {
                doc = null;
                empty = "Not in the catalog yet";
            }
        } catch (err) {
            if (id !== requestId || requested !== uri) return;
            if (err instanceof DOMException && err.name === "AbortError") return;
            doc = null;
            empty = "Not in the catalog yet";
        } finally {
            if (id === requestId) loading = false;
        }
    }

    function handleOpenChange(next: boolean) {
        open = next;
        if (next) {
            onOpen?.(uri);
            void loadInspect();
        } else {
            requestId += 1;
            abortPending();
            loading = false;
        }
    }

    function stopApply(e: Event) {
        e.stopPropagation();
    }

    function keepMenu(e: Event) {
        e.preventDefault();
        e.stopPropagation();
    }

    onDestroy(() => {
        requestId += 1;
        abortPending();
    });
</script>

<Popover.Root {open} onOpenChange={handleOpenChange}>
    <Popover.Trigger
        type="button"
        class={triggerClass}
        title={title}
        aria-label={accessibleName}
        onmousedown={keepMenu}
        onclick={stopApply}
    >
        {#if children}
            {@render children()}
        {:else}
            <InfoIcon class="size-3.5" />
        {/if}
    </Popover.Trigger>
    <Popover.Content
        {align}
        class="w-80 max-w-[min(20rem,calc(100vw-2rem))] max-h-80 overflow-y-auto p-3"
        onOpenAutoFocus={keepMenu}
        onCloseAutoFocus={stopApply}
        onmousedown={stopApply}
        onclick={stopApply}
    >
        <TermInspectPane
            {doc}
            {loading}
            {empty}
            {allowMatch}
            {matchClose}
            {matchNarrower}
            {onMatchChange}
        />
    </Popover.Content>
</Popover.Root>
