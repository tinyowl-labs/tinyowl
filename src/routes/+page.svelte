<script lang="ts">
    let { data } = $props();
    const user = $derived(data?.user);
</script>

<svelte:head>
    <title
        >TinyOwl — A distributed, ontology-aware data platform for archaeology</title
    >
    <meta
        name="description"
        content="Compare your excavation data with thousands of other projects. Open standards, no vendor lock-in, works offline."
    />
</svelte:head>

<header
    class="sticky top-0 z-50 border-b border-owl-200 bg-owl-50/90 backdrop-blur-sm"
>
    <div class="content-column flex h-14 items-center justify-between">
        <a
            href="/"
            class="flex items-center gap-2.5 no-underline hover:no-underline"
        >
            <span class="font-serif text-xl text-owl-900">TinyOwl</span>
            <span class="text-xs text-owl-500 font-sans hidden sm:inline"
                >/ archaeology data platform</span
            >
        </a>

        <nav class="flex items-center gap-4 font-sans text-sm">
            <a
                href="/docs"
                class="text-owl-600 hover:text-owl-900 no-underline hover:underline decoration-owl-300"
                >Docs</a
            >
            {#if user}
                <a
                    href="/profile"
                    class="text-owl-600 hover:text-owl-900 no-underline hover:underline decoration-owl-300"
                    >Profile</a
                >
            {:else}
                <a
                    href="/auth"
                    class="rounded-md border border-owl-300 bg-white px-3 py-1.5 text-owl-800 no-underline hover:border-owl-400 hover:bg-owl-50 transition-colors"
                    >Sign in</a
                >
            {/if}
        </nav>
    </div>
</header>

<main>
    <!-- Hero -->
    <section class="content-column py-20 sm:py-28">
        <h1
            class="text-4xl sm:text-5xl text-owl-950 font-serif font-normal leading-tight"
        >
            The archaeology<br class="sm:hidden" /> data commons
        </h1>
        <p class="mt-6 max-w-xl text-lg text-owl-600 leading-relaxed">
            A distributed, ontology-aware platform for archaeological spatial
            data. Compare your excavation with thousands of others. Open
            standards, no lock-in, works offline in the trench.
        </p>

        <div class="mt-8 flex flex-wrap gap-3 font-sans">
            <a
                href="/search"
                class="rounded-full bg-owl-900 px-5 py-2.5 text-sm text-white no-underline hover:bg-owl-800 transition-colors"
            >
                Explore the corpus
            </a>
            <a
                href="/docs"
                class="rounded-full border border-owl-300 px-5 py-2.5 text-sm text-owl-700 no-underline hover:bg-white transition-colors"
            >
                Read the docs
            </a>
        </div>

        <div class="mt-12 flex gap-8 text-sm font-sans">
            <div>
                <div class="text-2xl text-owl-900">—</div>
                <div class="text-owl-500">Connect your QField project</div>
            </div>
            <div>
                <div class="text-2xl text-owl-900">—</div>
                <div class="text-owl-500">Map to CIDOC-CRM &amp; SKOS</div>
            </div>
            <div>
                <div class="text-2xl text-owl-900">—</div>
                <div class="text-owl-500">
                    Search across all public projects
                </div>
            </div>
        </div>
    </section>

    <!-- How it works -->
    <section class="border-t border-owl-200 bg-white">
        <div class="content-column py-20">
            <h2 class="text-2xl font-serif">How it works</h2>

            <div class="mt-10 grid gap-10 sm:grid-cols-3">
                <div>
                    <div
                        class="font-sans text-xs font-semibold text-owl-500 uppercase tracking-wider"
                    >
                        1. Import
                    </div>
                    <h3 class="mt-2 text-lg font-serif">
                        Drop in your GeoPackage
                    </h3>
                    <p class="mt-2 text-sm text-owl-600 leading-relaxed">
                        Upload your QField or QGIS project. We introspect the
                        schema, guess column semantics, and help you map to open
                        ontologies — all without writing a line of TOML.
                    </p>
                </div>
                <div>
                    <div
                        class="font-sans text-xs font-semibold text-owl-500 uppercase tracking-wider"
                    >
                        2. Sync
                    </div>
                    <h3 class="mt-2 text-lg font-serif">
                        Version your data like code
                    </h3>
                    <p class="mt-2 text-sm text-owl-600 leading-relaxed">
                        Binary diffs, append-only revisions, and offline-first
                        sync. Multiple field workers can edit the same project
                        without conflicts. Think Git, for archaeology.
                    </p>
                </div>
                <div>
                    <div
                        class="font-sans text-xs font-semibold text-owl-500 uppercase tracking-wider"
                    >
                        3. Discover
                    </div>
                    <h3 class="mt-2 text-lg font-serif">Search the corpus</h3>
                    <p class="mt-2 text-sm text-owl-600 leading-relaxed">
                        Find coins visually similar to yours, made of bronze,
                        within 200km. Filter by period, material, context type.
                        Every project is private until you choose to share it.
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- CLI box -->
    <section class="border-t border-owl-200">
        <div class="content-column py-16">
            <div
                class="rounded-lg border border-owl-200 bg-white p-6 sm:p-8 font-sans"
            >
                <h3 class="font-serif text-lg">For the terminal</h3>
                <p class="mt-1 text-sm text-owl-500">
                    The CLI does everything the web UI can do — plus batch
                    import, push, pull.
                </p>
                <div
                    class="mt-4 rounded-md bg-owl-950 p-4 font-mono text-sm text-owl-200 overflow-x-auto"
                >
                    <span class="text-owl-400">$</span> tinyowl import survey.gpkg
                    ./my-project --name "My Excavation" --push
                </div>
                <div class="mt-4 flex gap-3 text-sm">
                    <a
                        href="/cli"
                        class="text-owl-700 hover:text-owl-900 underline decoration-owl-300"
                        >CLI reference</a
                    >
                    <a
                        href="/docs/getting-started"
                        class="text-owl-700 hover:text-owl-900 underline decoration-owl-300"
                        >Getting started</a
                    >
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-owl-200">
        <div
            class="content-column flex flex-wrap items-center justify-between gap-4 py-8 font-sans text-xs text-owl-500"
        >
            <div class="flex gap-6">
                <a
                    href="https://github.com/tinyowl-labs"
                    class="no-underline hover:text-owl-700 transition-colors"
                    >GitHub</a
                >
                <a
                    href="/docs"
                    class="no-underline hover:text-owl-700 transition-colors"
                    >Docs</a
                >
                <a
                    href="/tos"
                    class="no-underline hover:text-owl-700 transition-colors"
                    >Terms</a
                >
            </div>
            <div>TinyOwl is open source. MIT licensed.</div>
        </div>
    </footer>
</main>
