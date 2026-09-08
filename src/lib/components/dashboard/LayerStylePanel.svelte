<script lang="ts">
    import { untrack } from "svelte";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import XIcon from "@lucide/svelte/icons/x";
    import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
    import CheckIcon from "@lucide/svelte/icons/check";
    import { Button } from "$lib/components/ui/button/index.js";
    import type { LayerData } from "./layerTypes";
    import { COLOR_RAMPS, DEFAULT_COLOR_RAMP, rampCss } from "./colorRamps";
    import {
        activeView,
        categorizedStyle,
        cloneStyle,
        cloneView,
        continuousStyle,
        defaultStyle,
        defaultOpacityForPackets,
        distinctValues,
        hexToRgba,
        isPointLayer,
        newViewId,
        unusedCategoryColor,
        noneCategoryKey,
        numericFields,
        numericRange,
        rgbaAlpha,
        rgbaToHex,
        contrastColor,
        singleSymbolStyle,
        styleRenderer,
        styleableFields,
        DEFAULT_HEIGHT_FROM,
        DEFAULT_HEIGHT_TO,
        DEFAULT_CLUSTER_PIXEL_RANGE,
        layerHasPoints,
        resolveSeriesKind,
        seriesSteps,
        type LayerStyle,
        type LayerView,
        type LayerViewFilter,
        type SeriesKind,
        type StyleRenderer,
    } from "./layerViews";

    type Props = {
        layer: LayerData;
        rows?: Record<string, unknown>[];
        canEdit?: boolean;
        onClose?: () => void;
        applyViews?: (views: LayerView[], activeId: string) => void;
        onSetOpacity?: (value: number) => void;
    };

    type StyleSection =
        | "appearance"
        | "labels"
        | "clustering"
        | "series"
        | "height";

    let {
        layer,
        rows = [],
        canEdit = false,
        onClose,
        applyViews,
        onSetOpacity,
    }: Props = $props();

    let draftViews = $state<LayerView[]>([]);
    let draftActiveId = $state("");
    let syncedName = $state("");
    let viewOpen = $state(false);
    let viewWrap = $state<HTMLDivElement>();
    let section = $state<StyleSection>("appearance");

    function loadFromLayer() {
        draftViews = (layer.views ?? []).map(cloneView);
        draftActiveId = layer.activeViewId ?? draftViews[0]?.id ?? "";
        syncedName = layer.name;
    }

    function contentFingerprint(views: LayerView[]): string {
        return JSON.stringify(
            views.map((v) => ({ name: v.name, style: v.style, filter: v.filter })),
        );
    }

    $effect(() => {
        const views = layer.views ?? [];
        const name = layer.name;
        untrack(() => {
            if (name !== syncedName) {
                loadFromLayer();
                return;
            }
            const parentIds = views.map((v) => v.id).join("\0");
            const draftIds = draftViews.map((v) => v.id).join("\0");
            if (parentIds === draftIds) return;
            if (contentFingerprint(views) !== contentFingerprint(draftViews)) {
                return;
            }
            const idx = draftViews.findIndex((v) => v.id === draftActiveId);
            draftViews = views.map(cloneView);
            draftActiveId =
                (idx >= 0 ? views[idx]?.id : undefined) ??
                layer.activeViewId ??
                views[0]?.id ??
                "";
        });
    });

    $effect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key !== "Escape") return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            if (viewOpen) {
                viewOpen = false;
                return;
            }
            onClose?.();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    $effect(() => {
        if (!viewOpen) return;
        const onDoc = (ev: MouseEvent) => {
            if (viewWrap && !viewWrap.contains(ev.target as Node)) {
                viewOpen = false;
            }
        };
        const t = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", onDoc);
        };
    });

    const current = $derived(activeView(draftViews, draftActiveId));
    const fields = $derived(styleableFields(rows));
    const numbers = $derived(numericFields(rows));
    const renderer = $derived(styleRenderer(current?.style));
    const catValues = $derived(
        current?.style.categoryField
            ? distinctValues(rows, current.style.categoryField)
            : [],
    );
    const colorRange = $derived(
        current?.style.colorField
            ? numericRange(rows, current.style.colorField)
            : null,
    );
    const heightRange = $derived(
        current?.style.heightField
            ? numericRange(rows, current.style.heightField)
            : null,
    );
    const seriesKind = $derived(
        current?.style.seriesField
            ? resolveSeriesKind(current.style, rows)
            : null,
    );
    const seriesCount = $derived(
        current?.style.seriesField && seriesKind
            ? seriesSteps(rows, current.style.seriesField, seriesKind).length
            : 0,
    );
    const pointsOnly = $derived(isPointLayer(layer.packets));
    const hasPoints = $derived(layerHasPoints(layer.packets));
    const canHeight = $derived(
        (layer.packets ?? []).some((p) => p.point || p.polygon),
    );
    const dirty = $derived(
        draftActiveId !== (layer.activeViewId ?? "") ||
            JSON.stringify(draftViews) !== JSON.stringify(layer.views ?? []),
    );

    const fieldCls =
        "h-7 w-full rounded-[min(var(--radius-md),6px)] border border-input bg-background px-2 text-xs shadow-none outline-none disabled:opacity-50";
    const iconBtn =
        "rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
    const sectionLabel =
        "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
    const fieldLabel = "text-[10px] text-muted-foreground";
    const menuItem =
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-secondary";

    function patchCurrent(mut: (v: LayerView) => LayerView) {
        if (!current || !canEdit) return;
        const id = current.id;
        draftViews = draftViews.map((v) => (v.id === id ? mut(cloneView(v)) : v));
    }

    function patchStyle(mut: (s: LayerStyle) => LayerStyle) {
        patchCurrent((v) => ({ ...v, style: mut(cloneStyle(v.style)) }));
    }

    function addView(blank: boolean) {
        if (!canEdit) return;
        const src = !blank && current
            ? cloneView(current)
            : {
                  id: "",
                  name: "New view",
                  style: defaultStyle(layer.name),
                  filter: null,
              };
        src.id = newViewId();
        src.name = nextCopyName(blank ? "View" : src.name);
        src.source = undefined;
        draftViews = [...draftViews, src];
        draftActiveId = src.id;
    }

    function nextCopyName(name: string): string {
        const base = name.replace(/\s+copy(?:\s+\d+)?$/i, "").trim() || "View";
        const names = new Set(draftViews.map((v) => v.name));
        if (!names.has(`${base} copy`)) return `${base} copy`;
        let n = 2;
        while (names.has(`${base} copy ${n}`)) n += 1;
        return `${base} copy ${n}`;
    }

    function pickView(id: string) {
        draftActiveId = id;
        viewOpen = false;
    }

    function rename(name: string) {
        patchCurrent((v) => ({ ...v, name }));
    }

    function setRenderer(mode: StyleRenderer) {
        if (!current) return;
        if (mode === "single") {
            patchStyle((s) => singleSymbolStyle(s, layer.name));
            return;
        }
        if (mode === "continuous") {
            const field = current.style.colorField || numbers[0] || "";
            if (!field) return;
            patchStyle((s) =>
                continuousStyle(s, field, s.colorRamp || DEFAULT_COLOR_RAMP),
            );
            return;
        }
        const field = current.style.categoryField || fields[0] || "";
        if (!field) return;
        patchStyle((s) => categorizedStyle(s, field, distinctValues(rows, field)));
    }

    function setCategoryField(field: string) {
        patchStyle((s) => categorizedStyle(s, field, distinctValues(rows, field)));
    }

    function setFill(hex: string) {
        patchStyle((s) => {
            const fill = hexToRgba(hex, rgbaAlpha(s.fillColor));
            return { ...s, fillColor: fill, strokeColor: contrastColor(fill) };
        });
    }

    function setFillAlpha(pct: number) {
        const a = Math.round(Math.max(0, Math.min(100, pct)) * 2.55);
        patchStyle((s) => {
            const c = [...(s.fillColor ?? [230, 80, 80, 255])];
            c[3] = a;
            return { ...s, fillColor: c, strokeColor: contrastColor(c) };
        });
    }

    function setCatColor(key: string, hex: string) {
        patchStyle((s) => {
            const cats = { ...(s.categories ?? {}) };
            const prev = cats[key] ?? [230, 80, 80, 255];
            cats[key] = hexToRgba(hex, rgbaAlpha(prev));
            return { ...s, categories: cats };
        });
    }

    function setFilterField(field: string) {
        patchCurrent((v) => {
            if (!field) return { ...v, filter: null };
            const prev = v.filter;
            return {
                ...v,
                filter: {
                    field,
                    op: prev?.op ?? "contains",
                    value: prev?.value ?? "",
                },
            };
        });
    }

    function setFilterOp(op: LayerViewFilter["op"]) {
        patchCurrent((v) => {
            if (!v.filter) return v;
            return { ...v, filter: { ...v.filter, op } };
        });
    }

    function setFilterValue(value: string) {
        patchCurrent((v) => {
            if (!v.filter) {
                const field = fields[0] ?? "";
                if (!field) return v;
                return { ...v, filter: { field, op: "contains", value } };
            }
            return { ...v, filter: { ...v.filter, value } };
        });
    }

    function setSeriesField(field: string) {
        patchStyle((s) => ({
            ...s,
            seriesField: field || undefined,
            seriesKind: field ? s.seriesKind : undefined,
        }));
    }

    function setSeriesKind(kind: "" | SeriesKind) {
        patchStyle((s) => ({
            ...s,
            seriesKind: kind || undefined,
        }));
    }

    function apply() {
        applyViews?.(draftViews.map(cloneView), draftActiveId);
        syncedName = layer.name;
    }

    function opacityPct(): number {
        return Math.round(
            (layer.opacity ?? defaultOpacityForPackets(layer.packets)) * 100,
        );
    }

    function layerDisplayName(name: string): string {
        return name.replace(/_/g, " ");
    }

    const renderModes = $derived([
            { id: "single" as const, label: "Single", disabled: !canEdit },
            {
                id: "categorized" as const,
                label: "Categories",
                disabled: !canEdit || fields.length === 0,
            },
            {
                id: "continuous" as const,
                label: "Gradient",
                disabled: !canEdit || numbers.length === 0,
            },
        ]);

    const sections: { id: StyleSection; label: string }[] = [
        { id: "appearance", label: "Appearance" },
        { id: "labels", label: "Labels" },
        { id: "clustering", label: "Clustering" },
        { id: "series", label: "Time" },
        { id: "height", label: "Height" },
    ];
