<script lang="ts">
    import { untrack } from "svelte";
    import CopyIcon from "@lucide/svelte/icons/copy";
    import PlusIcon from "@lucide/svelte/icons/plus";
    import XIcon from "@lucide/svelte/icons/x";
    import PaletteIcon from "@lucide/svelte/icons/palette";
    import type { LayerData } from "./layerTypes";
    import {
        activeView,
        categorizedStyle,
        cloneStyle,
        cloneView,
        defaultStyle,
        defaultOpacityForPackets,
        distinctValues,
        hexToRgba,
        isPointLayer,
        newViewId,
        unusedCategoryColor,
        noneCategoryKey,
        rgbaAlpha,
        rgbaToHex,
        contrastColor,
        singleSymbolStyle,
        styleRenderer,
        styleableFields,
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
    const renderer = $derived(styleRenderer(current?.style));
    const catValues = $derived(
        current?.style.categoryField
            ? distinctValues(rows, current.style.categoryField)
            : [],
    );
    const dirty = $derived(
        draftActiveId !== (layer.activeViewId ?? "") ||
            JSON.stringify(draftViews) !== JSON.stringify(layer.views ?? []),
    );

    const inputCls =
        "h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground";

    function patchCurrent(mut: (v: LayerView) => LayerView) {
        if (!current || !canEdit) return;
        const id = current.id;
        draftViews = draftViews.map((v) => (v.id === id ? mut(cloneView(v)) : v));
    }

    function patchStyle(mut: (s: LayerStyle) => LayerStyle) {
        patchCurrent((v) => ({ ...v, style: mut(cloneStyle(v.style)) }));
    }

    function addView() {
        if (!canEdit) return;
        const src = current
            ? cloneView(current)
            : {
                  id: "",
                  name: "New view",
                  style: defaultStyle(layer.name),
                  filter: null,
              };
        src.id = newViewId();
        src.name = nextCopyName(src.name);
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
</script>

<div
    class="flex max-h-[min(70vh,32rem)] w-72 flex-col overflow-hidden rounded-lg border border-border bg-background/95 text-xs shadow-lg backdrop-blur-sm"
>
    <div class="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <PaletteIcon class="size-3.5 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
            <p
                class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
                Style
            </p>
            <p class="truncate font-medium">{layerDisplayName(layer.name)}</p>
        </div>
        <button
            type="button"
            class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Close"
            onclick={() => onClose?.()}
        >
            <XIcon class="size-3.5" />
        </button>
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        <div class="flex items-center gap-1">
            <select
                class="{inputCls} min-w-0 flex-1"
                value={draftActiveId}
                onchange={(e) =>
                    (draftActiveId = (e.currentTarget as HTMLSelectElement).value)}
            >
                {#each draftViews as v}
                    <option value={v.id}>{v.name}</option>
                {/each}
            </select>
            {#if canEdit}
                <button
                    type="button"
                    class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="New view"
                    onclick={addView}
                >
                    <PlusIcon class="size-3.5" />
                </button>
                <button
                    type="button"
                    class="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Duplicate view"
                    onclick={addView}
                    disabled={!current}
                >
                    <CopyIcon class="size-3.5" />
                </button>
            {/if}
        </div>

        {#if current}
            {#if current.source}
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Seed {current.source === "sld" ? "SLD" : "Default"}
                </p>
            {/if}

            {#if canEdit}
                <label class="block">
                    <span
                        class="text-[10px] uppercase tracking-wide text-muted-foreground"
                        >Name</span
                    >
                    <input
                        class="{inputCls} mt-0.5 w-full"
                        value={current.name}
                        onchange={(e) =>
                            rename((e.currentTarget as HTMLInputElement).value)}
                    />
                </label>
            {/if}

            <div class="flex gap-1">
                <button
                    type="button"
                    class="flex-1 rounded-md border px-1.5 py-1.5 {renderer === 'single'
                        ? 'border-primary bg-primary/10'
                        : 'border-border'}"
                    onclick={() => canEdit && setRenderer("single")}
                    disabled={!canEdit}
                >
                    Single
                </button>
                <button
                    type="button"
                    class="flex-1 rounded-md border px-1.5 py-1.5 {renderer ===
                    'categorized'
                        ? 'border-primary bg-primary/10'
                        : 'border-border'}"
                    onclick={() => canEdit && setRenderer("categorized")}
                    disabled={!canEdit || fields.length === 0}
                >
                    Categorized
                </button>
            </div>

            {#if renderer === "single"}
                <div class="grid grid-cols-2 gap-1.5">
                    <label class="flex items-center gap-1">
                        <span class="text-muted-foreground">Fill</span>
                        <input
                            type="color"
                            class="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
                            value={rgbaToHex(current.style.fillColor)}
                            disabled={!canEdit}
                            oninput={(e) =>
                                setFill((e.currentTarget as HTMLInputElement).value)}
                        />
                    </label>
                    <label class="flex items-center gap-1">
                        <span class="text-muted-foreground">Outline</span>
                        <span
                            class="h-6 w-8 rounded border border-border"
                            style="background: {rgbaToHex(
                                contrastColor(current.style.fillColor),
                            )}"
                            title="Auto: most contrast to fill"
                        ></span>
                    </label>
                    {#if !isPointLayer(layer.packets)}
                    <label class="flex items-center gap-1">
                        <span class="text-muted-foreground">Width</span>
                        <input
                            type="number"
                            min="0.5"
                            max="20"
                            step="0.5"
                            class="{inputCls} w-14"
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
                    <label class="flex items-center gap-1">
                        <span class="text-muted-foreground">Size</span>
                        <input
                            type="number"
                            min="2"
                            max="32"
                            step="1"
                            class="{inputCls} w-14"
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
                    <label class="col-span-2 flex items-center gap-1">
                        <span class="text-muted-foreground">Fill opacity</span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            class="min-w-0 flex-1"
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
                    <label class="col-span-2 flex items-center gap-1.5">
                        <input
                            type="checkbox"
                            checked={current.style.dash}
                            disabled={!canEdit}
                            onchange={(e) =>
                                patchStyle((s) => ({
                                    ...s,
                                    dash: (e.currentTarget as HTMLInputElement)
                                        .checked,
                                }))}
                        />
                        <span class="text-muted-foreground">Dashed lines</span>
                    </label>
                </div>
            {:else if current.style.categoryField}
                <label class="block">
                    <span
                        class="text-[10px] uppercase tracking-wide text-muted-foreground"
                        >Column</span
                    >
                    <select
                        class="{inputCls} mt-0.5 w-full"
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
                <div class="max-h-28 space-y-0.5 overflow-y-auto">
                    {#if current.style.categoryField}
                        {@const noneKey = noneCategoryKey(current.style.categoryField)}
                        <label class="flex items-center gap-1.5">
                            <input
                                type="color"
                                class="h-5 w-6 cursor-pointer rounded border border-border bg-transparent"
                                value={rgbaToHex(
                                    current.style.categories?.[noneKey] ??
                                        unusedCategoryColor(
                                            Object.entries(
                                                current.style.categories ?? {},
                                            )
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
                    {/if}
                    {#each catValues as val}
                        {@const key = `${current.style.categoryField}=${val}`}
                        <label class="flex items-center gap-1.5">
                            <input
                                type="color"
                                class="h-5 w-6 cursor-pointer rounded border border-border bg-transparent"
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
                        <p class="text-muted-foreground">No values</p>
                    {/each}
                </div>
            {/if}

            <div class="space-y-1 border-t border-border/60 pt-1.5">
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Filter
                </p>
                <div class="flex gap-1">
                    <select
                        class="{inputCls} min-w-0 flex-1"
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
                        class="{inputCls} w-[5.5rem]"
                        value={current.filter?.op ?? "contains"}
                        disabled={!canEdit || !current.filter}
                        onchange={(e) =>
                            setFilterOp(
                                (e.currentTarget as HTMLSelectElement)
                                    .value as LayerViewFilter["op"],
                            )}
                    >
                        <option value="contains">contains</option>
                        <option value="eq">equals</option>
                    </select>
                </div>
                <input
                    class="{inputCls} w-full"
                    placeholder="e.g. pottery"
                    value={current.filter?.value ?? ""}
                    disabled={!canEdit || !current.filter}
                    onchange={(e) =>
                        setFilterValue(
                            (e.currentTarget as HTMLInputElement).value,
                        )}
                />
            </div>
        {/if}

        <label class="flex items-center gap-1 border-t border-border/60 pt-1.5">
            <span class="text-muted-foreground">Opacity</span>
            <input
                type="range"
                min="0"
                max="100"
                class="min-w-0 flex-1"
                value={opacityPct()}
                oninput={(e) =>
                    onSetOpacity?.(
                        Number((e.currentTarget as HTMLInputElement).value) / 100,
                    )}
            />
            <span class="w-8 tabular-nums text-muted-foreground"
                >{opacityPct()}%</span
            >
        </label>
    </div>

    <div class="flex gap-1 border-t border-border p-2">
        <button
            type="button"
            class="flex-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            disabled={!dirty}
            onclick={loadFromLayer}
        >
            Discard
        </button>
        <button
            type="button"
            class="flex-1 rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground"
            onclick={apply}
        >
            Apply
        </button>
    </div>
</div>
