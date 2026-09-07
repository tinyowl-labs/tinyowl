<script lang="ts">
	import type { Snippet } from "svelte";
	import AsciiEchidna from "$lib/components/AsciiEchidna.svelte";
	import EchidnaLogo from "$lib/components/ui/echidna-logo.svelte";

	let { children }: { children: Snippet } = $props();
</script>

<div class="grid min-h-svh lg:grid-cols-2">
	<div class="flex flex-col gap-4 p-6 md:p-10">
		<div class="flex justify-center gap-2 md:justify-start">
			<a href="/" class="flex items-center gap-2 font-medium no-underline">
				<span class="inline-block size-6 shrink-0 text-foreground [&>svg]:h-full [&>svg]:w-full">
					<EchidnaLogo />
				</span>
				echidna
			</a>
		</div>
		<div class="flex flex-1 items-center justify-center">
			<div class="w-full max-w-xs">
				{@render children()}
			</div>
		</div>
	</div>
	<div class="bg-muted relative hidden min-h-svh overflow-hidden lg:block">
		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.18] dark:opacity-[0.28]"
		>
			<AsciiEchidna fill class="h-full w-full" />
		</div>
	</div>
</div>