</script>

{#snippet colorDot(
    hex: string,
    disabled: boolean,
    onPick: (hex: string) => void,
    name: string,
)}
    <label
        class="relative inline-flex size-4 shrink-0 items-center justify-center {disabled
            ? 'cursor-default opacity-50'
            : 'cursor-pointer'}"
    >
        <span
            class="size-2.5 rounded-full border border-border/60"
            style="background: {hex}"
        ></span>
        <input
            type="color"
            class="absolute inset-0 opacity-0 {disabled
                ? 'pointer-events-none'
                : 'cursor-pointer'}"
            value={hex}
            {disabled}
            aria-label={name}
            title={name}
            oninput={(e) =>
                onPick((e.currentTarget as HTMLInputElement).value)}
        />
    </label>
{/snippet}

<div
    class="surface flex max-h-[min(78vh,40rem)] w-80 flex-col overflow-hidden rounded-lg border border-border text-xs shadow-lg"
>
    <div class="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <span class="min-w-0 flex-1 {sectionLabel}">Style</span>
        <span class="max-w-[9rem] truncate text-[10px] text-muted-foreground">
            {layerDisplayName(layer.name)}
        </span>
        <button
            type="button"
            class={iconBtn}
            title="Close"
            onclick={() => onClose?.()}
        >
            <XIcon class="size-3.5" />
        </button>
    </div>

    {#if current}
        <div class="shrink-0 space-y-1 border-b border-border px-2 py-1.5">
            <div class="flex items-center gap-0.5">
                <div class="relative min-w-0 flex-1" bind:this={viewWrap}>
                    {#if canEdit}
                        <input
                            class="{fieldCls} {draftViews.length > 1
                                ? 'pr-6'
                                : ''}"
                            value={current.name}
                            aria-label="Style name"
                            onchange={(e) =>
                                rename(
                                    (e.currentTarget as HTMLInputElement).value,
                                )}
                        />
                    {:else if draftViews.length > 1}
                        <select
                            class={fieldCls}
                            value={draftActiveId}
                            aria-label="Style"
                            onchange={(e) =>
                                pickView(
                                    (e.currentTarget as HTMLSelectElement).value,
                                )}
                        >
                            {#each draftViews as v (v.id)}
                                <option value={v.id}>{v.name}</option>
                            {/each}
                        </select>
                    {:else}
                        <p class="truncate px-0.5 py-1.5">{current.name}</p>
                    {/if}
                    {#if canEdit && draftViews.length > 1}
                        <button
                            type="button"
                            class="{iconBtn} absolute top-1/2 right-0.5 -translate-y-1/2"
                            title="Switch style"
                            aria-haspopup="listbox"
                            aria-expanded={viewOpen}
                            onclick={() => (viewOpen = !viewOpen)}
                        >
                            <ChevronDownIcon
                                class="size-3.5 transition-transform {viewOpen
                                    ? 'rotate-180'
                                    : ''}"
                            />
                        </button>
                    {/if}
                    {#if viewOpen && canEdit}
                        <div
                            class="surface absolute top-[calc(100%+0.25rem)] right-0 left-0 z-30 flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg border border-border p-1 shadow-lg"
                            role="listbox"
                        >
                            {#each draftViews as v (v.id)}
                                <button
                                    type="button"
                                    class="{menuItem} {v.id === draftActiveId
                                        ? 'selected'
                                        : ''}"
                                    role="option"
                                    aria-selected={v.id === draftActiveId}
                                    onclick={() => pickView(v.id)}
                                >
                                    <span class="min-w-0 flex-1 truncate"
                                        >{v.name}</span
                                    >
                                    {#if v.id === draftActiveId}
                                        <CheckIcon
                                            class="size-3 shrink-0 text-foreground"
                                        />
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
                {#if canEdit}
                    <button
                        type="button"
                        class={iconBtn}
                        title="New style"
                        onclick={() => addView(true)}
                    >
                        <PlusIcon class="size-3.5" />
                    </button>
                    <button
                        type="button"
                        class={iconBtn}
                        title="Duplicate style"
                        onclick={() => addView(false)}
                        disabled={!current}
                    >
                        <CopyIcon class="size-3.5" />
                    </button>
                {/if}
            </div>
            {#if current.source}
                <p class="text-[10px] text-muted-foreground">
                    Seeded from {current.source === "sld" ? "SLD" : "defaults"}
                </p>
            {/if}
        </div>
    {/if}

    <div class="shrink-0 px-2 pt-2">
        <div
            class="flex items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1.5"
            role="tablist"
            aria-label="Style sections"
        >
            {#each sections as s (s.id)}
                <button
                    type="button"
                    role="tab"
                    aria-selected={section === s.id}
                    class="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-all hover:text-foreground {section ===
                    s.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground'}"
                    onclick={() => (section = s.id)}
                >
                    {s.label}
                </button>
            {/each}
        </div>
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {#if current}
            {#if section === "appearance"}
            <div class="space-y-2">
                <div
                    class="flex items-center overflow-hidden rounded-md border border-border"
                >
                    {#each renderModes as mode, i (mode.id)}
                        <button
                            type="button"
                            class="flex-1 px-1.5 py-1.5 transition-colors {i > 0
                                ? 'border-l border-border'
                                : ''} {renderer === mode.id
                                ? 'bg-secondary font-medium text-foreground'
                                : 'text-muted-foreground hover:text-foreground'} disabled:opacity-40"
                            onclick={() => canEdit && setRenderer(mode.id)}
                            disabled={mode.disabled}
                        >
                            {mode.label}
                        </button>
                    {/each}
                </div>

            {#if renderer === "single"}
                <div class="space-y-2">
                    <div class="flex items-center justify-between gap-3">
                        <span class={fieldLabel}>Fill</span>
                        {@render colorDot(
                            rgbaToHex(current.style.fillColor),
                            !canEdit,
                            setFill,
                            "Fill",
                        )}
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <span class={fieldLabel}>Outline</span>
                        <span
                            class="size-2.5 shrink-0 rounded-full border border-border/60"
                            style="background: {rgbaToHex(
                                contrastColor(current.style.fillColor),
                            )}"
                            title="Auto contrast"
                        ></span>
                    </div>
                    {#if !pointsOnly}
                        <label class="flex items-center justify-between gap-3">
                            <span class={fieldLabel}>Width</span>
                            <input
                                type="number"
                                min="0.5"
                                max="20"
                                step="0.5"
                                class="{fieldCls} w-16"
                                value={current.style.strokeWidth}
                                disabled={!canEdit}
                                onchange={(e) => {
                                    const n = Number(
                                        (e.currentTarget as HTMLInputElement).value,
                                    );
                                    if (Number.isFinite(n)) {
                                        patchStyle((s) => ({ ...s, strokeWidth: n }));
                                    }
                                }}
                            />
                        </label>
                    {/if}
                    {#if pointsOnly}
                        <label class="flex items-center justify-between gap-3">
                            <span class={fieldLabel}>Size</span>
                            <input
                                type="number"
                                min="2"
                                max="32"
                                step="1"
                                class="{fieldCls} w-16"
                                value={current.style.pointSize}
                                disabled={!canEdit}
                                onchange={(e) => {
                                    const n = Number(
                                        (e.currentTarget as HTMLInputElement).value,
                                    );
                                    if (Number.isFinite(n)) {
                                        patchStyle((s) => ({ ...s, pointSize: n }));
                                    }
                                }}
                            />
                        </label>
                    {/if}
                    <label class="block space-y-1">
                        <div class="flex justify-between {fieldLabel}">
                            <span>Fill opacity</span>
                            <span class="tabular-nums"
                                >{Math.round(
                                    (rgbaAlpha(current.style.fillColor) / 255) * 100,
                                )}%</span
                            >
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            class="w-full"
                            value={Math.round(
                                (rgbaAlpha(current.style.fillColor) / 255) * 100,
                            )}
                            disabled={!canEdit}
                            oninput={(e) =>
                                setFillAlpha(
                                    Number((e.currentTarget as HTMLInputElement).value),
                                )}
                        />
                    </label>
                    {#if !pointsOnly}
                        <label class="flex items-center gap-1.5">
                            <input
                                type="checkbox"
                                class="size-3.5 rounded border-input"
                                checked={current.style.dash}
                                disabled={!canEdit}
                                onchange={(e) =>
                                    patchStyle((s) => ({
                                        ...s,
                                        dash: (e.currentTarget as HTMLInputElement)
                                            .checked,
                                    }))}
                            />
                            Dashed lines
                        </label>
                    {/if}
                </div>
            {:else if renderer === "categorized" && current.style.categoryField}
                {@const noneKey = noneCategoryKey(current.style.categoryField)}
                <label class="block space-y-1">
                    <span class={fieldLabel}>Column</span>
                    <select
                        class={fieldCls}
                        value={current.style.categoryField}
                        disabled={!canEdit}
                        onchange={(e) =>
                            setCategoryField(
                                (e.currentTarget as HTMLSelectElement).value,
                            )}
                    >
                        {#each fields as f (f)}
                            <option value={f}>{f}</option>
                        {/each}
                    </select>
                </label>
                <div class="max-h-36 space-y-0.5 overflow-y-auto">
                    <div class="flex min-w-0 items-center gap-1.5 px-0.5 py-0.5">
                        {@render colorDot(
                            rgbaToHex(
                                current.style.categories?.[noneKey] ??
                                    unusedCategoryColor(
                                        Object.entries(current.style.categories ?? {})
                                            .filter(([k]) => k !== noneKey)
                                            .map(([, c]) => c),
                                        `${current.style.categoryField}:none`,
                                    ),
                            ),
                            !canEdit,
                            (hex) => setCatColor(noneKey, hex),
                            "No value",
                        )}
                        <span class="truncate text-muted-foreground">No value</span>
                    </div>
                    {#each catValues as val (val)}
                        {@const key = `${current.style.categoryField}=${val}`}
                        <div class="flex min-w-0 items-center gap-1.5 px-0.5 py-0.5">
                            {@render colorDot(
                                rgbaToHex(current.style.categories?.[key]),
                                !canEdit,
                                (hex) => setCatColor(key, hex),
                                val,
                            )}
                            <span class="truncate">{val}</span>
                        </div>
                    {:else}
                        <p class="px-0.5 text-[10px] text-muted-foreground">No values</p>
                    {/each}
                </div>
            {:else if renderer === "continuous"}
                <label class="block space-y-1">
                    <span class={fieldLabel}>Color by</span>
                    <select
                        class={fieldCls}
                        value={current.style.colorField ?? ""}
                        disabled={!canEdit}
                        onchange={(e) => {
                            const field = (e.currentTarget as HTMLSelectElement)
                                .value;
                            if (field) {
                                patchStyle((s) =>
                                    continuousStyle(
                                        s,
                                        field,
                                        s.colorRamp || DEFAULT_COLOR_RAMP,
                                    ),
                                );
                            }
                        }}
                    >
                        {#each numbers as f (f)}
                            <option value={f}>{f}</option>
                        {/each}
                    </select>
                </label>
                <label class="block space-y-1">
                    <span class={fieldLabel}>Ramp</span>
                    <select
                        class={fieldCls}
                        value={current.style.colorRamp ?? DEFAULT_COLOR_RAMP}
                        disabled={!canEdit}
                        onchange={(e) =>
                            patchStyle((s) => ({
                                ...s,
                                colorRamp: (e.currentTarget as HTMLSelectElement)
                                    .value,
                            }))}
                    >
                        {#each COLOR_RAMPS as ramp (ramp.id)}
                            <option value={ramp.id}>{ramp.label}</option>
                        {/each}
                    </select>
                    <div
                        class="h-1.5 rounded-full border border-border/50"
                        style="background: {rampCss(
                            current.style.colorRamp,
                            Boolean(current.style.colorRampReverse),
                        )}"
                    ></div>
                    {#if colorRange}
                        <p class="text-[10px] tabular-nums text-muted-foreground">
                            {colorRange.min} – {colorRange.max}
                        </p>
                    {/if}
                </label>
                <label class="flex items-center gap-1.5">
                    <input
                        type="checkbox"
                        class="size-3.5 rounded border-input"
                        checked={Boolean(current.style.colorRampReverse)}
                        disabled={!canEdit}
                        onchange={(e) =>
                            patchStyle((s) => ({
                                ...s,
                                colorRampReverse: (e.currentTarget as HTMLInputElement)
                                    .checked,
                            }))}
                    />
                    Reverse ramp
                </label>
            {/if}

                <label class="block space-y-1">
                    <span class={fieldLabel}>Filter</span>
                    <div class="grid grid-cols-[1fr_auto] gap-1.5">
                        <select
                            class={fieldCls}
                            value={current.filter?.field ?? ""}
                            disabled={!canEdit}
                            onchange={(e) =>
                                setFilterField(
                                    (e.currentTarget as HTMLSelectElement).value,
                                )}
                        >
                            <option value="">None</option>
                            {#each fields as f (f)}
                                <option value={f}>{f}</option>
                            {/each}
                        </select>
                        <select
                            class="{fieldCls} w-[6.5rem]"
                            value={current.filter?.op ?? "contains"}
                            disabled={!canEdit || !current.filter}
                            onchange={(e) =>
                                setFilterOp(
                                    (e.currentTarget as HTMLSelectElement)
                                        .value as LayerViewFilter["op"],
                                )}
                        >
                            <option value="contains">Contains</option>
                            <option value="eq">Equals</option>
                        </select>
                    </div>
                    <input
                        class={fieldCls}
                        placeholder="Value"
                        value={current.filter?.value ?? ""}
                        disabled={!canEdit || !current.filter}
                        onchange={(e) =>
                            setFilterValue(
                                (e.currentTarget as HTMLInputElement).value,
                            )}
                    />
                </label>
                <label class="block space-y-1">
                    <div class="flex justify-between {fieldLabel}">
                        <span>Layer opacity</span>
                        <span class="tabular-nums">{opacityPct()}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        class="w-full"
                        value={opacityPct()}
                        oninput={(e) =>
                            onSetOpacity?.(
                                Number((e.currentTarget as HTMLInputElement).value) /
                                    100,
                            )}
                    />
                </label>
            </div>
            {:else if section === "labels"}
                <p class="text-[10px] text-muted-foreground">Not yet</p>
            {:else if section === "clustering"}
                {#if hasPoints}
                    <div class="space-y-2">
                    <label class="flex items-center gap-1.5">
                        <input
                            type="checkbox"
                            class="size-3.5 rounded border-input"
                            checked={Boolean(current.style.cluster)}
                            disabled={!canEdit}
                            onchange={(e) =>
                                patchStyle((s) => {
                                    const cluster = (
                                        e.currentTarget as HTMLInputElement
                                    ).checked;
                                    if (!cluster) {
                                        return {
                                            ...s,
                                            cluster: undefined,
                                        };
                                    }
                                    return {
                                        ...s,
                                        cluster: true,
                                        clusterPixelRange:
                                            s.clusterPixelRange &&
                                            s.clusterPixelRange > 0
                                                ? s.clusterPixelRange
                                                : DEFAULT_CLUSTER_PIXEL_RANGE,
                                    };
                                })}
                        />
                        Group nearby points
                    </label>
                    {#if current.style.cluster}
                        <label class="block space-y-1">
                            <div class="flex justify-between {fieldLabel}">
                                <span>Radius</span>
                                <span class="tabular-nums"
                                    >{current.style.clusterPixelRange ??
                                        DEFAULT_CLUSTER_PIXEL_RANGE} px</span
                                >
                            </div>
                            <input
                                type="range"
                                min="24"
                                max="160"
                                class="w-full"
                                value={current.style.clusterPixelRange ??
                                    DEFAULT_CLUSTER_PIXEL_RANGE}
                                disabled={!canEdit}
                                oninput={(e) =>
                                    patchStyle((s) => ({
                                        ...s,
                                        clusterPixelRange: Number(
                                            (e.currentTarget as HTMLInputElement)
                                                .value,
                                        ),
                                    }))}
                            />
                        </label>
                    {/if}
                    </div>
                {:else}
                    <p class="text-[10px] text-muted-foreground">
                        No points on this layer.
                    </p>
                {/if}
            {:else if section === "series"}
                <div class="space-y-2">
                <label class="block space-y-1">
                    <span class={fieldLabel}>Field</span>
                    <select
                        class={fieldCls}
                        value={current.style.seriesField ?? ""}
                        disabled={!canEdit}
                        onchange={(e) =>
                            setSeriesField(
                                (e.currentTarget as HTMLSelectElement).value,
                            )}
                    >
                        <option value="">None</option>
                        {#each fields as f (f)}
                            <option value={f}>{f}</option>
                        {/each}
                    </select>
                </label>
                {#if current.style.seriesField}
                    <label class="block space-y-1">
                        <span class={fieldLabel}>Values</span>
                        <select
                            class={fieldCls}
                            value={current.style.seriesKind ?? ""}
                            disabled={!canEdit}
                            onchange={(e) =>
                                setSeriesKind(
                                    (e.currentTarget as HTMLSelectElement)
                                        .value as "" | SeriesKind,
                                )}
                        >
                            <option value="">Auto ({seriesKind === "date" ? "dates" : "phases"})</option>
                            <option value="date">Dates</option>
                            <option value="category">Phases</option>
                        </select>
                    </label>
                    <p class="text-[10px] text-muted-foreground">
                        Scrub this column on the map.
                        {#if seriesCount > 0}
                            {seriesCount} {seriesCount === 1 ? "step" : "steps"}.
                        {/if}
                        Rows without a value skip that step.
                    </p>
                {/if}
                </div>
            {:else if section === "height"}
                {#if canHeight && numbers.length > 0}
                    <div class="space-y-2">
                    <label class="block space-y-1">
                        <span class={fieldLabel}>Field</span>
                        <select
                            class={fieldCls}
                            value={current.style.heightField ?? ""}
                            disabled={!canEdit}
                            onchange={(e) => {
                                const field = (
                                    e.currentTarget as HTMLSelectElement
                                ).value;
                                patchStyle((s) => ({
                                    ...s,
                                    heightField: field || undefined,
                                }));
                            }}
                        >
                            <option value="">None</option>
                            {#each numbers as f (f)}
                                <option value={f}>{f}</option>
                            {/each}
                        </select>
                    </label>
                    {#if current.style.heightField}
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block space-y-1">
                                <span class={fieldLabel}>Low (m)</span>
                                <input
                                    type="number"
                                    class={fieldCls}
                                    value={current.style.heightFrom ??
                                        DEFAULT_HEIGHT_FROM}
                                    disabled={!canEdit}
                                    onchange={(e) => {
                                        const n = Number(
                                            (e.currentTarget as HTMLInputElement)
                                                .value,
                                        );
                                        if (Number.isFinite(n)) {
                                            patchStyle((s) => ({
                                                ...s,
                                                heightFrom: n,
                                            }));
                                        }
                                    }}
                                />
                            </label>
                            <label class="block space-y-1">
                                <span class={fieldLabel}>High (m)</span>
                                <input
                                    type="number"
                                    class={fieldCls}
                                    value={current.style.heightTo ?? DEFAULT_HEIGHT_TO}
                                    disabled={!canEdit}
                                    onchange={(e) => {
                                        const n = Number(
                                            (e.currentTarget as HTMLInputElement)
                                                .value,
                                        );
                                        if (Number.isFinite(n)) {
                                            patchStyle((s) => ({
                                                ...s,
                                                heightTo: n,
                                            }));
                                        }
                                    }}
                                />
                            </label>
                        </div>
                        {#if heightRange}
                            <p class="text-[10px] text-muted-foreground">
                                {pointsOnly
                                    ? "Raises points by this range."
                                    : "Extrudes polygons; raises points."}
                                Data {heightRange.min} – {heightRange.max}
                            </p>
                        {/if}
                    {/if}
                    </div>
                {:else}
                    <p class="text-[10px] text-muted-foreground">
                        No numeric fields to extrude.
                    </p>
                {/if}
            {/if}
        {/if}
    </div>

    <div class="flex shrink-0 justify-end gap-1.5 border-t border-border p-2">
        <Button
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onclick={loadFromLayer}
        >
            Discard
        </Button>
        <Button size="sm" onclick={apply}>Apply</Button>
    </div>
</div>
