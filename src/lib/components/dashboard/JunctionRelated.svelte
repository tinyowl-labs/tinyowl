<script lang="ts">
	import PlusIcon from "@lucide/svelte/icons/plus";
	import XIcon from "@lucide/svelte/icons/x";
	import { editBuffer } from "$lib/stores/editBuffer.svelte";
	import {
		junctionLinksForEntity,
		junctionTablesFor,
		optsFromRows,
		rowBySourceId,
		lookupLabel,
		type JunctionLink,
		type SchemaTableKind,
	} from "$lib/project/schemaFields";

	let {
		table,
		entityId,
		schemaTables = [],
		rows = {},
		onOpenRelated,
	}: {
		table: string;
		entityId: string;
		schemaTables?: SchemaTableKind[];
		rows?: Record<string, Record<string, unknown>[]>;
		onOpenRelated?: (table: string, id: string) => void;
	} = $props();

	const junctions = $derived(junctionTablesFor(table, schemaTables));
	const canonicalLinks = $derived(
		junctionLinksForEntity(table, entityId, schemaTables, rows),
	);
	const links = $derived.by(() => {
		const deleted = new Set(
			editBuffer.entries
				.filter((e) => e.op === "delete")
				.map((e) => `${e.table}:${e.entityId}`),
		);
		const extra: JunctionLink[] = [];
		for (const e of editBuffer.entries) {
			if (e.op !== "insert") continue;
			if (!junctions.some((j) => j.name === e.table)) continue;
			const from = String(e.attributes?.from_id ?? "").trim();
			const to = String(e.attributes?.to_id ?? "").trim();
			if (from !== entityId && to !== entityId) continue;
			const otherId = from === entityId ? to : from;
			const otherTable = otherTableFor(e.table, table);
			extra.push({
				table: e.table,
				entityId: e.entityId,
				otherTable,
				otherId,
				otherLabel: lookupLabel(
					rowBySourceId(rows[otherTable], otherId),
					otherId,
				),
			});
		}
		return [
			...canonicalLinks.filter(
				(l) => !deleted.has(`${l.table}:${l.entityId}`),
			),
			...extra,
		];
	});

	let addTable = $state("");
	let addOther = $state("");

	$effect(() => {
		if (!addTable && junctions[0]) addTable = junctions[0].name;
	});

	const addTarget = $derived(
		addTable ? otherTableFor(addTable, table) : "",
	);
	const addOpts = $derived(optsFromRows(rows[addTarget] ?? []));

	function otherTableFor(junctionName: string, fact: string): string {
		const prefix = `${fact}_`;
		if (junctionName.toLowerCase().startsWith(prefix.toLowerCase())) {
			const rest = junctionName.slice(prefix.length);
			if (rows[rest]) return rest;
		}
		for (const name of Object.keys(rows)) {
			if (name === fact || name === junctionName) continue;
			if (schemaTables.find((t) => t.name === name && t.kind === "lookup"))
				continue;
			return name;
		}
		return fact;
	}

	function addLink() {
		const jt = addTable.trim();
		const other = addOther.trim();
		if (!jt || !other || !entityId) return;
		editBuffer.push({
			op: "insert",
			table: jt,
			entityId: editBuffer.nextEntityId(),
			attributes: { from_id: entityId, to_id: other },
		});
		addOther = "";
	}

	function removeLink(jt: string, id: string) {
		editBuffer.markDelete(jt, id);
	}

	function otherLabel(id: string, otherTable: string): string {
		return lookupLabel(rowBySourceId(rows[otherTable], id), id);
	}
</script>

{#if junctions.length > 0 && entityId}
	<div class="space-y-1.5 border-t border-border pt-2">
		<p
			class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
		>
			Related
		</p>
		{#each links as link (link.table + ":" + link.entityId)}
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[11px] text-foreground hover:bg-secondary"
					onclick={() =>
						onOpenRelated?.(link.otherTable, link.otherId)}
				>
					{otherLabel(link.otherId, link.otherTable) || link.otherId}
					<span class="text-muted-foreground">
						· {link.table.replace(/_/g, " ")}</span
					>
				</button>
				<button
					type="button"
					class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					title="Remove link"
					onclick={() => removeLink(link.table, link.entityId)}
				>
					<XIcon class="size-3" />
				</button>
			</div>
		{:else}
			<p class="text-[11px] text-muted-foreground">No related rows</p>
		{/each}
		<div class="flex items-center gap-1">
			{#if junctions.length > 1}
				<select
					class="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-[11px]"
					value={addTable}
					onchange={(e) =>
						(addTable = (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each junctions as jt (jt.name)}
						<option value={jt.name}>{jt.label || jt.name}</option>
					{/each}
				</select>
			{/if}
			<select
				class="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-[11px]"
				value={addOther}
				onchange={(e) =>
					(addOther = (e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">Link to…</option>
				{#each addOpts as opt (opt.id)}
					<option value={opt.id}>{opt.label}</option>
				{/each}
			</select>
			<button
				type="button"
				class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
				title="Add link"
				disabled={!addOther}
				onclick={addLink}
			>
				<PlusIcon class="size-3.5" />
			</button>
		</div>
	</div>
{/if}
