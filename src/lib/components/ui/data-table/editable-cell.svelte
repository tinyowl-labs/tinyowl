<script lang="ts">
    type Props = {
        value?: string;
        onCommit?: (value: string) => void;
        onCancel?: () => void;
    };

    let { value = "", onCommit, onCancel }: Props = $props();

    let local = $state(value);
    let lastSeed = value;
    let skipCommit = false;

    $effect(() => {
        if (value === lastSeed) return;
        lastSeed = value;
        local = value;
    });

    function commit() {
        if (skipCommit) return;
        if (local === value) return;
        onCommit?.(local);
    }
</script>

<input
    class="h-7 w-full min-w-[5rem] rounded-md border border-input bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
    value={local}
    autocomplete="off"
    onclick={(e) => e.stopPropagation()}
    onpointerdown={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    oninput={(e) => (local = (e.currentTarget as HTMLInputElement).value)}
    onblur={commit}
    onkeydown={(e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            skipCommit = true;
            local = value;
            onCancel?.();
        }
    }}
/>
