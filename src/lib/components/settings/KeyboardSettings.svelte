<script lang="ts">
	import {
		CAMERA_SCHEMES,
		SHORTCUT_CATALOG,
		catalogEntry,
		conflictFor,
		currentChord,
		eventToChord,
		formatChord,
		isModifierOnly,
		isReservedChord,
		keyboardPrefs,
		pushKeyboardToSupabase,
		resetShortcuts,
		setCameraScheme,
		setFlySensitivity,
		setPivotZoomSensitivity,
		setShortcutChord,
		type CameraScheme,
		type ShortcutId,
	} from "$lib/shortcuts";

	let capturing = $state<ShortcutId | null>(null);
	let captureError = $state("");

	const remappable = $derived(
		SHORTCUT_CATALOG.filter((e) => e.remappable),
	);

	const groups = $derived.by(() => {
		void keyboardPrefs.chords;
		const map: Record<string, typeof remappable> = {};
		const order: string[] = [];
		for (const e of remappable) {
			if (!map[e.group]) {
				map[e.group] = [];
				order.push(e.group);
			}
			map[e.group]!.push(e);
		}
		return order.map((group) => [group, map[group]!] as const);
	});

	function persist() {
		void pushKeyboardToSupabase();
	}

	function startCapture(id: ShortcutId) {
		capturing = id;
		captureError = "";
	}

	function onCaptureKey(ev: KeyboardEvent) {
		if (!capturing) return;
		if (isModifierOnly(ev)) return;
		ev.preventDefault();
		ev.stopPropagation();
		if (ev.key === "Escape") {
			capturing = null;
			captureError = "";
			return;
		}
		const chord = eventToChord(ev);
		if (isReservedChord(chord)) {
			captureError = "That chord is reserved by the browser.";
			return;
		}
		const clash = conflictFor(capturing, chord, keyboardPrefs.chords);
		if (clash) {
			const other = catalogEntry(clash);
			captureError = `Already used by ${other?.label ?? clash}.`;
			return;
		}
		setShortcutChord(capturing, chord);
		capturing = null;
		captureError = "";
		persist();
	}

	$effect(() => {
		if (!capturing) return;
		const fn = onCaptureKey;
		window.addEventListener("keydown", fn, true);
		return () => window.removeEventListener("keydown", fn, true);
	});

	function resetRow(id: ShortcutId) {
		setShortcutChord(id, null);
		if (capturing === id) capturing = null;
		persist();
	}

	function resetAll() {
		resetShortcuts();
		capturing = null;
		captureError = "";
		persist();
	}

	function chooseScheme(id: CameraScheme) {
		setCameraScheme(id);
		persist();
	}

	function onSensitivity(ev: Event) {
		const v = Number((ev.currentTarget as HTMLInputElement).value);
		setFlySensitivity(v);
	}

	function onPivotZoom(ev: Event) {
		const v = Number((ev.currentTarget as HTMLInputElement).value);
		setPivotZoomSensitivity(v);
	}

	function onSensitivityCommit() {
		persist();
	}
</script>

<div class="space-y-8 w-full">
	<section>
		<div class="mb-4 flex items-start justify-between gap-3">
			<div>
				<h2 class="text-sm font-medium text-foreground mb-1">Shortcuts</h2>
				<p class="text-sm text-muted-foreground">
					Click a chord to rebind. Escape cancels. Synced to your account when signed in.
				</p>
			</div>
			<button
				type="button"
				class="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
				onclick={resetAll}
			>
				Reset defaults
			</button>
		</div>
		{#if captureError}
			<p class="mb-3 text-sm text-destructive">{captureError}</p>
		{/if}
		<div class="space-y-5">
			{#each groups as [group, entries] (group)}
				<div>
					<h3
						class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						{group}
					</h3>
					<ul class="divide-y divide-border rounded-md border border-border">
						{#each entries as entry (entry.id)}
							<li class="flex items-center gap-3 px-3 py-2">
								<span class="min-w-0 flex-1 text-sm text-foreground"
									>{entry.label}</span
								>
								<button
									type="button"
									class="rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums {capturing ===
									entry.id
										? 'border-foreground bg-secondary text-foreground'
										: 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
									onclick={() => startCapture(entry.id)}
								>
									{capturing === entry.id
										? "Press a key…"
										: formatChord(currentChord(entry.id))}
								</button>
								<button
									type="button"
									class="text-[11px] text-muted-foreground hover:text-foreground"
									onclick={() => resetRow(entry.id)}
								>
									Default
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2 class="text-sm font-medium text-foreground mb-1">Camera</h2>
		<p class="text-sm text-muted-foreground mb-4">
			Globe is the default 3D navigation. Pivot orbits a point under the cursor, like the artefact viewer. 2D stays pan and zoom.
		</p>
		<div class="flex flex-col gap-2">
			{#each CAMERA_SCHEMES as scheme (scheme.id)}
				<button
					type="button"
					onclick={() => chooseScheme(scheme.id)}
					class="rounded-md border px-3 py-2 text-left text-sm transition-colors {keyboardPrefs.cameraScheme ===
					scheme.id
						? 'border-foreground bg-secondary text-foreground'
						: 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'}"
				>
					<span class="font-medium text-foreground">{scheme.label}</span>
					<span class="mt-0.5 block text-xs text-muted-foreground"
						>{scheme.legend}</span
					>
				</button>
			{/each}
		</div>
		<label class="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
			<span class="w-24 shrink-0">Pinch zoom</span>
			<input
				type="range"
				min="0.25"
				max="3"
				step="0.05"
				value={keyboardPrefs.pivotZoomSensitivity}
				oninput={onPivotZoom}
				onchange={onSensitivityCommit}
				class="w-full"
				aria-label="Pivot pinch zoom sensitivity"
			/>
			<span class="w-10 text-right tabular-nums text-foreground"
				>{keyboardPrefs.pivotZoomSensitivity.toFixed(2)}</span
			>
		</label>
	</section>

	<section>
		<h2 class="text-sm font-medium text-foreground mb-1">Fly</h2>
		<p class="text-sm text-muted-foreground mb-4">
			3D only. {formatChord(currentChord("map-fly-toggle"))} enters; Escape leaves.
			WASD move, Q/E down/up, hold left mouse to look, Shift faster.
		</p>
		<label class="flex items-center gap-3 text-sm text-muted-foreground">
			<span class="w-24 shrink-0">Sensitivity</span>
			<input
				type="range"
				min="0.25"
				max="3"
				step="0.05"
				value={keyboardPrefs.flySensitivity}
				oninput={onSensitivity}
				onchange={onSensitivityCommit}
				class="w-full"
				aria-label="Fly sensitivity"
			/>
			<span class="w-10 text-right tabular-nums text-foreground"
				>{keyboardPrefs.flySensitivity.toFixed(2)}</span
			>
		</label>
	</section>
</div>
