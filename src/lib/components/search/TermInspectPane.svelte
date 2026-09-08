<script lang="ts">
    import LoaderIcon from "@lucide/svelte/icons/loader";
    import {
        formatTermYears,
        type TermInspectDoc,
        type TermMember,
        type TermRef,
    } from "$lib/search/terms";

    type Props = {
        doc: TermInspectDoc | null;
        loading?: boolean;
        empty?: string | null;
    };

    let { doc, loading = false, empty = null }: Props = $props();

    const subtitle = $derived.by(() => {
        if (!doc) return "";
        const bits = [doc.scheme, doc.kind].filter(Boolean);
        let line = bits.join(" · ");
        if (doc.context) {
            line = line ? `${line} · ${doc.context}` : doc.context;
        }
        return line;
    });

    const whenWhere = $derived.by(() => {
        if (!doc) return "";
        const years = formatTermYears(doc);
        return [doc.spatial, years].filter(Boolean).join(" · ");
    });

    const altKnown = $derived(
        (doc?.alt_labels ?? []).map((s) => s.trim()).filter(Boolean).join(", "),
    );

    const broader = $derived(doc?.broader ?? []);
    const narrower = $derived(doc?.narrower ?? []);
    const clique = $derived(doc?.clique ?? []);
    const seeAlso = $derived([
        ...(doc?.close_match ?? []),
        ...(doc?.broad_match ?? []),
    ]);
    const members = $derived(doc?.members ?? []);

    function refLabel(ref: TermRef): string {
        const label = ref.label?.trim();
        return label || ref.uri;
    }

    function memberLine(member: TermMember): string {
        const years = formatTermYears(member);
        return [member.label, member.spatial, years].filter(Boolean).join(" · ");
    }
</script>

<div class="text-xs">
    {#if loading}
        <div class="flex items-center gap-2 text-muted-foreground">
            <LoaderIcon class="size-3.5 shrink-0 animate-spin" />
            <span>Loading…</span>
        </div>
    {:else if !doc}
        <p class="text-muted-foreground">{empty ?? "Term not found"}</p>
    {:else}
        <div class="space-y-2.5">
            <div class="min-w-0 space-y-0.5">
                <p class="text-sm font-medium leading-snug">{doc.label}</p>
                {#if subtitle}
                    <p class="text-muted-foreground">{subtitle}</p>
                {/if}
                {#if whenWhere}
                    <p class="text-muted-foreground">{whenWhere}</p>
                {/if}
                <p
                    class="font-mono text-[10px] text-muted-foreground break-all"
                >
                    {doc.uri}
                </p>
            </div>

            {#if doc.scope_note}
                <p class="leading-snug text-foreground/90">{doc.scope_note}</p>
            {/if}

            {#if altKnown}
                <div>
                    <p
                        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Also known as
                    </p>
                    <p class="mt-0.5 leading-snug">{altKnown}</p>
                </div>
            {/if}

            {#if broader.length > 0}
                <div>
                    <p
                        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Broader
                    </p>
                    <ul class="mt-0.5 space-y-0.5">
                        {#each broader as ref (ref.uri)}
                            <li class="min-w-0 truncate" title={ref.uri}>
                                {refLabel(ref)}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            {#if narrower.length > 0}
                <div>
                    <p
                        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Narrower
                    </p>
                    <ul class="mt-0.5 space-y-0.5">
                        {#each narrower as ref (ref.uri)}
                            <li class="min-w-0 truncate" title={ref.uri}>
                                {refLabel(ref)}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            {#if clique.length > 0}
                <div>
                    <p
                        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Identity
                    </p>
                    <ul class="mt-0.5 space-y-0.5">
                        {#each clique as ref (ref.uri)}
                            <li class="min-w-0 truncate" title={ref.uri}>
                                {refLabel(ref)}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            {#if seeAlso.length > 0}
                <div>
                    <p
                        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        See also
                    </p>
                    <ul class="mt-0.5 space-y-0.5">
                        {#each seeAlso as ref, i (`${ref.uri}:${i}`)}
                            <li class="min-w-0 truncate" title={ref.uri}>
                                {refLabel(ref)}
                            </li>
                        {/each}
                    </ul>
                    <p class="mt-1 text-[10px] text-muted-foreground">
                        Not applied to search
                    </p>
                </div>
            {/if}

            {#if members.length > 0}
                <div>
                    <p
                        class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                        Members
                    </p>
                    <ul class="mt-0.5 space-y-0.5">
                        {#each members as member (member.uri)}
                            <li class="min-w-0 truncate" title={member.uri}>
                                {memberLine(member)}
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            {#if doc.provenance}
                <p class="text-[10px] text-muted-foreground">{doc.provenance}</p>
            {/if}
        </div>
    {/if}
</div>
