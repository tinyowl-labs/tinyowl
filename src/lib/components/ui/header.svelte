<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import UserIcon from "@lucide/svelte/icons/user";
	import FolderKanbanIcon from "@lucide/svelte/icons/folder-kanban";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import SettingsIcon from "@lucide/svelte/icons/settings";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import PanelLeftIcon from "@lucide/svelte/icons/panel-left";
	import PanelLeftCloseIcon from "@lucide/svelte/icons/panel-left-close";
	import SearchIcon from "@lucide/svelte/icons/search";
	import InboxIcon from "@lucide/svelte/icons/inbox";
	import { cn } from "$lib/utils.js";
	import EchidnaLogo from "$lib/components/ui/echidna-logo.svelte";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import ProjectHeaderNav from "$lib/components/ui/project-header-nav.svelte";
	import { searchOverlay } from "$lib/stores/searchOverlay.svelte";
	import { headerChrome, isMapOverlayHeader } from "$lib/stores/headerChrome.svelte";
	import { currentChord, ariaKeyshortcuts, keyboardPrefs } from "$lib/shortcuts";
	import { presenceChrome } from "$lib/stores/presenceChrome.svelte";
	import PresenceDock from "$lib/components/dashboard/PresenceDock.svelte";

	const userId = $derived(
		($page.data?.user as { id?: string } | undefined)?.id ?? "",
	);
	const hasSession = $derived(Boolean(userId));
	const inboxUnread = $derived(
		Number(
			($page.data as { inboxUnread?: number } | undefined)?.inboxUnread,
		) || 0,
	);

	const projectSlug = $derived(
		($page.params as { project?: string }).project ?? "",
	);
	const orgSlug = $derived(
		($page.params as { org?: string }).org ?? "",
	);
	const path = $derived($page.url.pathname);

	const overlayMap = $derived(
		isMapOverlayHeader($page.url, projectSlug || undefined),
	);

	const subtitle = $derived.by(() => {
		const data = $page.data as {
			project?: { title?: string };
			org?: { name?: string };
			profile?: { display_name?: string };
		};
		if (projectSlug) return data.project?.title ?? projectSlug;
		if (orgSlug) return data.org?.name ?? orgSlug;
		if (path.startsWith("/users/") && data.profile?.display_name) {
			return data.profile.display_name;
		}
		if (path === "/profile" || path.startsWith("/profile/")) return "Projects";
		if (path === "/settings" || path.startsWith("/settings/")) {
			return "Settings";
		}
		if (path === "/inbox" || path.startsWith("/inbox/")) return "Inbox";
		if (path === "/orgs") return "Organisations";
		if (path === "/docs" || path.startsWith("/docs/")) return "Documentation";
		if (path === "/digitize" || path.startsWith("/digitize/")) {
			return "Digitize";
		}
		return "";
	});

	const subtitleHref = $derived.by(() => {
		if (projectSlug) return `/${projectSlug}`;
		if (orgSlug) return `/orgs/${orgSlug}`;
		return "";
	});

	const sidebar = $derived(headerChrome.sidebar);

	let isMounted = $state(false);
	let isMac = $state(false);
	onMount(() => {
		isMounted = true;
		isMac = /Mac|iPhone|iPad|iPod/i.test(
			navigator.platform || navigator.userAgent,
		);
	});

	const searchChord = $derived.by(() => {
		void keyboardPrefs.chords;
		return currentChord("search-toggle");
	});
</script>

<header
	class={cn(
		"isolate h-11 shrink-0 overflow-visible text-foreground",
		overlayMap ? "fixed top-0 inset-x-0 z-50" : "relative z-50",
	)}
