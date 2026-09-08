<script lang="ts">
	import { Dialog } from "bits-ui";
	import { afterNavigate } from "$app/navigation";
	import { page } from "$app/stores";
	import { onMount } from "svelte";
	import SearchComposer from "$lib/components/SearchComposer.svelte";
	import {
		DEFAULT_SEARCH_RADIUS,
		parseBBox,
	} from "$lib/search/params";
	import {
		isSearchModK,
		searchOverlay,
	} from "$lib/stores/searchOverlay.svelte";

	let composer = $state<{ focusField?: () => void } | null>(null);

	const routeSlug = $derived(
		($page.params as { project?: string }).project ?? null,
	);
	const pageProject = $derived(
		(
			$page.data as
				| { project?: { slug?: string; title?: string } }
				| undefined
		)?.project ?? null,
	);
	const scopeSlug = $derived(routeSlug || pageProject?.slug || null);
	const scopeTitle = $derived(
		pageProject?.title || scopeSlug || "",
	);

	const urlLayer = $derived(
		($page.url.searchParams.get("layer") ?? "").trim() || null,
	);
	const urlRows = $derived($page.url.searchParams.getAll("row"));
	const urlPlace = $derived(
		($page.url.searchParams.get("place") ?? "").trim() || null,
	);
	const urlLat = $derived.by(() => {
		const n = Number($page.url.searchParams.get("lat"));
		return Number.isFinite(n) ? n : null;
	});
	const urlLng = $derived.by(() => {
		const n = Number($page.url.searchParams.get("lng"));
		return Number.isFinite(n) ? n : null;
	});
	const urlRadius = $derived.by(() => {
		const raw = $page.url.searchParams.get("radius");
		if (raw == null || raw === "") return DEFAULT_SEARCH_RADIUS;
		const n = Number(raw);
		return Number.isFinite(n) ? n : DEFAULT_SEARCH_RADIUS;
	});
	const urlBBox = $derived(parseBBox($page.url.searchParams.get("bbox")));
	const urlTerm = $derived(
		($page.url.searchParams.get("term") ?? "").trim() || null,
	);
	const urlPeriod = $derived(
		($page.url.searchParams.get("period") ?? "").trim() || null,
	);
	const urlConcept = $derived(
		($page.url.searchParams.get("concept") ?? "").trim() || null,
	);
	const urlSubject = $derived(
		($page.url.searchParams.get("subject") ?? "").trim() || null,
	);
	const urlMatchClose = $derived(
		$page.url.searchParams
			.getAll("match")
			.some((v) => v.trim().toLowerCase() === "close"),
	);
	const urlMatchNarrower = $derived(
		$page.url.searchParams
			.getAll("match")
			.some((v) => {
				const k = v.trim().toLowerCase();
				return k === "narrower" || k === "narrow";
			}),
	);
	const urlDateFrom = $derived.by(() => {
		const n = Number($page.url.searchParams.get("date_from"));
		return Number.isFinite(n) ? n : null;
	});
	const urlDateTo = $derived.by(() => {
		const n = Number($page.url.searchParams.get("date_to"));
		return Number.isFinite(n) ? n : null;
	});
	const accessToken = $derived(
		(($page.data as { accessToken?: string | null } | undefined)
			?.accessToken ?? null) as string | null,
	);

	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!isSearchModK(e)) return;
			if (window.location.pathname.startsWith("/auth")) return;
			e.preventDefault();
			e.stopPropagation();
			searchOverlay.toggle();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	});

	afterNavigate(() => {
		searchOverlay.hide();
	});
</script>

<Dialog.Root
	open={searchOverlay.open}
	onOpenChange={(next) => {
		searchOverlay.open = next;
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-[2000] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			trapFocus
			class="fixed left-1/2 top-[12vh] z-[2001] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-visible border-0 bg-transparent p-0 shadow-none outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				requestAnimationFrame(() => composer?.focusField?.());
			}}
			onEscapeKeydown={(e) => {
				if (document.activeElement?.hasAttribute("data-chip-edit")) {
					e.preventDefault();
					return;
				}
				if (document.getElementById("search-overlay-list")) {
					e.preventDefault();
				}
			}}
		>
			<Dialog.Title class="sr-only">Search</Dialog.Title>
			<Dialog.Description class="sr-only">
				Search projects, places, and — when inside a project — layers, artefacts, and entity ids. Escape dismisses typeahead then closes. Tab completes the suggestion without searching. Enter searches, or opens the highlighted row. Type / in a project for layer, row, entity, artefact, or place filters. # chips a project tag.
			</Dialog.Description>
			{#if searchOverlay.open}
				<SearchComposer
					bind:this={composer}
					accessToken={accessToken}
					palette
					listboxId="search-overlay-list"
					projects={scopeSlug ? [scopeSlug] : []}
					projectLabels={scopeSlug && scopeTitle
						? { [scopeSlug]: scopeTitle }
						: {}}
					layers={urlLayer ? [urlLayer] : []}
					rows={urlRows}
					lat={urlLat}
					lng={urlLng}
					radius={urlRadius}
					bbox={urlBBox}
					placeLabel={urlPlace}
					termUri={urlTerm}
					periodLabel={urlPeriod}
					conceptUri={urlConcept}
					subjectLabel={urlSubject}
					matchClose={urlMatchClose}
					matchNarrower={urlMatchNarrower}
					dateFrom={urlDateFrom}
					dateTo={urlDateTo}
					placeholder={scopeSlug
						? `Search in ${scopeTitle}…  /layer · /row · @ filters · # tag`
						: "Search projects or places…  @ filters · # tag"}
				/>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
