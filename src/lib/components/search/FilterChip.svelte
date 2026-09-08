<script lang="ts">
    import XIcon from "@lucide/svelte/icons/x";
    import type { Snippet } from "svelte";

    type Props = {
        /** Static prefix — column name, `#`, or a place label. */
        label?: string;
        value: string;
        /** Shown when idle; `value` is what the input starts with. */
        display?: string;
        title?: string;
        class?: string;
        children?: Snippet;
        /** Return `false` to keep the input open (invalid value). */
        onCommit: (next: string) => boolean | void;
        onRemove: () => void;
    };

    let {
        label = "",
        value,
        display,
        title = "Edit filter",
        class: klass = "",
        children,
        onCommit,
        onRemove,
    }: Props = $props();

    let editing = $state(false);
    let draft = $state("");
    let inputEl = $state<HTMLInputElement | null>(null);

    function startEdit() {
        draft = value;
        editing = true;
        queueMicrotask(() => {
            inputEl?.focus();
            inputEl?.select();
        });
    }

    function commit() {
        if (!editing) return;
        const ok = onCommit(draft);
        if (ok === false) {
            queueMicrotask(() => inputEl?.focus());
            return;
        }
        editing = false;
    }

    function cancel() {
        draft = value;
        editing = false;
    }

    function onKey(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            commit();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            cancel();
        }
    }
</script>

<div class={klass} title={editing ? undefined : `${title} — click to edit`}>
    {#if editing}
        {@render children?.()}
        {#if label}
            <span class="max-w-[8rem] shrink-0 truncate text-muted-foreground"
                >{label}</span
            >
        {/if}
        <input
            bind:this={inputEl}
            bind:value={draft}
            onkeydown={onKey}
            onblur={commit}
            onmousedown={(e) => e.stopPropagation()}
            aria-label={title}
            data-chip-edit
            class="h-4 min-w-[2ch] border-0 bg-transparent p-0 text-[11px] font-medium tabular-nums text-foreground outline-none"
            style:width="{Math.max(2, draft.length + 1)}ch"
            spellcheck="false"
            autocomplete="off"
        />
    {:else}
        <button
            type="button"
            tabindex="-1"
            class="inline-flex min-w-0 flex-1 cursor-text items-center gap-1 bg-transparent p-0 text-left text-[11px] font-medium"
            onclick={startEdit}
        >
            {@render children?.()}
            {#if label}
                <span
                    class="max-w-[8rem] shrink-0 truncate text-muted-foreground"
                    >{label}</span
                >
            {/if}
            <span class="min-w-0 truncate">{display ?? value}</span>
        </button>
    {/if}
    <button
        type="button"
        tabindex="-1"
        class="shrink-0 text-muted-foreground hover:text-foreground"
        onclick={(e) => {
            e.stopPropagation();
            onRemove();
        }}
        title="Remove filter"
        aria-label="Remove filter"
    >
        <XIcon class="size-3" />
    </button>
</div>