>
	<div
		class="surface pointer-events-none absolute inset-0 border-b border-border"
		aria-hidden="true"
	></div>
	<div
		class="relative flex h-11 items-center justify-between overflow-visible px-4"
	>
		<div class="flex min-w-0 flex-1 items-center gap-2 overflow-visible">
			<a
				href="/"
				aria-label="echidna"
				class="inline-flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground"
			>
				<span
					class="size-6 shrink-0 inline-block [&>svg]:w-full [&>svg]:h-full"
				>
					{#if isMounted}<EchidnaLogo />{/if}
				</span>
				echidna
			</a>
			{#if sidebar}
				<button
					type="button"
					onclick={sidebar.toggle}
					class="{sidebar.toggleClass} size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
					title={sidebar.collapsed ? "Expand sidebar" : "Collapse sidebar"}
					aria-label={sidebar.collapsed
						? "Expand sidebar"
						: "Collapse sidebar"}
					aria-pressed={!sidebar.collapsed}
				>
					{#if sidebar.collapsed}
						<PanelLeftIcon class="size-4" />
					{:else}
						<PanelLeftCloseIcon class="size-4" />
					{/if}
				</button>
			{/if}
			{#if subtitle}
				<span class="h-4 w-px shrink-0 bg-border"></span>
				{#if subtitleHref}
					<a
						href={subtitleHref}
						class="min-w-0 max-w-[12rem] shrink truncate text-sm font-medium text-foreground no-underline transition-colors hover:text-foreground/70 md:max-w-[18rem] lg:max-w-[22rem]"
						title={subtitle}>{subtitle}</a
					>
				{:else}
					<span
						class="min-w-0 max-w-[12rem] shrink truncate text-sm font-medium text-foreground md:max-w-[18rem] lg:max-w-[22rem]"
						title={subtitle}>{subtitle}</span
					>
				{/if}
			{/if}
			{#if projectSlug}
				<div class="flex shrink-0 items-center overflow-visible">
					<ProjectHeaderNav />
				</div>
			{/if}
		</div>

		<nav class="flex shrink-0 items-center gap-1">
			{#if path !== "/"}
				<button
					type="button"
					onclick={() => searchOverlay.show()}
					class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
					aria-keyshortcuts={ariaKeyshortcuts(searchChord, isMac)}
					aria-label="Open search"
					title="Search"
				>
					<SearchIcon class="size-4" />
				</button>
			{/if}
			{#if hasSession}
				<a
					href="/inbox"
					class="relative rounded-md p-1.5 text-muted-foreground no-underline hover:text-foreground hover:bg-accent transition-colors"
					aria-label={inboxUnread > 0
						? `Inbox, ${inboxUnread} unread`
						: "Inbox"}
					title="Inbox"
				>
					<InboxIcon class="size-4" />
					{#if inboxUnread > 0}
						<span
							class="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground"
							>{inboxUnread > 99 ? "99+" : inboxUnread}</span
						>
					{/if}
				</a>
			{/if}
			{#if presenceChrome.active}
				<PresenceDock peers={presenceChrome.peers} />
			{/if}
			{#if hasSession}
				<div class="group/profile relative">
					<a
						href="/profile"
						class="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground no-underline transition-colors hover:bg-accent group-hover/profile:bg-accent group-focus-within/profile:bg-accent"
						aria-label="Account"
						aria-haspopup="menu"
					>
						{#if userId}
							<UserAvatar userId={userId} class="size-6" />
						{:else}
							<UserIcon class="size-4" />
						{/if}
					</a>
					<div
						class="invisible absolute right-0 top-full z-50 min-w-48 pt-2 opacity-0 transition-none group-hover/profile:visible group-hover/profile:opacity-100 group-focus-within/profile:visible group-focus-within/profile:opacity-100"
					>
						<div
							class="surface rounded-md border border-border p-1 text-foreground shadow-md"
						>
							<p
								class="px-2 py-1.5 text-xs font-medium text-muted-foreground"
							>
								Account
							</p>
							{#if userId}
								<a
									href="/users/{userId}"
									class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
								>
									<UserIcon class="size-3.5 shrink-0" />
									Your profile
								</a>
							{/if}
							<a
								href="/profile"
								class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
							>
								<FolderKanbanIcon class="size-3.5 shrink-0" />
								Projects
							</a>
							<a
								href="/orgs"
								class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
							>
								<Building2Icon class="size-3.5 shrink-0" />
								Organisations
							</a>
							<a
								href="/inbox"
								class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
							>
								<InboxIcon class="size-3.5 shrink-0" />
								Inbox
								{#if inboxUnread > 0}
									<span
										class="ml-auto text-[10px] text-muted-foreground"
										>{inboxUnread}</span
									>
								{/if}
							</a>
							<a
								href="/settings"
								class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
							>
								<SettingsIcon class="size-3.5 shrink-0" />
								Settings
							</a>
							<div class="my-1 h-px bg-border"></div>
							<a
								href="/auth/logout"
								class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground no-underline hover:bg-accent hover:text-accent-foreground"
							>
								<LogOutIcon class="size-3.5 shrink-0" />
								Log out
							</a>
						</div>
					</div>
				</div>
			{:else}
				<a
					href="/auth/login"
					class="cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors no-underline inline-block bg-foreground text-background hover:bg-primary hover:text-primary-foreground"
					>Sign in</a
				>
			{/if}
		</nav>
	</div>
</header>
