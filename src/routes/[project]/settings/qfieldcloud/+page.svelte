<script lang="ts">
	import { enhance } from "$app/forms";
	import { Button } from "$lib/components/ui/button/index.js";
	import JobLog from "$lib/components/qfield/job-log.svelte";
	import { SELECT_CLASS } from "../pages";

	let { data, form: rawForm } = $props();
	const form = $derived(rawForm as any);

	const projectTitle = $derived(data?.project?.title ?? "Project");
	const slug = $derived(
		(data as any)?.slug ?? (data?.project?.slug as string) ?? "",
	);
	const userRole = $derived(data?.role ?? "viewer");
	const canManage = $derived(
		userRole === "owner" ||
			userRole === "admin" ||
			userRole === "collaborator",
	);

	const fieldLink = $derived((data as any)?.qfieldLink ?? null);
	let polledLink = $state<any>(null);
	const link = $derived(polledLink ?? fieldLink);
	const jobActive = $derived(
		Boolean(
			link &&
				(link.import_status === "pending" ||
					link.import_status === "running" ||
					link.sync_pending ||
					link.sync_requested_at),
		),
	);

	$effect(() => {
		const s = slug;
		const on = jobActive;
		if (!s || !on) return;
		let stopped = false;
		async function tick() {
			try {
				const res = await fetch(
					`/api/qfieldcloud/links/${encodeURIComponent(s)}`,
				);
				if (res.ok && !stopped) polledLink = await res.json();
			} catch {
				/* ignore */
			}
		}
		void tick();
		const id = setInterval(() => void tick(), 1000);
		return () => {
			stopped = true;
			clearInterval(id);
		};
	});

	const accounts = $derived(
		((data as any)?.qfieldAccounts ?? []) as {
			id: string;
			base_url: string;
			username: string;
			label?: string | null;
		}[],
	);
	const accessToken = $derived(((data as any)?.accessToken as string) || "");
	const developCommit = $derived(
		((data as any)?.developCommit as string) || "",
	);

	let accountId = $state("");

	$effect(() => {
		if (accounts.length > 0 && !accountId) {
			accountId = accounts[0].id;
		}
	});

	const packageHref = $derived(
		`/api/v1/projects/${slug}/field-package?ref=develop${accessToken ? `&token=${encodeURIComponent(accessToken)}` : ""}`,
	);

	function formatLocal(ts: string): string {
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});
	}

	function accountLabel(acct: {
		base_url: string;
		username: string;
		label?: string | null;
	}): string {
		const label = (acct.label ?? "").trim();
		if (label && !/qfield/i.test(label)) {
			return `${label} (${acct.username})`;
		}
		try {
			const host = new URL(acct.base_url).host;
			return `${acct.username} · ${host}`;
		} catch {
			return acct.username;
		}
	}
</script>

<svelte:head>
	<title>Sync — {projectTitle} — echidna</title>
</svelte:head>

