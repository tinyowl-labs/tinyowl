<script lang="ts">
	import { page } from "$app/stores";
	import Header from "$lib/components/ui/header.svelte";
	import UserAvatar from "$lib/components/ui/user-avatar.svelte";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	let { data } = $props();
	const hasSession = $derived(Boolean($page.data?.user));
	const profile = $derived(data.profile);
</script>

<svelte:head>
	<title>{profile.display_name} — echidna</title>
</svelte:head>

<div class="flex h-screen flex-col overflow-hidden">
	<Header subtitle={profile.display_name} {hasSession} />
	<main class="min-h-0 flex-1 overflow-y-auto bg-background">
		<div class="mx-auto max-w-5xl px-6 py-8">
			<div class="mb-10 flex items-start gap-4">
				<UserAvatar
					userId={profile.id}
					name={profile.display_name}
					class="size-16"
					bust={profile.has_avatar ? "1" : ""}
				/>
				<div class="min-w-0 flex-1">
					<h1 class="text-2xl font-semibold text-foreground">
						{profile.display_name}
					</h1>
					{#if profile.email}
						<p class="mt-1 text-sm text-muted-foreground">{profile.email}</p>
					{/if}
					{#if data.isSelf}
						<a
							href="/settings"
							class="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground no-underline hover:text-foreground"
						>
							<SettingsIcon class="size-3.5" />
							Edit profile
						</a>
					{/if}
				</div>
			</div>

			{#if profile.orgs.length > 0}
				<section class="mb-10">
					<h2 class="mb-3 text-sm font-medium text-foreground">
						Organisations
					</h2>
					<div class="flex flex-wrap gap-2">
						{#each profile.orgs as org (org.slug)}
							<a
								href="/orgs/{org.slug}"
								class="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm text-foreground no-underline hover:bg-accent"
								title={org.role ? `${org.name} · ${org.role}` : org.name}
							>
								{#if org.has_avatar}
									<img
										src="/orgs/{org.slug}/avatar"
										alt=""
										class="size-6 rounded-full object-cover"
									/>
								{:else}
									<span
										class="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-muted-foreground"
										>{org.name.charAt(0).toUpperCase()}</span
									>
								{/if}
								<span class="truncate">{org.name}</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<section>
				<h2 class="mb-3 text-sm font-medium text-foreground">Projects</h2>
				{#if profile.projects.length === 0}
					<p class="text-sm text-muted-foreground">
						No projects you can open.
					</p>
				{:else}
					<div class="grid gap-2 sm:grid-cols-2">
						{#each profile.projects as project (project.slug)}
							<a
								href="/{encodeURIComponent(project.slug)}"
								class="rounded-lg border border-border bg-card px-3.5 py-3 no-underline transition-colors hover:bg-accent hover:text-foreground"
							>
								<span
									class="block truncate text-sm font-medium text-foreground"
									>{project.title}</span
								>
								<span
									class="mt-0.5 block truncate text-[11px] text-muted-foreground"
									>{project.slug}</span
								>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		</div>
	</main>
</div>
