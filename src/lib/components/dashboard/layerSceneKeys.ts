/**
 * Keyboard dispatch for LayerScene tool rails.
 * Scene state stays in the component; this module owns the action table.
 */
import { measureHint } from "$lib/measure";
import type { MeasureMode } from "$lib/measure";
import type { DrawGeomMode } from "$lib/stores/editBuffer.svelte";
import type { SelectionToolMode } from "$lib/stores/layerSelection.svelte";
import { mapToolShortcut } from "./mapShortcuts";

export type SceneKeyCtx = {
    anyFormOpen: boolean;
    canWrite: boolean;
    active: boolean;
    presenceMember: boolean;
    dim: "2d" | "3d";
    editEnabled: boolean;
    measureEnabled: boolean;
    commentsEnabled: boolean;
    commentCanFinishSketch: boolean;
    vertexSession: boolean;
    drawVertexCount: number;
    drawPartCount: number;
    selectedVertexCount: number;
    attrEdit: boolean;
    createFormOpen: boolean;
    ctxOpen: boolean;
    pickOpen: boolean;
    stylePanelOpen: boolean;
    isolating: boolean;
    commentSketchCount: number;
    pendingComment: boolean;
    commentAdding: boolean;
    selectedCommentId: boolean;
    editLayer: boolean;
    measureMode: MeasureMode;
    onEnterInEdit: () => void;
    finishCommentSketch: () => void;
    finishDraft3d: () => void;
    undoDrawOrMeasure: () => void;
    popLastDrawVertex: () => void;
    deleteSelectedVertices: () => void;
    deleteSelectedFeatures: () => void;
    cancelAttrEdit: () => void;
    cancelCreate: () => void;
    cancelVertexMarquee: () => boolean;
    clearVertexSelection: () => void;
    cancelVertexEdit: () => void;
    clearDraftDraw: () => void;
    paintDraftDraw: () => void;
    exitEditMode: () => void;
    clearDraftMeasure: () => void;
    clearCommentSketch: () => void;
    stopCommentAdd: () => void;
    clearCommentSelection: () => void;
    closePickPager: () => void;
    closeStylePanel: () => void;
    exitIsolateUi: () => void;
    clearSelection: () => void;
    flyToSelection: () => void;
    flyHome: () => void;
    isolateSelected: () => void;
    applyHiddenVisibility: () => void;
    layerFromSelection: () => unknown;
    enterEditMode: () => void;
    setDrawMode: (mode: DrawGeomMode) => void;
    setSelectionTool: (mode: SelectionToolMode) => void;
    setMeasureEnabled: (on: boolean) => void;
    setCommentsEnabled: (on: boolean) => void;
    setEditEnabled: (on: boolean) => void;
    setMeasureMode: (mode: MeasureMode) => void;
    setMeasureStatus: (msg: string) => void;
    clearPendingComment: () => void;
};

const DRAW_FROM_MEASURE: Record<string, DrawGeomMode> = {
    point: "Point",
    length: "LineString",
    area: "Polygon",
};

