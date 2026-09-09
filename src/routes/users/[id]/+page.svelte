<script lang="ts">
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import CommitTimeline from "$lib/components/dashboard/CommitTimeline.svelte";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import GitCommit from "@lucide/svelte/icons/git-commit";
	import SearchIcon from "@lucide/svelte/icons/search";
	import LockIcon from "@lucide/svelte/icons/lock";

	const RECENT_LIMIT = 6;

	let { data } = $props();
	const profile = $derived(data.profile);
	const isSelf = $derived(data.isSelf);
	const projects = $derived(data.projects ?? []);
	const orgs = $derived(data.orgs ?? profile.orgs ?? []);
	const diffs = $derived(data.diffs ?? []);

	const personName = $derived.by(() => {
		const first = profile.first_name?.trim() ?? "";
		const last = profile.last_name?.trim() ?? "";
		const full = `${first} ${last}`.trim();
		return full || profile.display_name;
	});

	const username = $derived(
		(profile.username?.trim() ||
			(profile.display_name !== personName ? profile.display_name : "") ||
			"") as string,
	);

	const handle = $derived(username ? `@${username.replace(/^@/, "")}` : "");

	let query = $state("");

	const lastEditedAt = $derived.by(() => {
		const map = new Map<string, string>();
		for (const d of diffs) {
			if (!map.has(d.project_slug)) map.set(d.project_slug, d.created_at);
		}
		return map;
	});

	const recentProjects = $derived.by(() => {
		const bySlug = new Map(projects.map((p) => [p.slug, p]));
		const seen = new Set<string>();
		const ordered: Array<(typeof projects)[number]> = [];
		for (const d of diffs) {
			if (seen.has(d.project_slug)) continue;
			const p = bySlug.get(d.project_slug);
			if (!p) continue;
			ordered.push(p);
			seen.add(d.project_slug);
			if (ordered.length >= RECENT_LIMIT) return ordered;
		}
		for (const p of projects) {
			if (seen.has(p.slug)) continue;
			ordered.push(p);
			seen.add(p.slug);
			if (ordered.length >= RECENT_LIMIT) break;
		}
		return ordered;
	});

	const searching = $derived(query.trim().length > 0);
	const showSearch = $derived(isSelf && projects.length > RECENT_LIMIT);

	const visibleProjects = $derived.by(() => {
		if (!isSelf) return projects;
		const q = query.trim().toLowerCase();
		if (!q) return recentProjects;
		return projects.filter(
			(p) =>
				p.title.toLowerCase().includes(q) ||
				p.slug.toLowerCase().includes(q),
		);
	});

	function isPrivate(visibility: string | undefined): boolean {
		return (visibility ?? "private") !== "public";
	}

	function relativeTime(ts: string): string {
		const date = new Date(ts);
		const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);
		if (diffMins < 1) return "Just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}
</script>

<svelte:head>
	<title>{isSelf ? "Your profile" : personName} — echidna</title>
</svelte:head>

