<script lang="ts">
    type JobProgress = {
        phase?: string;
        done?: number;
        total?: number;
        bytes?: number;
        bytes_total?: number;
        errors?: number;
        rate_bps?: number;
        eta_s?: number;
        current?: string;
        usable?: boolean;
    };

    let {
        log = "",
        status = "",
        error = "",
        progress = null,
        idle = "waiting for bridge…",
    }: {
        log?: string;
        status?: string;
        error?: string;
        progress?: JobProgress | null;
        idle?: string;
    } = $props();

    let scroller: HTMLPreElement | undefined = $state();

    $effect(() => {
        log;
        if (!scroller) return;
        scroller.scrollTop = scroller.scrollHeight;
    });

    const total = $derived(Number(progress?.total) || 0);
    const done = $derived(Number(progress?.done) || 0);
    const pct = $derived(total > 0 ? Math.min(100, Math.round((done * 100) / total)) : 0);
    const hasBar = $derived(total > 0);

    function fmtBytes(n: number) {
        if (!n || n < 1024) return `${Math.max(0, Math.round(n || 0))} B`;
        if (n < 1024 ** 2) return `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB`;
        if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n >= 10 * 1024 ** 2 ? 0 : 1)} MB`;
        return `${(n / 1024 ** 3).toFixed(1)} GB`;
    }

    const stats = $derived.by(() => {
        if (!hasBar) return "";
        const parts: string[] = [`${done}/${total} (${pct}%)`];
        const got = Number(progress?.bytes) || 0;
        const want = Number(progress?.bytes_total) || 0;
        if (got || want) {
            parts.push(want ? `${fmtBytes(got)} / ${fmtBytes(want)}` : fmtBytes(got));
        }
        const rate = Number(progress?.rate_bps) || 0;
        if (rate >= 1024) parts.push(`${fmtBytes(rate)}/s`);
        const eta = Number(progress?.eta_s) || 0;
        if (eta > 0 && eta < 36 * 3600) {
            if (eta < 60) parts.push(`~${eta}s left`);
            else parts.push(`~${Math.round(eta / 60)} min left`);
        }
        const errs = Number(progress?.errors) || 0;
        if (errs) parts.push(`${errs} failed`);
        return parts.join(" · ");
    });
</script>

<div class="overflow-hidden rounded-md border border-border bg-zinc-950">
    {#if status || error}
        <div
            class="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5 font-mono text-[11px]"
        >
            <span class="text-zinc-400"
                >{status ? `job ${status}` : "job"}</span
            >
            {#if error}
                <span class="truncate text-red-400">{error}</span>
            {/if}
        </div>
    {/if}
    {#if progress?.usable}
        <p class="border-b border-white/10 px-3 py-1.5 font-mono text-[11px] text-emerald-300">
            Tables are available — photos still downloading.
        </p>
    {/if}
    {#if hasBar}
        <div class="space-y-1.5 border-b border-white/10 px-3 py-2">
            <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                    class="h-full rounded-full bg-emerald-400/90"
                    style="width: {pct}%"
                ></div>
            </div>
            <p class="font-mono text-[11px] text-zinc-300">{stats}</p>
            {#if progress?.current}
                <p class="truncate font-mono text-[11px] text-zinc-500">
                    {progress.current}
                </p>
            {/if}
        </div>
    {/if}
    <pre
        bind:this={scroller}
        class="max-h-56 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-400/90 whitespace-pre-wrap break-all"
    >{log?.trim() ? log : idle}</pre>
</div>
