<script lang="ts">
    import { page } from "$app/stores";
    import Header from "$lib/components/ui/header.svelte";
    import SettingsIcon from "@lucide/svelte/icons/settings";

    let { data, children } = $props();
    const hasSession = $derived(Boolean($page.data?.user ?? data?.user));
    const org = $derived(data.org);
    const canAdmin = $derived(Boolean(data.canAdmin));
    const pathname = $derived($page.url.pathname);
    const onSettings = $derived(pathname.includes("/settings"));
</script>

<div class="flex h-screen flex-col overflow-hidden">
    <Header subtitle={org.name} subtitleHref="/orgs/{org.slug}" {hasSession} />
    <main class="min-h-0 flex-1 overflow-y-auto bg-background">
        {#if canAdmin && !onSettings}
            <div class="mx-auto flex max-w-5xl justify-end px-6 pt-4">
                <a
                    href="/orgs/{org.slug}/settings"
                    class="inline-flex items-center gap-1.5 text-xs text-muted-foreground no-underline hover:text-foreground"
                >
                    <SettingsIcon class="size-3.5" />
                    Settings
                </a>
            </div>
        {/if}
        {@render children()}
    </main>
</div>