<div class="flex h-full flex-col overflow-hidden">
	<main class="min-h-0 flex-1 overflow-y-auto bg-background">
		<div class="mx-auto max-w-5xl px-6 py-8">
			<header class="mb-8 flex items-center gap-5">
				<UserAvatar
					userId={profile.id}
					name={personName}
					class="size-20"
					bust={profile.has_avatar ? "1" : ""}
				/>
				<div class="min-w-0 flex-1">
					<div
						class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5"
					>
						<h1
							class="truncate text-xl font-semibold tracking-tight text-foreground"
						>
							{personName}
						</h1>
						{#if isSelf}
							<a
								href="/settings"
								class="shrink-0 text-xs text-muted-foreground no-underline hover:text-foreground"
							>
								Edit profile
							</a>
						{/if}
					</div>
					{#if handle || (isSelf && profile.email) || orgs.length > 0}
						<div
							class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
						>
							{#if handle}
								<span class="truncate">{handle}</span>
							{/if}
							{#if isSelf && profile.email}
								{#if handle}<span aria-hidden="true">·</span>{/if}
								<span class="truncate">{profile.email}</span>
							{/if}
							{#if orgs.length > 0}
								{#if handle || (isSelf && profile.email)}
									<span aria-hidden="true">·</span>
								{/if}
								<span class="flex flex-wrap items-center gap-1.5">
									{#each orgs as org (org.slug)}
										<a
											href="/orgs/{org.slug}"
											class="inline-flex max-w-[12rem] items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground"
											title={org.role
												? `${org.name} · ${org.role}`
												: org.name}
										>
											{#if org.has_avatar}
												<img
													src="/orgs/{org.slug}/avatar"
													alt=""
													class="size-4 shrink-0 rounded-full object-cover"
												/>
											{:else}
												<span
													class="flex size-4 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-medium"
													>{org.name.charAt(0).toUpperCase()}</span
												>
											{/if}
											<span class="truncate text-xs"
												>{org.name}</span
											>
										</a>
									{/each}
								</span>
							{/if}
						</div>
					{/if}
				</div>
			</header>

			<section class="mb-10">
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 class="text-sm font-medium text-foreground">
						{#if isSelf && !searching}
							Recent projects
						{:else}
							Projects
						{/if}
					</h2>
					{#if isSelf}
						<a
							href="/projects/new"
							class="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
						>
							<PlusIcon class="size-3.5" />
							New
						</a>
					{/if}
				</div>

				{#if showSearch}
					<div class="relative mb-3">
						<SearchIcon
							class="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
						/>
						<input
							type="search"
							bind:value={query}
							placeholder="Search projects"
							autocomplete="off"
							class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						/>
					</div>
				{/if}

				{#if projects.length === 0}
					{#if isSelf}
						<p class="text-sm text-muted-foreground">
							No projects yet.
							<a
								href="/projects/new"
								class="text-foreground underline-offset-4 hover:underline"
								>Create one</a
							>.
						</p>
					{:else}
						<p class="text-sm text-muted-foreground">
							No projects you can open.
						</p>
					{/if}
				{:else if isSelf && visibleProjects.length === 0}
					<p class="text-sm text-muted-foreground">
						No matching projects
					</p>
				{:else}
					<div class="grid gap-2 sm:grid-cols-2">
						{#each visibleProjects as project (project.slug)}
							<a
								href="/{encodeURIComponent(project.slug)}"
								class="rounded-lg border border-border bg-card px-3.5 py-3 no-underline transition-colors hover:bg-accent hover:text-foreground"
							>
								<span class="flex min-w-0 items-center gap-1.5">
									<span
										class="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
										>{project.title}</span
									>
									{#if isPrivate(project.visibility)}
										<LockIcon
											class="size-3.5 shrink-0 text-muted-foreground"
											aria-label="Private"
										/>
									{/if}
								</span>
								<span
									class="mt-0.5 block truncate text-[11px] text-muted-foreground"
									>{project.slug}{#if isSelf &&
										lastEditedAt.get(project.slug)}
										· {relativeTime(
											lastEditedAt.get(project.slug)!,
										)}{/if}</span
								>
							</a>
						{/each}
					</div>
				{/if}
			</section>

			{#if isSelf}
				<section>
					<h2 class="mb-3 text-sm font-medium text-foreground">
						Recent activity
					</h2>
					{#if diffs.length === 0}
						<div
							class="rounded-lg border border-border bg-card px-4 py-6 text-center"
						>
							<div
								class="mx-auto mb-2 flex size-8 items-center justify-center rounded-full bg-secondary"
							>
								<GitCommit
									class="size-3.5 text-muted-foreground"
								/>
							</div>
							<p class="text-sm text-muted-foreground">
								No diffs yet. Run
								<code
									class="rounded bg-secondary px-1 font-mono text-xs"
								>
									tinyowl push
								</code>
								to push your first diff.
							</p>
						</div>
					{:else}
						<CommitTimeline {diffs} />
					{/if}
				</section>
			{/if}
		</div>
	</main>
</div>