export function handleSceneKey(ev: KeyboardEvent, ctx: SceneKeyCtx): void {
    const action = mapToolShortcut(ev);
    if (!action) return;

    if (action.type === "enter") {
        if (ctx.anyFormOpen) return;
        if (ctx.editEnabled) {
            ev.preventDefault();
            ctx.onEnterInEdit();
            return;
        }
        if (ctx.commentCanFinishSketch) {
            ev.preventDefault();
            ctx.finishCommentSketch();
            return;
        }
        if (ctx.measureEnabled) {
            ev.preventDefault();
            ctx.finishDraft3d();
        }
        return;
    }
    if (action.type === "undo") {
        ev.preventDefault();
        ctx.undoDrawOrMeasure();
        return;
    }
    if (action.type === "delete-feature") {
        if (!ctx.canWrite || !ctx.active) return;
        ev.preventDefault();
        if (ctx.anyFormOpen) return;
        if (!ctx.editEnabled) return;
        if (
            !ctx.vertexSession &&
            (ctx.drawVertexCount > 0 || ctx.drawPartCount > 0)
        ) {
            ctx.popLastDrawVertex();
            return;
        }
        if (ctx.vertexSession && ctx.selectedVertexCount > 0) {
            ctx.deleteSelectedVertices();
            return;
        }
        ctx.deleteSelectedFeatures();
        return;
    }
    if (action.type === "escape") {
        if (ctx.attrEdit) {
            ev.preventDefault();
            ctx.cancelAttrEdit();
            return;
        }
        if (ctx.createFormOpen) {
            ev.preventDefault();
            ctx.cancelCreate();
            return;
        }
        if (ctx.editEnabled) {
            if (ctx.cancelVertexMarquee()) {
                ev.preventDefault();
                return;
            }
            if (ctx.vertexSession) {
                if (ctx.selectedVertexCount > 0) {
                    ev.preventDefault();
                    ctx.clearVertexSelection();
                    return;
                }
                ev.preventDefault();
                ctx.cancelVertexEdit();
                return;
            }
            if (ctx.drawVertexCount > 0 || ctx.drawPartCount > 0) {
                ctx.clearDraftDraw();
                ctx.paintDraftDraw();
                return;
            }
            ctx.exitEditMode();
            return;
        }
        if (ctx.measureEnabled) {
            ctx.clearDraftMeasure();
            ctx.setMeasureStatus(
                measureHint(ctx.measureMode, ctx.dim === "2d" ? "2d" : "3d"),
            );
            return;
        }
        if (ctx.commentsEnabled) {
            ev.preventDefault();
            if (ctx.commentSketchCount > 0) {
                ctx.clearCommentSketch();
                return;
            }
            if (ctx.pendingComment) {
                ctx.clearPendingComment();
                return;
            }
            if (ctx.commentAdding) {
                ctx.stopCommentAdd();
                return;
            }
            if (ctx.selectedCommentId) {
                ctx.clearCommentSelection();
                return;
            }
            ctx.setCommentsEnabled(false);
            return;
        }
        if (ctx.ctxOpen) return;
        if (ctx.pickOpen) {
            ctx.closePickPager();
            return;
        }
        if (ctx.stylePanelOpen) {
            ctx.closeStylePanel();
            return;
        }
        if (ctx.isolating) {
            ctx.exitIsolateUi();
            return;
        }
        ctx.clearSelection();
        return;
    }
    if (action.type === "fly-to") {
        ev.preventDefault();
        ctx.flyToSelection();
        return;
    }
    if (action.type === "home") {
        ev.preventDefault();
        ctx.flyHome();
        return;
    }
    if (action.type === "isolate") {
        ev.preventDefault();
        ctx.isolateSelected();
        ctx.applyHiddenVisibility();
        return;
    }
    if (action.type === "exit-isolate") {
        ev.preventDefault();
        ctx.exitIsolateUi();
        return;
    }
    if (action.type === "select-tool") {
        ev.preventDefault();
        ctx.setSelectionTool(action.mode);
        return;
    }
    if (action.type === "measure-toggle") {
        ev.preventDefault();
        if (ctx.editEnabled) ctx.exitEditMode();
        const next = !ctx.measureEnabled;
        ctx.setMeasureEnabled(next);
        if (next) ctx.setCommentsEnabled(false);
        return;
    }
    if (action.type === "comments-toggle") {
        if (!ctx.presenceMember) return;
        ev.preventDefault();
        if (ctx.editEnabled) ctx.exitEditMode();
        const next = !ctx.commentsEnabled;
        ctx.setCommentsEnabled(next);
        if (next) ctx.setMeasureEnabled(false);
        else ctx.stopCommentAdd();
        return;
    }
    if (action.type === "edit-toggle") {
        if (ctx.anyFormOpen) return;
        if (ctx.editEnabled) {
            ev.preventDefault();
            ctx.exitEditMode();
            return;
        }
        if (!ctx.canWrite || !ctx.active) return;
        if (!ctx.editLayer && !ctx.layerFromSelection()) return;
        ev.preventDefault();
        ctx.enterEditMode();
        return;
    }
    if (action.type === "measure-mode") {
        ev.preventDefault();
        if (ctx.editEnabled) {
            const next = DRAW_FROM_MEASURE[action.mode];
            if (next) ctx.setDrawMode(next);
            return;
        }
        ctx.setMeasureMode(action.mode);
        ctx.setMeasureEnabled(true);
        ctx.setEditEnabled(false);
        ctx.setCommentsEnabled(false);
    }
}
