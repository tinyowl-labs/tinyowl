<script lang="ts">
	import { Dialog } from "bits-ui";
	import { afterNavigate } from "$app/navigation";
	import { page } from "$app/stores";
	import { onMount } from "svelte";
	import XIcon from "@lucide/svelte/icons/x";
	import SearchComposer from "$lib/components/SearchComposer.svelte";
	import {
		isSearchModK,
		searchOverlay,
	} from "$lib/stores/searchOverlay.svelte";

	let isMac = $state(false);

	const accessToken = $derived(
		(($page.data as { accessToken?: string | null } | undefined)
			?.accessToken ?? null) as string | null,
	);

	onMount(() => {
		isMac = /Mac|iPhone|iPad|iPod/i.test(
			navigator.platform || navigator.userAgent,
		);

		const onKey = (e: KeyboardEvent) => {
			if (!isSearchModK(e)) return;
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
			class="fixed left-1/2 top-[12vh] z-[2001] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-visible rounded-xl border border-border bg-background p-2 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
			onEscapeKeydown={(e) => {
				if (document.getElementById("search-overlay-list")) {
					e.preventDefault();
				}
			}}
		>
			<Dialog.Title class="sr-only">Search</Dialog.Title>
			<Dialog.Description class="sr-only">
				Search projects and places. Escape closes. Tab completes a suggestion
				when the search field is focused.
			</Dialog.Description>
			<div class="flex items-start gap-1">
				<div class="min-w-0 flex-1">
					{#if searchOverlay.open}
						<SearchComposer
							accessToken={accessToken}
							autofocus
							listboxId="search-overlay-list"
							placeholder="Search projects or places…  Type @ for filters"
						/>
					{/if}
				</div>
				<Dialog.Close
					class="mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label="Close search"
				>
					<XIcon class="size-4" />
				</Dialog.Close>
			</div>
			<p class="px-2 pb-1 pt-1.5 text-[10px] text-muted-foreground">
				<kbd
					class="rounded border border-border bg-background/80 px-1 py-0.5 font-sans"
					>{isMac ? "⌘" : "Ctrl"}</kbd
				>
				<kbd
					class="rounded border border-border bg-background/80 px-1 py-0.5 font-sans"
					>K</kbd
				>
				toggles · Esc closes
			</p>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
