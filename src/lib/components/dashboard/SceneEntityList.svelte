<script lang="ts" generics="T extends { key: string }">
    import { tick, type Snippet } from "svelte";
    let { items, children, class: klass = "" }: { items: T[]; children: Snippet<[T]>; class?: string } = $props();
    const rowHeight = 28;
    const maxHeight = 208;
    const overscan = 4;
    let scroller: HTMLDivElement;
    let scrollTop = $state(0);
    const height = $derived(Math.min(maxHeight, items.length * rowHeight));
    const start = $derived(Math.max(0, Math.min(Math.floor(scrollTop / rowHeight) - overscan, Math.max(0, items.length - 1))));
    const end = $derived(Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan));
    $effect(() => {
        const max = Math.max(0, items.length * rowHeight - height);
        if (scrollTop > max) { scrollTop = max; if (scroller) scroller.scrollTop = max; }
    });
    $effect(() => {
        if (!scroller) return;
        scroller.addEventListener("keydown", moveFocus);
        return () => scroller.removeEventListener("keydown", moveFocus);
    });
    async function moveFocus(event: KeyboardEvent) {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-scene-row]');
        if (!row) return;
        const index = Number(row.dataset.sceneRow);
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + (event.key === 'ArrowDown' ? 1 : -1);
        if (target < 0 || target >= items.length) return;
        event.preventDefault();
        const buttons = [...row.querySelectorAll('button')];
        const buttonIndex = Math.max(0, buttons.indexOf(event.target as HTMLButtonElement));
        scroller.scrollTop = Math.max(0, Math.min(target * rowHeight, items.length * rowHeight - height));
        scrollTop = scroller.scrollTop;
        await tick();
        scroller.querySelectorAll<HTMLButtonElement>(`[data-scene-row="${target}"] button`)[buttonIndex]?.focus({ preventScroll: true });
    }
</script>

<div bind:this={scroller} class="overflow-y-auto {klass}" style:height="{height}px" onscroll={() => scrollTop = scroller.scrollTop} role="list" aria-label="Layer records">
    <div style:height="{start * rowHeight}px" aria-hidden="true"></div>
    {#each items.slice(start, end) as item, offset (item.key)}
        <div data-scene-row={start + offset} role="listitem" aria-setsize={items.length} aria-posinset={start + offset + 1} style:height="{rowHeight}px">
            {@render children(item)}
        </div>
    {/each}
    <div style:height="{(items.length - end) * rowHeight}px" aria-hidden="true"></div>
</div>