<section>
	<div class="mb-6">
		<h2 class="text-sm font-medium text-foreground">Sync</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Phone capture and offline packages for this project’s
			<span class="font-mono">develop</span> branch.
			<a
				href="/docs/guides/field-sync"
				class="text-foreground underline-offset-4 hover:underline"
				>How field sync works</a
			>.
		</p>
	</div>

	{#if form?.error}
		<p
			class="mb-4 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
		>
			{form.error}
		</p>
	{/if}
	{#if form?.success && form?.qfieldAction}
		<p
			class="mb-4 rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
		>
			{#if form.qfieldAction === "sync_requested"}
				Sync requested.
			{:else if form.qfieldAction === "provisioned"}
				Sync enabled.
			{:else if form.qfieldAction === "unlinked"}
				Sync disconnected.
			{:else if form.qfieldAction === "linked"}
				Cloud project linked.
			{:else if form.qfieldAction === "field_pushed"}
				Package pushed to develop.
			{:else}
				Done.
			{/if}
		</p>
	{/if}

	<div class="space-y-6">
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="text-sm font-medium text-foreground">Phone sync</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				Create a private field project on your Cloud. Phones sync
				normally; echidna keeps
				<span class="font-mono">develop</span> as the source of truth.
			</p>

			<div class="mt-4">
				{#if link}
					<div class="space-y-3">
						<div
							class="flex flex-wrap items-start justify-between gap-3"
						>
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground">
									{#if link.mode === "snapshot"}
										Imported copy
									{:else}
										Enabled
									{/if}
								</p>
								<p
									class="mt-0.5 truncate text-sm text-muted-foreground"
								>
									{link.qfc_project_name ||
										link.qfc_project_id}
								</p>
							</div>
							{#if canManage}
								<div class="flex flex-wrap gap-2">
									{#if link.mode !== "snapshot"}
										<form
											method="POST"
											action="?/syncQFieldCloud"
											use:enhance
										>
											<Button
												type="submit"
												size="sm"
												disabled={Boolean(
													link.sync_pending ||
														link.sync_requested_at,
												)}
											>
												{link.sync_pending ||
												link.sync_requested_at
													? "Syncing…"
													: "Sync now"}
											</Button>
										</form>
									{/if}
									<form
										method="POST"
										action="?/unlinkQFieldCloud"
										use:enhance
									>
										<Button
											type="submit"
											size="sm"
											variant="outline"
											onclick={(e) => {
												if (
													!confirm(
														"Disconnect sync for this project?",
													)
												)
													e.preventDefault();
											}}
										>
											Disconnect
										</Button>
									</form>
								</div>
							{/if}
						</div>

						{#if link.job_log ||
							link.import_status === "pending" ||
							link.import_status === "running" ||
							link.sync_pending ||
							link.sync_requested_at}
							<JobLog
								log={link.job_log || ""}
								status={link.import_status ||
									(link.sync_pending ||
									link.sync_requested_at
										? "syncing"
										: "")}
								error={link.import_error || ""}
								progress={link.job_progress || null}
							/>
						{/if}

						{#if link.last_synced_at}
							<p class="text-xs text-muted-foreground">
								Last sync {formatLocal(link.last_synced_at)}
							</p>
						{/if}
					</div>
				{:else if !canManage}
					<p class="text-sm text-muted-foreground">
						Collaborator role or higher is required to enable sync.
					</p>
				{:else if accounts.length === 0}
					<div
						class="rounded-lg border border-dashed border-border px-4 py-5 text-center"
					>
						<p class="mb-3 text-sm text-muted-foreground">
							Connect a field Cloud account in Settings first.
						</p>
						<a
							href="/settings?tab=qfieldcloud"
							class="text-sm text-foreground underline-offset-4 hover:underline"
							>Open Settings</a
						>
					</div>
				{:else}
					<form
						method="POST"
						action="?/provisionQFieldCloud"
						use:enhance
						class="flex flex-wrap items-end gap-3"
					>
						{#if accounts.length > 1}
							<label class="grid min-w-[14rem] flex-1 gap-1.5">
								<span class="text-xs text-muted-foreground"
									>Account</span
								>
								<select
									name="account_id"
									class={SELECT_CLASS}
									bind:value={accountId}
								>
									{#each accounts as acct}
										<option value={acct.id}
											>{accountLabel(acct)}</option
										>
									{/each}
								</select>
							</label>
						{:else}
							<input
								type="hidden"
								name="account_id"
								value={accountId}
							/>
							<p class="text-xs text-muted-foreground">
								{accountLabel(accounts[0])}
							</p>
						{/if}
						<Button type="submit" size="sm">Enable sync</Button>
					</form>
				{/if}
			</div>
		</div>

		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0 max-w-xl">
					<h3 class="text-sm font-medium text-foreground">
						Field package
					</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Download a zip at
						<span class="font-mono">develop</span> for offline
						capture in QGIS or a phone client. Pushing an edited
						package without Cloud is covered in the
						<a
							href="/docs/guides/field-sync"
							class="text-foreground underline-offset-4 hover:underline"
							>docs</a
						>.
					</p>
					{#if developCommit}
						<p class="mt-2 font-mono text-xs text-muted-foreground">
							{developCommit.slice(0, 12)}
						</p>
					{/if}
				</div>
				<Button href={packageHref} size="sm" variant="outline">
					Download
				</Button>
			</div>
		</div>
	</div>
</section>
