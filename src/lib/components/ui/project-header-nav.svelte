<script lang="ts">
	import { page } from "$app/stores";
	import type { Component } from "svelte";
	import GaugeIcon from "@lucide/svelte/icons/gauge";
	import ArchiveIcon from "@lucide/svelte/icons/archive";
	import MapIcon from "@lucide/svelte/icons/map";
	import TableIcon from "@lucide/svelte/icons/table";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import FileUpIcon from "@lucide/svelte/icons/file-up";
	import GitPullRequestIcon from "@lucide/svelte/icons/git-pull-request";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import WaypointsIcon from "@lucide/svelte/icons/waypoints";
	import { buttonVariants } from "$lib/components/ui/button/button.svelte";
	import { cn } from "$lib/utils.js";

	type NavItem = {
		label: string;
		href: string;
		icon: Component;
	};

	type NavGroup = {
		label: string;
		items: NavItem[];
	};

	const slug = $derived(
		($page.params as { project?: string }).project ?? "",
	);
	const project = $derived(
		(
			$page.data as {
				project?: { title?: string; gpkg_uri?: string | null };
			}
		)?.project,
	);
	const role = $derived(
		(($page.data as { role?: string } | undefined)?.role as string) ??
			"viewer",
	);
	const isMember = $derived(
		Boolean(($page.data as { isMember?: boolean } | undefined)?.isMember),
	);
	const canManage = $derived(role === "owner" || role === "admin");
	const canWrite = $derived(
		role === "owner" || role === "admin" || role === "collaborator",
	);
	const gpkgUri = $derived(project?.gpkg_uri ?? null);
	const projectRoot = $derived(`/${encodeURIComponent(slug)}`);

	const navGroups = $derived.by((): NavGroup[] => {
		if (!slug) return [];
		const groups: NavGroup[] = [
			{
				label: "Data",
				items: [
					{
						label: "Map",
						href: `${projectRoot}/layers?view=map`,
						icon: MapIcon,
					},
					{
						label: "Tables",
						href: `${projectRoot}/layers?view=table`,
						icon: TableIcon,
					},
					{
						label: "Artefacts",
						href: `${projectRoot}/artefacts`,
						icon: ArchiveIcon,
					},
					...(canWrite
						? [
								{
									label: "Import",
								href: `${projectRoot}/import`,
									icon: FileUpIcon,
								},
							]
						: []),
					...(isMember
						? [
								{
									label: "History",
								href: `${projectRoot}/history`,
									icon: HistoryIcon,
								},
							]
						: []),
					...(gpkgUri
						? [
								{
									label: "GeoPackage",
									href: gpkgUri,
									icon: DownloadIcon,
								},
							]
						: []),
				],
			},
		];
		if (canWrite) {
			groups.push({
				label: "Manage",
				items: [
					{
						label: "Manage",
						href: `${projectRoot}/dashboard`,
						icon: GaugeIcon,
					},
					{
						label: "Review",
						href: `${projectRoot}/review`,
						icon: GitPullRequestIcon,
					},
					{
						label: "Mappings",
						href: `${projectRoot}/mappings`,
						icon: WaypointsIcon,
					},
				],
			});
		}
		return groups;
	});

	const settingsHref = $derived(canManage ? `${projectRoot}/settings` : "");

	function isActive(href: string) {
		const slugRoot = projectRoot;
		const q = href.indexOf("?");
		const hrefPath = q >= 0 ? href.slice(0, q) : href;
		const hrefSearch = q >= 0 ? href.slice(q + 1) : "";
		const path = $page.url.pathname;

		if (hrefPath === slugRoot) return path === hrefPath;
		if (path !== hrefPath) return path.startsWith(hrefPath + "/");

		if (hrefPath === `${slugRoot}/layers`) {
			const want = new URLSearchParams(hrefSearch).get("view");
			const cur = $page.url.searchParams.get("view") ?? "";
			const onMap = cur === "map" || cur === "3d" || cur === "";
			if (want === "map") return onMap;
			if (want === "table") return cur === "table" || cur === "schema";
			if (!want) return onMap;
			return cur === want;
		}
		return true;
	}

	function isGroupActive(group: NavGroup) {
		return group.items.some((item) => isActive(item.href));
	}

	function navTriggerClass(active: boolean) {
		return cn(
			buttonVariants({ variant: "ghost", size: "sm" }),
			"gap-1 text-xs font-medium no-underline",
			active ? "selected" : "text-muted-foreground",
		);
	}

	function navItemClass(active: boolean) {
		return cn(
			"relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs no-underline outline-none select-none [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
			active
				? "selected"
				: "text-foreground hover:bg-muted hover:text-foreground",
		);
	}
</script>

<nav class="ml-1 hidden items-center gap-1.5 md:flex" aria-label="Project">
	{#each navGroups as group (group.label)}
		{#if group.items.length === 1}
			<a
				href={group.items[0].href}
				class={navTriggerClass(isActive(group.items[0].href))}
				aria-current={isActive(group.items[0].href) ? "page" : undefined}
			>
				{group.items[0].label}
			</a>
		{:else}
			<div class="group/navitem relative">
				<a
					href={group.items[0].href}
					class={navTriggerClass(isGroupActive(group))}
					aria-haspopup="menu"
					aria-current={isGroupActive(group) ? "true" : undefined}
				>
					{group.label}
					<ChevronDownIcon class="size-3 opacity-60" />
				</a>
				<div
					role="menu"
					class="invisible absolute left-0 top-full z-50 min-w-44 pt-2 opacity-0 pointer-events-none group-hover/navitem:visible group-hover/navitem:opacity-100 group-hover/navitem:pointer-events-auto group-focus-within/navitem:visible group-focus-within/navitem:opacity-100 group-focus-within/navitem:pointer-events-auto"
				>
					<div
						class="surface rounded-md border border-border p-1 text-foreground shadow-md"
					>
						{#each group.items as item (item.href)}
							<a
								href={item.href}
								role="menuitem"
								class={navItemClass(isActive(item.href))}
							>
								<item.icon />
								{item.label}
							</a>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	{/each}
	{#if settingsHref}
		<a
			href={settingsHref}
			class={navTriggerClass(isActive(settingsHref))}
			aria-current={isActive(settingsHref) ? "page" : undefined}
		>
			Settings
		</a>
	{/if}
</nav>
