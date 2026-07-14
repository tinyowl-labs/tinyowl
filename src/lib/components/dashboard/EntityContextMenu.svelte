<script lang="ts">
    import CrosshairIcon from "@lucide/svelte/icons/crosshair";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import EyeOffIcon from "@lucide/svelte/icons/eye-off";
    import XIcon from "@lucide/svelte/icons/x";

    type Props = {
        open?: boolean;
        x?: number;
        y?: number;
        layerName?: string;
        entityId?: string;
        /** Total selected count (for multi block). */
        selectionCount?: number;
        /** Whether the context target is in the current multi-selection. */
        targetInSelection?: boolean;
        onFlyTo?: () => void;
        onCopyId?: () => void;
        onHide?: () => void;
        onHideAll?: () => void;
        onClear?: () => void;
        onClose?: () => void;
    };

    let {
        open = false,
        x = 0,
        y = 0,
        layerName = "",
        entityId = "",
        selectionCount = 0,
        targetInSelection = false,
        onFlyTo,
        onCopyId,
        onHide,
        onHideAll,
        onClear,
        onClose,
    }: Props = $props();

    let rootEl = $state<HTMLDivElement>();
    let copied = $state(false);

    const showMulti = $derived(
        selectionCount > 1 && targetInSelection,
    );

    $effect(() => {
        if (!open) {
            copied = false;
            return;
        }
        const onDoc = (ev: MouseEvent) => {
            if (rootEl && !rootEl.contains(ev.target as Node)) onClose?.();
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === "Escape") onClose?.();
        };
        const t = setTimeout(() => {
            document.addEventListener("mousedown", onDoc);
            document.addEventListener("keydown", onKey);
        }, 0);
        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        };
    });

    async function copyId() {
        if (!entityId) return;
        try {
            await navigator.clipboard.writeText(entityId);
            copied = true;
            onCopyId?.();
            setTimeout(() => onClose?.(), 450);
        } catch {
            onCopyId?.();
        }
    }

    const itemCls =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary";
</script>

{#if open}
    <div
        bind:this={rootEl}
        class="pointer-events-auto fixed z-10000 w-52 overflow-hidden rounded-lg border border-border bg-background/98 shadow-lg backdrop-blur-sm"
        style="left: {x}px; top: {y}px"
        role="menu"
    >
        <div class="border-b border-border px-2.5 py-1.5">
            <div class="truncate text-[11px] font-medium text-foreground">
                {layerName.replace(/_/g, " ") || "Entity"}
            </div>
            <div class="truncate font-mono text-[10px] text-muted-foreground">
                {entityId}
            </div>
        </div>
        {#if showMulti}
            <div
                class="border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"
            >
                {selectionCount} selected
            </div>
        {/if}
        <div class="flex flex-col gap-0.5 p-1">
            <button
                type="button"
                class={itemCls}
                role="menuitem"
                onclick={() => {
                    onFlyTo?.();
                    onClose?.();
                }}
            >
                <CrosshairIcon class="size-3.5 shrink-0 text-muted-foreground" />
                Fly to
            </button>
            <button
                type="button"
                class={itemCls}
                role="menuitem"
                onclick={() => void copyId()}
            >
                <CopyIcon class="size-3.5 shrink-0 text-muted-foreground" />
                {copied ? "Copied" : "Copy ID"}
            </button>
            {#if onHide}
                <button
                    type="button"
                    class={itemCls}
                    role="menuitem"
                    onclick={() => {
                        onHide();
                        onClose?.();
                    }}
                >
                    <EyeOffIcon class="size-3.5 shrink-0 text-muted-foreground" />
                    Hide
                </button>
            {/if}
            {#if showMulti && onHideAll}
                <button
                    type="button"
                    class={itemCls}
                    role="menuitem"
                    onclick={() => {
                        onHideAll();
                        onClose?.();
                    }}
                >
                    <EyeOffIcon class="size-3.5 shrink-0 text-muted-foreground" />
                    Hide all
                </button>
            {/if}
            {#if onClear}
                <button
                    type="button"
                    class="{itemCls} text-muted-foreground"
                    role="menuitem"
                    onclick={() => {
                        onClear();
                        onClose?.();
                    }}
                >
                    <XIcon class="size-3.5 shrink-0" />
                    {showMulti ? "Deselect all" : "Clear selection"}
                </button>
            {/if}
        </div>
    </div>
{/if}
