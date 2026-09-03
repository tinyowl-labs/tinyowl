<script lang="ts">
    import { page } from "$app/stores";
    import { cn } from "$lib/utils.js";

    let { data, children } = $props();
    const org = $derived(data.org);
    const pathname = $derived($page.url.pathname);

    const pages = [
        { id: "", label: "General" },
        { id: "members", label: "Members" },
        { id: "projects", label: "Projects" },
    ] as const;

    function href(id: string) {
        return id
            ? `/orgs/${org.slug}/settings/${id}`
            : `/orgs/${org.slug}/settings`;
    }

    function isActive(id: string) {
        return pathname === href(id);
    }
</script>

<div class="mx-auto w-full max-w-5xl px-6 py-6">
    <div class="mb-6 flex items-baseline justify-between gap-4">
        <h1 class="text-lg font-semibold text-foreground">
            {org.name}
            <span class="font-normal text-muted-foreground">settings</span>
        </h1>
        <a
            href="/orgs/{org.slug}"
            class="text-xs text-muted-foreground no-underline hover:text-foreground"
            >Back to org</a
        >
    </div>
    <div class="md:flex md:items-start md:gap-8">
        <nav
            class="flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 md:w-48 md:shrink-0 md:flex-col md:items-stretch md:gap-0.5 md:overflow-visible md:rounded-none md:bg-transparent md:p-0"
            aria-label="Organisation settings"
        >
            {#each pages as item}
                <a
                    href={href(item.id)}
                    aria-current={isActive(item.id) ? "page" : undefined}
                    class={cn(
                        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium no-underline ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "md:w-full md:justify-start md:px-2.5 md:shadow-none",
                        isActive(item.id)
                            ? "bg-background text-foreground shadow-sm md:bg-accent md:shadow-none"
                            : "text-muted-foreground hover:text-foreground md:hover:bg-accent md:hover:text-foreground",
                    )}
                >
                    {item.label}
                </a>
            {/each}
        </nav>
        <div class="mt-4 min-w-0 flex-1 md:mt-0">
            {@render children()}
        </div>
    </div>
</div>
