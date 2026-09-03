<script lang="ts">
	import { Dialog } from "bits-ui";
	import XIcon from "@lucide/svelte/icons/x";
	import { Button } from "$lib/components/ui/button/index.js";
	import { Field, FieldLabel } from "$lib/components/ui/field/index.js";
	import { generatedAvatarDataUrl } from "$lib/user-avatar";
	import {
		AVATAR_ACCESSORIES,
		AVATAR_CLOTH_COLORS,
		AVATAR_CLOTHING,
		AVATAR_EYEBROWS,
		AVATAR_EYES,
		AVATAR_FACIAL_HAIR,
		AVATAR_GRAPHICS,
		AVATAR_HAIR_COLORS,
		AVATAR_MOUTHS,
		AVATAR_SKIN_COLORS,
		AVATAR_TOPS,
		isHatTop,
		labelAvatarOption,
		randomAvatarStyle,
		type AvatarStyle,
	} from "$lib/avatar-style";

	let {
		open = $bindable(false),
		seed,
		style = $bindable({} as AvatarStyle),
		saving = false,
		onSave,
	}: {
		open?: boolean;
		seed: string;
		style?: AvatarStyle;
		saving?: boolean;
		onSave: (style: AvatarStyle) => void | Promise<void>;
	} = $props();

	const preview = $derived(generatedAvatarDataUrl(seed, style));
	const showHatColor = $derived(isHatTop(style.top));
	const showGraphic = $derived(style.clothing === "graphicShirt");

	const selectClass =
		"flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

	function setField<K extends keyof AvatarStyle>(key: K, value: string) {
		style = { ...style, [key]: value || undefined };
	}

	const selectedRing =
		"ring-2 ring-ring ring-offset-1 ring-offset-background";
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-lg outline-none"
		>
			<div class="mb-4 flex items-start justify-between gap-3">
				<div>
					<Dialog.Title class="text-sm font-medium text-foreground"
						>Generate avatar</Dialog.Title
					>
					<Dialog.Description
						class="mt-0.5 text-xs text-muted-foreground"
						>Randomise, then tweak. Save applies it everywhere.</Dialog.Description
					>
				</div>
				<Dialog.Close
					class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
					aria-label="Close"
				>
					<XIcon class="size-4" />
				</Dialog.Close>
			</div>

			<div class="space-y-4">
	<div class="flex items-center gap-4">
		<img
			src={preview}
			alt=""
			class="size-20 shrink-0 rounded-full bg-secondary object-cover"
		/>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					onclick={() => (style = randomAvatarStyle())}
				>
					Randomise
				</Button>
			</div>
		</div>
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		<Field>
			<FieldLabel for="av_top">Hair / hat</FieldLabel>
			<select
				id="av_top"
				class={selectClass}
				value={style.top ?? ""}
				onchange={(e) => setField("top", e.currentTarget.value)}
			>
				<option value="">From seed</option>
				{#each AVATAR_TOPS as opt}
					<option value={opt}>{labelAvatarOption(opt)}</option>
				{/each}
			</select>
		</Field>
		<Field>
			<FieldLabel for="av_eyes">Eyes</FieldLabel>
			<select
				id="av_eyes"
				class={selectClass}
				value={style.eyes ?? ""}
				onchange={(e) => setField("eyes", e.currentTarget.value)}
			>
				<option value="">From seed</option>
				{#each AVATAR_EYES as opt}
					<option value={opt}>{labelAvatarOption(opt)}</option>
				{/each}
			</select>
		</Field>
		<Field>
			<FieldLabel for="av_brows">Eyebrows</FieldLabel>
			<select
				id="av_brows"
				class={selectClass}
				value={style.eyebrows ?? ""}
				onchange={(e) => setField("eyebrows", e.currentTarget.value)}
			>
				<option value="">From seed</option>
				{#each AVATAR_EYEBROWS as opt}
					<option value={opt}>{labelAvatarOption(opt)}</option>
				{/each}
			</select>
		</Field>
		<Field>
			<FieldLabel for="av_mouth">Mouth</FieldLabel>
			<select
				id="av_mouth"
				class={selectClass}
				value={style.mouth ?? ""}
				onchange={(e) => setField("mouth", e.currentTarget.value)}
			>
				<option value="">From seed</option>
				{#each AVATAR_MOUTHS as opt}
					<option value={opt}>{labelAvatarOption(opt)}</option>
				{/each}
			</select>
		</Field>
		<Field>
			<FieldLabel for="av_face">Facial hair</FieldLabel>
			<select
				id="av_face"
				class={selectClass}
				value={style.facialHair ?? ""}
				onchange={(e) => setField("facialHair", e.currentTarget.value)}
			>
				<option value="">From seed</option>
				{#each AVATAR_FACIAL_HAIR as opt}
					<option value={opt}>{labelAvatarOption(opt)}</option>
				{/each}
			</select>
		</Field>
		<Field>
			<FieldLabel for="av_clothes">Clothes</FieldLabel>
			<select
				id="av_clothes"
				class={selectClass}
				value={style.clothing ?? ""}
				onchange={(e) => setField("clothing", e.currentTarget.value)}
			>
				<option value="">From seed</option>
				{#each AVATAR_CLOTHING as opt}
					<option value={opt}>{labelAvatarOption(opt)}</option>
				{/each}
			</select>
		</Field>
		{#if showGraphic}
			<Field>
				<FieldLabel for="av_graphic">Shirt graphic</FieldLabel>
				<select
					id="av_graphic"
					class={selectClass}
					value={style.clothingGraphic ?? ""}
					onchange={(e) => setField("clothingGraphic", e.currentTarget.value)}
				>
					<option value="">From seed</option>
					{#each AVATAR_GRAPHICS as opt}
						<option value={opt}>{labelAvatarOption(opt)}</option>
					{/each}
				</select>
			</Field>
		{/if}
		<Field>
			<FieldLabel for="av_acc">Accessories</FieldLabel>
			<select
				id="av_acc"
				class={selectClass}
				value={style.accessories ?? ""}
				onchange={(e) => setField("accessories", e.currentTarget.value)}
			>
				<option value="">From seed</option>
				{#each AVATAR_ACCESSORIES as opt}
					<option value={opt}>{labelAvatarOption(opt)}</option>
				{/each}
			</select>
		</Field>
	</div>

	<div class="space-y-3">
		<div>
			<p class="mb-1.5 text-xs font-medium text-muted-foreground">Hair colour</p>
			<div class="flex flex-wrap gap-1.5">
				{#each AVATAR_HAIR_COLORS as hex}
					<button
						type="button"
						title="#{hex}"
						class="size-5 rounded-full border border-border {style.hairColor ===
						hex
							? selectedRing
							: ""}"
						style="background-color: #{hex}"
						onclick={() => setField("hairColor", hex)}
					></button>
				{/each}
			</div>
		</div>
		{#if showHatColor}
			<div>
				<p class="mb-1.5 text-xs font-medium text-muted-foreground">Hat colour</p>
				<div class="flex flex-wrap gap-1.5">
					{#each AVATAR_CLOTH_COLORS as hex}
						<button
							type="button"
							title="#{hex}"
							class="size-5 rounded-full border border-border {style.hatColor ===
							hex
								? selectedRing
								: ""}"
							style="background-color: #{hex}"
							onclick={() => setField("hatColor", hex)}
						></button>
					{/each}
				</div>
			</div>
		{/if}
		<div>
			<p class="mb-1.5 text-xs font-medium text-muted-foreground">Skin</p>
			<div class="flex flex-wrap gap-1.5">
				{#each AVATAR_SKIN_COLORS as hex}
					<button
						type="button"
						title="#{hex}"
						class="size-5 rounded-full border border-border {style.skinColor ===
						hex
							? selectedRing
							: ""}"
						style="background-color: #{hex}"
						onclick={() => setField("skinColor", hex)}
					></button>
				{/each}
			</div>
		</div>
		<div>
			<p class="mb-1.5 text-xs font-medium text-muted-foreground">Clothes colour</p>
			<div class="flex flex-wrap gap-1.5">
				{#each AVATAR_CLOTH_COLORS as hex}
					<button
						type="button"
						title="#{hex}"
						class="size-5 rounded-full border border-border {style.clothesColor ===
						hex
							? selectedRing
							: ""}"
						style="background-color: #{hex}"
						onclick={() => setField("clothesColor", hex)}
					></button>
				{/each}
			</div>
		</div>
		<div>
			<p class="mb-1.5 text-xs font-medium text-muted-foreground">Background</p>
			<div class="flex flex-wrap gap-1.5">
				{#each AVATAR_CLOTH_COLORS as hex}
					<button
						type="button"
						title="#{hex}"
						class="size-5 rounded-full border border-border {style.backgroundColor ===
						hex
							? selectedRing
							: ""}"
						style="background-color: #{hex}"
						onclick={() => setField("backgroundColor", hex)}
					></button>
				{/each}
			</div>
		</div>
	</div>

	<Button
		type="button"
		size="sm"
		disabled={saving}
		onclick={() => onSave(style)}
	>
		{saving ? "Saving…" : "Save avatar"}
	</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
