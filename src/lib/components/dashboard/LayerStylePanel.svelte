<script lang="ts">
    import { untrack } from "svelte";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import XIcon from "@lucide/svelte/icons/x";
    import PaletteIcon from "@lucide/svelte/icons/palette";
    import { Button } from "$lib/components/ui/button/index.js";
    import { Separator } from "$lib/components/ui/separator/index.js";
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
        type LayerStyle,
        type LayerView,
        type LayerViewFilter,
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
            onClose?.();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
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
        "h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none dark:bg-input/30 disabled:opacity-50";

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
</script>

<div
    class="flex max-h-[min(78vh,40rem)] w-[22rem] flex-col overflow-hidden rounded-xl border border-border bg-background text-sm shadow-lg"
>
    <div class="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <PaletteIcon class="size-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
            <p class="text-sm font-medium leading-none">Style</p>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">
                {layerDisplayName(layer.name)}
            </p>
        </div>
        <Button
            variant="ghost"
            size="icon-xs"
            title="Close"
            onclick={() => onClose?.()}
        >
            <XIcon />
        </Button>
    </div>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <div class="flex items-center gap-1.5">
            <select
                class="{fieldCls} min-w-0 flex-1"
                value={draftActiveId}
                onchange={(e) =>
                    (draftActiveId = (e.currentTarget as HTMLSelectElement).value)}
            >
                {#each draftViews as v}
                    <option value={v.id}>{v.name}</option>
                {/each}
            </select>
            {#if canEdit}
                <Button
                    variant="outline"
                    size="icon-xs"
                    title="New view"
                    onclick={() => addView(true)}
                >
                    <PlusIcon />
                </Button>
                <Button
                    variant="outline"
                    size="icon-xs"
                    title="Duplicate view"
                    onclick={() => addView(false)}
                    disabled={!current}
                >
                    <CopyIcon />
                </Button>
            {/if}
        </div>

        {#if current}
            {#if canEdit}
                <label class="block space-y-1.5">
                    <span class="text-xs text-muted-foreground">Name</span>
                    <input
                        class={fieldCls}
                        value={current.name}
                        onchange={(e) =>
                            rename((e.currentTarget as HTMLInputElement).value)}
                    />
                </label>
            {/if}
            {#if current.source}
                <p class="text-xs text-muted-foreground">
                    Seeded from {current.source === "sld" ? "SLD" : "defaults"}
                </p>
            {/if}

            <div class="flex rounded-lg bg-muted p-0.5">
                {#each renderModes as mode}
                    <button
                        type="button"
                        class="flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors {renderer ===
                        mode.id
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'}"
                        onclick={() => canEdit && setRenderer(mode.id)}
                        disabled={mode.disabled}
                    >
                        {mode.label}
                    </button>
                {/each}
            </div>

            {#if renderer === "single"}
                <div class="space-y-3">
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-xs text-muted-foreground">Fill</span>
                        <input
                            type="color"
                            class="h-8 w-12 cursor-pointer rounded-md border border-border bg-transparent"
                            value={rgbaToHex(current.style.fillColor)}
                            disabled={!canEdit}
                            oninput={(e) =>
                                setFill((e.currentTarget as HTMLInputElement).value)}
                        />
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-xs text-muted-foreground">Outline</span>
                        <span
                            class="h-8 w-12 rounded-md border border-border"
                            style="background: {rgbaToHex(
                                contrastColor(current.style.fillColor),
                            )}"
                            title="Auto contrast"
                        ></span>
                    </div>
                    {#if !pointsOnly}
                        <label class="flex items-center justify-between gap-3">
                            <span class="text-xs text-muted-foreground">Width</span>
                            <input
                                type="number"
                                min="0.5"
                                max="20"
                                step="0.5"
                                class="{fieldCls} w-20"
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
                            <span class="text-xs text-muted-foreground">Size</span>
                            <input
                                type="number"
                                min="2"
                                max="32"
                                step="1"
                                class="{fieldCls} w-20"
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
                    <label class="block space-y-1.5">
                        <div class="flex justify-between text-xs text-muted-foreground">
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
                        <label class="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                class="size-4 rounded border-input"
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
                <label class="block space-y-1.5">
                    <span class="text-xs text-muted-foreground">Column</span>
                    <select
                        class={fieldCls}
                        value={current.style.categoryField}
                        disabled={!canEdit}
                        onchange={(e) =>
                            setCategoryField(
                                (e.currentTarget as HTMLSelectElement).value,
                            )}
                    >
                        {#each fields as f}
                            <option value={f}>{f}</option>
                        {/each}
                    </select>
                </label>
                <div class="max-h-36 space-y-1 overflow-y-auto">
                    <label class="flex items-center gap-2">
                        <input
                            type="color"
                            class="h-7 w-8 cursor-pointer rounded-md border border-border bg-transparent"
                            value={rgbaToHex(
                                current.style.categories?.[noneKey] ??
                                    unusedCategoryColor(
                                        Object.entries(current.style.categories ?? {})
                                            .filter(([k]) => k !== noneKey)
                                            .map(([, c]) => c),
                                        `${current.style.categoryField}:none`,
                                    ),
                            )}
                            disabled={!canEdit}
                            oninput={(e) =>
                                setCatColor(
                                    noneKey,
                                    (e.currentTarget as HTMLInputElement).value,
                                )}
                        />
                        <span class="truncate text-muted-foreground">No value</span>
                    </label>
                    {#each catValues as val}
                        {@const key = `${current.style.categoryField}=${val}`}
                        <label class="flex items-center gap-2">
                            <input
                                type="color"
                                class="h-7 w-8 cursor-pointer rounded-md border border-border bg-transparent"
                                value={rgbaToHex(current.style.categories?.[key])}
                                disabled={!canEdit}
                                oninput={(e) =>
                                    setCatColor(
                                        key,
                                        (e.currentTarget as HTMLInputElement).value,
                                    )}
                            />
                            <span class="truncate">{val}</span>
                        </label>
                    {:else}
                        <p class="text-xs text-muted-foreground">No values</p>
                    {/each}
                </div>
            {:else if renderer === "continuous"}
                <label class="block space-y-1.5">
                    <span class="text-xs text-muted-foreground">Color by</span>
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
                        {#each numbers as f}
                            <option value={f}>{f}</option>
                        {/each}
                    </select>
                </label>
                <label class="block space-y-1.5">
                    <span class="text-xs text-muted-foreground">Ramp</span>
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
                        {#each COLOR_RAMPS as ramp}
                            <option value={ramp.id}>{ramp.label}</option>
                        {/each}
                    </select>
                    <div
                        class="h-2.5 rounded-full border border-border/60"
                        style="background: {rampCss(
                            current.style.colorRamp,
                            Boolean(current.style.colorRampReverse),
                        )}"
                    ></div>
                    {#if colorRange}
                        <p class="text-xs tabular-nums text-muted-foreground">
                            {colorRange.min} – {colorRange.max}
                        </p>
                    {/if}
                </label>
                <label class="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        class="size-4 rounded border-input"
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

            {#if canHeight && numbers.length > 0}
                <Separator />
                <div class="space-y-3">
                    <p class="text-sm font-medium">Height</p>
                    <label class="block space-y-1.5">
                        <span class="text-xs text-muted-foreground">Field</span>
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
                            {#each numbers as f}
                                <option value={f}>{f}</option>
                            {/each}
                        </select>
                    </label>
                    {#if current.style.heightField}
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block space-y-1.5">
                                <span class="text-xs text-muted-foreground"
                                    >Low (m)</span
                                >
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
                            <label class="block space-y-1.5">
                                <span class="text-xs text-muted-foreground"
                                    >High (m)</span
                                >
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
                            <p class="text-xs text-muted-foreground">
                                {pointsOnly
                                    ? "Raises points by this range."
                                    : "Extrudes polygons; raises points."}
                                Data {heightRange.min} – {heightRange.max}
                            </p>
                        {/if}
                    {/if}
                </div>
            {/if}

            {#if hasPoints}
                <Separator />
                <div class="space-y-3">
                    <p class="text-sm font-medium">Cluster</p>
                    <label class="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            class="size-4 rounded border-input"
                            checked={Boolean(current.style.cluster)}
                            disabled={!canEdit}
                            onchange={(e) =>
                                patchStyle((s) => ({
                                    ...s,
                                    cluster: (e.currentTarget as HTMLInputElement)
                                        .checked
                                        ? true
                                        : undefined,
                                }))}
                        />
                        Group nearby points
                    </label>
                    {#if current.style.cluster}
                        <label class="block space-y-1.5">
                            <div
                                class="flex justify-between text-xs text-muted-foreground"
                            >
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
            {/if}

            <Separator />
            <div class="space-y-3">
                <p class="text-sm font-medium">Filter</p>
                <div class="grid grid-cols-[1fr_auto] gap-2">
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
                        {#each fields as f}
                            <option value={f}>{f}</option>
                        {/each}
                    </select>
                    <select
                        class="{fieldCls} w-[7.5rem]"
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
                        setFilterValue((e.currentTarget as HTMLInputElement).value)}
                />
            </div>
        {/if}

        <Separator />
        <label class="block space-y-1.5">
            <div class="flex justify-between text-xs text-muted-foreground">
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
                        Number((e.currentTarget as HTMLInputElement).value) / 100,
                    )}
            />
        </label>
    </div>

    <div class="flex gap-2 border-t border-border p-3">
        <Button
            variant="outline"
            size="sm"
            class="flex-1"
            disabled={!dirty}
            onclick={loadFromLayer}
        >
            Discard
        </Button>
        <Button size="sm" class="flex-1" onclick={apply}>Apply</Button>
    </div>
</div>
