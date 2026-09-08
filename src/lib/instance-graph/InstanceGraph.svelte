<script lang="ts">
	import { untrack } from "svelte";
	import MaximizeIcon from "@lucide/svelte/icons/maximize-2";
	import MinimizeIcon from "@lucide/svelte/icons/minimize-2";
	import MinusIcon from "@lucide/svelte/icons/minus";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import ScanIcon from "@lucide/svelte/icons/scan";
	import XIcon from "@lucide/svelte/icons/x";
	import {
		layerSelection,
		toSelectionKey,
	} from "$lib/stores/layerSelection.svelte";
	import type { SchemaFieldEdge, SchemaTableKind } from "$lib/project/schemaFields";
	import {
		ORGANIZE_TOPO,
		buildInstanceGraph,
		columnNames,
		distinctColumnValues,
		edgePath,
		layoutInstanceGraph,
		nodeKey,
		nodeTables,
		orderedColumns,
		relationshipOptions,
		type EntityRelation,
		type GraphBindings,
	} from "./instanceGraph";

	type Props = {
		slug: string;
		accessToken?: string;
		schemaTables?: SchemaTableKind[];
		schemaEdges?: SchemaFieldEdge[];
		rows?: Record<string, Record<string, unknown>[]>;
		fullscreen?: boolean;
		onToggleFullscreen?: () => void;
		onClose?: () => void;
	};

	let {
		slug,
		accessToken = "",
		schemaTables = [],
		schemaEdges = [],
		rows = {},
		fullscreen = false,
		onToggleFullscreen,
		onClose,
	}: Props = $props();

	let tablePick = $state("");
	let relationshipPick = $state("");
	let organizePick = $state("");
	let groupPick = $state("");
	let filterColPick = $state("");
	let filterValPick = $state("");
	let relations = $state<EntityRelation[]>([]);
	let relationsError = $state("");
	let relationsLoading = $state(false);

	let host = $state<HTMLDivElement | undefined>();
	let viewX = $state(0);
	let viewY = $state(0);
	let viewScale = $state(1);
	let panning = $state(false);
	let panStart = $state<{ x: number; y: number; vx: number; vy: number } | null>(
		null,
	);

	const tables = $derived(nodeTables(schemaTables, Object.keys(rows)));
	const table = $derived(
		tables.some((t) => t.name === tablePick)
			? tablePick
			: (tables[0]?.name ?? ""),
	);
	const tableMeta = $derived(tables.find((t) => t.name === table));
	const cols = $derived(columnNames(tableMeta, rows[table]));
	const ordered = $derived(orderedColumns(rows[table], cols));
	const relOptions = $derived(
		relationshipOptions({
			table,
			schemaTables,
			schemaEdges,
			relations,
		}),
	);
	const relationship = $derived(
		relOptions.some((o) => o.id === relationshipPick) ? relationshipPick : "",
	);
	const organizeBy = $derived.by(() => {
		const pick = organizePick;
		if (pick === ORGANIZE_TOPO) {
			return relationship ? ORGANIZE_TOPO : (ordered[0] ?? "");
		}
		if (pick === "") {
			return relationship ? ORGANIZE_TOPO : (ordered[0] ?? "");
		}
		if (ordered.includes(pick) || cols.includes(pick)) return pick;
		return relationship ? ORGANIZE_TOPO : (ordered[0] ?? "");
	});
	const groupBy = $derived(cols.includes(groupPick) ? groupPick : "");
	const filterBy = $derived(cols.includes(filterColPick) ? filterColPick : "");
	const filterVals = $derived(distinctColumnValues(rows[table], filterBy));
	const filterValue = $derived(
		filterVals.includes(filterValPick) ? filterValPick : "",
	);

	$effect(() => {
		if (tablePick) return;
		const first = tables[0]?.name ?? "";
		if (first) tablePick = first;
	});

	const bindings: GraphBindings = $derived({
		table,
		relationship,
		organizeBy,
		groupBy,
		filterBy,
		filterValue,
	});

	const built = $derived(
		buildInstanceGraph({
			bindings,
			schemaTables,
			schemaEdges,
			rowsByTable: rows,
			relations,
		}),
	);

	const layout = $derived(
		layoutInstanceGraph(built.nodes, built.edges, {
			organizeBy,
			groupBy,
		}),
	);

	const selectedKey = $derived(layerSelection.primaryKey ?? "");
	const selectedSet = $derived(layerSelection.selected);

	const fieldCls =
		"h-7 min-w-0 max-w-[11rem] rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground";

	async function loadRelations() {
		if (!slug) return;
		relationsLoading = true;
		relationsError = "";
		try {
			const headers: Record<string, string> = {};
			if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
			const res = await fetch(
				`/api/v1/projects/${encodeURIComponent(slug)}/relations?limit=10000`,
				{ headers },
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { relations?: EntityRelation[] };
			relations = body.relations ?? [];
		} catch (e) {
			relationsError = e instanceof Error ? e.message : "relations failed";
			relations = [];
		} finally {
			relationsLoading = false;
		}
	}

	$effect(() => {
		slug;
		accessToken;
		void loadRelations();
	});

	function fitToView() {
		const el = host;
		if (!el) return;
		const availW = Math.max(40, el.clientWidth);
		const availH = Math.max(40, el.clientHeight - 40);
		const s = Math.min(availW / layout.width, availH / layout.height, 1.5);
		viewScale = Math.max(0.15, s);
		viewX = (availW - layout.width * viewScale) / 2;
		viewY = (availH - layout.height * viewScale) / 2 + 4;
	}

	$effect(() => {
		host;
		layout.width;
		layout.height;
		untrack(() => fitToView());
	});

	$effect(() => {
		const key = selectedKey;
		const nodes = layout.nodes;
		untrack(() => {
			if (!key || !host) return;
			const n = nodes.find((node) => nodeKey(node.table, node.id) === key);
			if (!n) return;
			const cx = n.x * viewScale + viewX;
			const cy = n.y * viewScale + viewY;
			const w = host.clientWidth;
			const h = host.clientHeight;
			const pad = 48;
			let nx = viewX;
			let ny = viewY;
			if (cx < pad) nx += pad - cx;
			else if (cx > w - pad) nx -= cx - (w - pad);
			if (cy < pad + 36) ny += pad + 36 - cy;
			else if (cy > h - pad) ny -= cy - (h - pad);
			viewX = nx;
			viewY = ny;
		});
	});

	function zoomAt(clientX: number, clientY: number, factor: number) {
		if (!host) return;
		const rect = host.getBoundingClientRect();
		const mx = clientX - rect.left;
		const my = clientY - rect.top;
		const next = Math.min(5, Math.max(0.15, viewScale * factor));
		const gx = (mx - viewX) / viewScale;
		const gy = (my - viewY) / viewScale;
		viewScale = next;
		viewX = mx - gx * next;
		viewY = my - gy * next;
	}

	function canvasAttach(node: HTMLDivElement) {
		host = node;
		function onWheel(ev: WheelEvent) {
			ev.preventDefault();
			zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
		}
		node.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			host = undefined;
			node.removeEventListener("wheel", onWheel);
		};
	}

	function onPointerDown(ev: PointerEvent) {
		if (ev.button !== 0) return;
		const t = ev.target as HTMLElement | null;
		if (t?.closest("[data-node]")) return;
		panning = true;
		panStart = { x: ev.clientX, y: ev.clientY, vx: viewX, vy: viewY };
		(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
	}

	function onPointerMove(ev: PointerEvent) {
		if (!panning || !panStart) return;
		viewX = panStart.vx + (ev.clientX - panStart.x);
		viewY = panStart.vy + (ev.clientY - panStart.y);
	}

	function onPointerUp(ev: PointerEvent) {
		if (!panning) return;
		panning = false;
		panStart = null;
		try {
			(ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
		} catch {
			/* ignore */
		}
	}

	function selectNode(tableName: string, id: string, ev: MouseEvent) {
		ev.stopPropagation();
		if (ev.ctrlKey || ev.metaKey) {
			layerSelection.toggleSelection(tableName, id);
			return;
		}
		layerSelection.selectSingle(tableName, id);
	}

	function isSelected(tableName: string, id: string): boolean {
		return selectedSet.has(toSelectionKey(tableName, id));
	}

	const railBtn =
		"flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground";
</script>

<div
	class="surface flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border shadow-lg"
>
	<div
		class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5"
	>
		<span
			class="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
			>Graph</span
		>
		<select class={fieldCls} bind:value={tablePick} aria-label="Table">
			{#if tables.length === 0}
				<option value="">No tables</option>
			{/if}
			{#each tables as t (t.name)}
				<option value={t.name}>{t.label || t.name}</option>
			{/each}
		</select>
		<select
			class={fieldCls}
			bind:value={relationshipPick}
			aria-label="Relationship"
		>
			<option value="">Relationship</option>
			{#each relOptions as opt (opt.id)}
				<option value={opt.id}>{opt.label}</option>
			{/each}
		</select>
		<select class={fieldCls} bind:value={organizePick} aria-label="Organize by">
			{#if relationship}
				<option value={ORGANIZE_TOPO}>Topology</option>
			{/if}
			<option value="">Organize</option>
			{#each ordered as col (col)}
				<option value={col}>{col}</option>
			{/each}
		</select>
		<select class={fieldCls} bind:value={groupPick} aria-label="Group by">
			<option value="">Group</option>
			{#each cols as col (col)}
				<option value={col}>{col}</option>
			{/each}
		</select>
		<select class={fieldCls} bind:value={filterColPick} aria-label="Filter column">
			<option value="">Filter</option>
			{#each cols as col (col)}
				<option value={col}>{col}</option>
			{/each}
		</select>
		<select
			class={fieldCls}
			bind:value={filterValPick}
			aria-label="Filter value"
			disabled={!filterBy}
		>
			<option value="">All</option>
			{#each filterVals as val (val)}
				<option value={val}>{val}</option>
			{/each}
		</select>
		<div class="ml-auto flex shrink-0 items-center gap-0.5">
			<button
				type="button"
				class={railBtn}
				title="Fit"
				aria-label="Fit"
				onclick={fitToView}
			>
				<ScanIcon class="size-3.5" />
			</button>
			<button
				type="button"
				class={railBtn}
				title="Zoom in"
				aria-label="Zoom in"
				onclick={() => {
					viewScale = Math.min(5, viewScale * 1.2);
				}}
			>
				<PlusIcon class="size-3.5" />
			</button>
			<button
				type="button"
				class={railBtn}
				title="Zoom out"
				aria-label="Zoom out"
				onclick={() => {
					viewScale = Math.max(0.15, viewScale / 1.2);
				}}
			>
				<MinusIcon class="size-3.5" />
			</button>
			{#if onToggleFullscreen}
				<button
					type="button"
					class={railBtn}
					title={fullscreen ? "Split with map" : "Fullscreen graph"}
					aria-label={fullscreen ? "Split with map" : "Fullscreen graph"}
					onclick={() => onToggleFullscreen()}
				>
					{#if fullscreen}
						<MinimizeIcon class="size-3.5" />
					{:else}
						<MaximizeIcon class="size-3.5" />
					{/if}
				</button>
			{/if}
			{#if onClose}
				<button
					type="button"
					class={railBtn}
					title="Close graph (G)"
					aria-label="Close graph"
					onclick={() => onClose()}
				>
					<XIcon class="size-3.5" />
				</button>
			{/if}
		</div>
	</div>

	<div
		{@attach canvasAttach}
		class="relative min-h-0 flex-1 touch-none overflow-hidden bg-muted/20"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		role="application"
		aria-label="Instance graph"
	>
		{#if layout.nodes.length === 0}
			<p
				class="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted-foreground"
			>
				{#if !table}
					Pick a table to plot records.
				{:else if filterBy && filterValue}
					No {table} rows with {filterBy} = {filterValue}.
				{:else}
					No rows in {table}. Sparse graphs are valid — add records or pick
					another table.
				{/if}
			</p>
		{:else}
			<svg class="absolute inset-0 h-full w-full select-none">
				<g transform="translate({viewX},{viewY}) scale({viewScale})">
					{#each layout.bands as band (band.id)}
						<rect
							x="0"
							y={band.top}
							width={layout.width}
							height={band.bottom - band.top}
							class="fill-muted/40 stroke-border/60"
							stroke-width="1"
						/>
						<text
							x="10"
							y={band.top + 14}
							class="fill-muted-foreground text-[10px] uppercase tracking-wide"
							>{band.label}</text
						>
					{/each}
					{#each layout.edges as e (`${e.from}|${e.to}`)}
						<path
							d={edgePath(e)}
							fill="none"
							class={layout.edges.length > 80
								? "stroke-muted-foreground/35"
								: "stroke-muted-foreground/70"}
							stroke-width={layout.edges.length > 80 ? 0.9 : 1.4}
						/>
					{/each}
					{#each layout.nodes as n (nodeKey(n.table, n.id))}
						{@const sel = isSelected(n.table, n.id)}
						{@const primary =
							selectedKey === toSelectionKey(n.table, n.id)}
						<g
							data-node
							transform="translate({n.x - n.w / 2},{n.y - n.h / 2})"
							role="button"
							tabindex="0"
							aria-pressed={sel}
							onclick={(ev) => selectNode(n.table, n.id, ev)}
							onkeydown={(ev) => {
								if (ev.key === "Enter" || ev.key === " ") {
									ev.preventDefault();
									layerSelection.selectSingle(n.table, n.id);
								}
							}}
						>
							<title>{n.label}</title>
							<rect
								width={n.w}
								height={n.h}
								rx="6"
								class={primary
									? "fill-selected/25 stroke-selected"
									: sel
										? "fill-secondary stroke-foreground/50"
										: "fill-background stroke-border"}
								stroke-width={primary ? 1.6 : 1}
							/>
							<text
								x={n.w / 2}
								y={n.h / 2 + 4}
								text-anchor="middle"
								class="fill-foreground text-[11px]"
							>
								{n.label.length > 22
									? `${n.label.slice(0, 21)}…`
									: n.label}
							</text>
						</g>
					{/each}
				</g>
			</svg>
		{/if}
		{#if relationsLoading}
			<p
				class="pointer-events-none absolute bottom-2 left-2 text-[10px] text-muted-foreground"
			>
				Loading relations…
			</p>
		{:else if relationsError}
			<p
				class="pointer-events-none absolute bottom-2 left-2 text-[10px] text-muted-foreground"
			>
				_relations unavailable
			</p>
		{/if}
	</div>
</div>
