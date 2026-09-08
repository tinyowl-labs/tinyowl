<script lang="ts">
	import { untrack } from "svelte";
	import { Input } from "$lib/components/ui/input/index.js";
	import type { LookupOpt } from "$lib/project/schemaFields";

	let {
		value = "",
		options,
		compact = false,
		onCommit,
		onInput,
		onCancel,
	}: {
		value?: string;
		options?: LookupOpt[];
		compact?: boolean;
		onCommit?: (value: string) => void;
		onInput?: (value: string) => void;
		onCancel?: () => void;
	} = $props();

	let local = $state(untrack(() => value));
	let lastSeed = $state(untrack(() => value));
	let skipCommit = false;

	$effect(() => {
		if (value === lastSeed) return;
		lastSeed = value;
		local = value;
		skipCommit = false;
	});

	function emit(next: string) {
		local = next;
		onInput?.(next);
	}

	function commit() {
		if (skipCommit) return;
		if (local === value) return;
		onCommit?.(local);
	}

	/** Dense chrome: cap radius so pill theme does not stadium-shape 28px fields. */
	const compactCtrl =
		"h-7 rounded-[min(var(--radius-md),6px)] border-input bg-background px-2 text-xs shadow-none";
</script>

{#if options}
	<select
		class={compact
			? `${compactCtrl} w-full min-w-[5rem] border px-1.5`
			: "h-8 w-full rounded-md border border-input bg-background px-2 text-sm"}
		value={local}
		onclick={(e) => e.stopPropagation()}
		onpointerdown={(e) => e.stopPropagation()}
		onchange={(e) => {
			const next = (e.currentTarget as HTMLSelectElement).value;
			emit(next);
			onCommit?.(next);
		}}
		onkeydown={(e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				skipCommit = true;
				local = value;
				onCancel?.();
			}
		}}
	>
		<option value="">—</option>
		{#each options as opt (opt.id)}
			<option value={opt.id}>{opt.label}</option>
		{/each}
	</select>
{:else}
	<Input
		class={compact ? compactCtrl : "h-8 text-sm"}
		value={local}
		autocomplete="off"
		onclick={(e) => e.stopPropagation()}
		onpointerdown={(e) => e.stopPropagation()}
		ondblclick={(e) => e.stopPropagation()}
		oninput={(e) => emit((e.currentTarget as HTMLInputElement).value)}
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
{/if}
