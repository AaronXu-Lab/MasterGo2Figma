import { normalizeMasterGoSizeLimit } from "../../shared/layoutLimits";
import { state } from "./state";
import { safeSet, safeResize, isSceneNode, yieldToEventLoop } from "../../shared/utils";

const INTERNAL_PROPS_PREFIX = "[PROPS]";
const SIBLING_PROPS_PREFIX = "[PROPS_SIBLING]";
const POSTPROCESS_BATCH_SIZE = 500;
const POSTPROCESS_YIELD_INTERVAL_MS = 50;

type PostprocessProgressCallback = (done: number, total: number) => Promise<void> | void;

export function deferLayoutRestore(node: any, layout: any, isGroup: boolean) {
    if (!node || !layout || !isSceneNode(node)) return;
    state.deferredLayoutRestores.push({ node, layout, isGroup });
    if (isAutoSpaceAlongPrimaryAxis(layout)) {
        state.singleChildAutoSpaceCandidates.push(node);
    }
    if (state.activeRestoreStats) {
        state.activeRestoreStats.deferredLayoutNodeCount++;
    }
}

export async function applyDeferredLayoutRestores(progress?: PostprocessProgressCallback) {
    if (state.deferredLayoutRestores.length === 0) return;

    const records = state.deferredLayoutRestores;
    state.deferredLayoutRestores = [];
    refreshNativeGroupOffsets(records, state.nativeGroupOffsetByNodeId);
    const total = Math.max(1, records.length * 6);
    let done = 0;
    let lastYieldAt = Date.now();

    for (const record of records) {
        applyDeferredNodeAutoLayout(record);
        done++;
        lastYieldAt = await maybeYieldPostprocess(done, total, lastYieldAt, progress);
    }
    for (const record of records) {
        applyDeferredParentAutoLayout(record);
        done++;
        lastYieldAt = await maybeYieldPostprocess(done, total, lastYieldAt, progress);
    }
    for (const record of records) {
        finalizeDeferredAutoLayout(record);
        done++;
        lastYieldAt = await maybeYieldPostprocess(done, total, lastYieldAt, progress);
    }
    // Auto-layout activation temporarily changes parent bounds. Re-establish
    // source insets after all parent sizes settle, rather than preserving the
    // accidental stretch introduced while the tree was being assembled.
    for (const record of records) {
        restoreAbsoluteStretchBox(record);
        done++;
        lastYieldAt = await maybeYieldPostprocess(done, total, lastYieldAt, progress);
    }
    // Stretch correction can resize an inner fixed auto-layout frame through
    // Figma constraints. Reapply its explicit size (e.g. fixed-height bar rows).
    for (const record of records) {
        finalizeDeferredAutoLayout(record);
        done++;
        lastYieldAt = await maybeYieldPostprocess(done, total, lastYieldAt, progress);
    }
    for (const record of records) {
        restoreAbsoluteConstrainedPosition(record);
        done++;
        lastYieldAt = await maybeYieldPostprocess(done, total, lastYieldAt, progress);
    }
}

function isRemovedNode(node: any): boolean {
    return !node || !!node.removed;
}

export function normalizeLayoutMode(value: any): string {
    if (value === "ROW") return "HORIZONTAL";
    if (value === "COLUMN") return "VERTICAL";
    return value;
}

export function normalizeAxisAlign(value: any): string {
    if (value === "START" || value === "FLEX_START") return "MIN";
    if (value === "END" || value === "FLEX_END") return "MAX";
    if (value === "SPACING_BETWEEN") return "SPACE_BETWEEN";
    return value;
}

export function normalizeAxisSizingMode(value: any): string {
    if (value === "HUG") return "AUTO";
    if (value === "FILL") return "FIXED";
    return value;
}

export function normalizeLayoutAlign(value: any): string {
    if (value === "STRETCH" || value === "INHERIT") return value;
    return normalizeAxisAlign(value);
}

// MasterGo keeps the stored aligned box for labels extending left of their
// anchor even when marked AUTO; hugging away the space shifts the glyphs.
// Positive-positioned right-pinned containers must still hug.
export function preserveAbsoluteAlignedBox(layout: any): any {
    if (layout.layoutPositioning !== "ABSOLUTE" || !(layout.x < 0) ||
        normalizeAxisAlign(layout.primaryAxisAlignItems) !== "MAX" ||
        normalizeAxisSizingMode(layout.primaryAxisSizingMode) !== "AUTO") return layout;
    return { ...layout, primaryAxisSizingMode: "FIXED" };
}

function applyDeferredNodeAutoLayout(record: { node: SceneNode; layout: any; isGroup: boolean }) {
    const { node, isGroup } = record;
    const layout = preserveAbsoluteAlignedBox(record.layout);
    if (isRemovedNode(node) || isGroup || !("layoutMode" in node)) return;

    let applied = false;
    if (layout.layoutMode) {
        // Explicitly type parameter or read as string to avoid TS literal inference error
        safeSet(node, "layoutMode", normalizeLayoutMode(layout.layoutMode));
        applied = true;
    }

    for (const key of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
        const limit = normalizeMasterGoSizeLimit(layout[key]);
        if (limit !== undefined && key in node) safeSet(node, key, limit);
    }
    if (hasAutoLayout(node)) {
        if (layout.layoutWrap !== undefined) safeSet(node, "layoutWrap", layout.layoutWrap);
        if (layout.counterAxisSpacing !== undefined) safeSet(node, "counterAxisSpacing", layout.counterAxisSpacing);
        if (layout.primaryAxisSizingMode) {
            safeSet(node, "primaryAxisSizingMode", normalizeAxisSizingMode(layout.primaryAxisSizingMode));
            applied = true;
        }
        if (layout.counterAxisSizingMode) {
            safeSet(node, "counterAxisSizingMode", normalizeAxisSizingMode(layout.counterAxisSizingMode));
            applied = true;
        }
        if (layout.itemSpacing !== undefined) {
            safeSet(node, "itemSpacing", layout.itemSpacing);
            applied = true;
        }
        if (layout.paddingLeft !== undefined) {
            safeSet(node, "paddingLeft", layout.paddingLeft);
            applied = true;
        }
        if (layout.paddingRight !== undefined) {
            safeSet(node, "paddingRight", layout.paddingRight);
            applied = true;
        }
        if (layout.paddingTop !== undefined) {
            safeSet(node, "paddingTop", layout.paddingTop);
            applied = true;
        }
        if (layout.paddingBottom !== undefined) {
            safeSet(node, "paddingBottom", layout.paddingBottom);
            applied = true;
        }
        if (layout.primaryAxisAlignItems) {
            safeSet(node, "primaryAxisAlignItems", normalizeAxisAlign(layout.primaryAxisAlignItems));
            applied = true;
        }
        if (layout.counterAxisAlignItems) {
            safeSet(node, "counterAxisAlignItems", normalizeAxisAlign(layout.counterAxisAlignItems));
            applied = true;
        }
        if (layout.counterAxisAlignContent) {
            safeSet(node, "counterAxisAlignContent", layout.counterAxisAlignContent);
            applied = true;
        }
        if (layout.itemReverseZIndex !== undefined) {
            safeSet(node, "itemReverseZIndex", layout.itemReverseZIndex);
            applied = true;
        }
        if (layout.strokesIncludedInLayout !== undefined) {
            safeSet(node, "strokesIncludedInLayout", layout.strokesIncludedInLayout);
            applied = true;
        }
    }

    if (applied && state.activeRestoreStats) {
        state.activeRestoreStats.deferredLayoutAppliedCount++;
    }
}

function applyDeferredParentAutoLayout(record: { node: SceneNode; layout: any; isGroup: boolean }) {
    const { node, layout } = record;
    if (isRemovedNode(node) || !hasAutoLayoutParent(node)) return;

    let applied = false;
    if (layout.layoutPositioning) {
        safeSet(node, "layoutPositioning", layout.layoutPositioning);
        applied = true;
    }
    if (layout.layoutAlign) {
        safeSet(node, "layoutAlign", rotatedStretchSize(layout, node.parent) ? "INHERIT" : normalizeLayoutAlign(layout.layoutAlign));
        applied = true;
    }
    if (layout.layoutGrow !== undefined) {
        safeSet(node, "layoutGrow", layout.layoutGrow);
        applied = true;
    }
    const hasRelativeTransform = hasFiniteRelativeTransform(layout);
    if (hasRelativeTransform) {
        safeSet(node, "relativeTransform", layout.relativeTransform);
        applied = true;
    } else if (layout.x !== undefined) {
        safeSet(node, "x", layout.x);
        applied = true;
    }
    if (!hasRelativeTransform && layout.y !== undefined) {
        safeSet(node, "y", layout.y);
        applied = true;
    }

    if (applied && state.activeRestoreStats) {
        state.activeRestoreStats.deferredLayoutAppliedCount++;
    }
}

function finalizeDeferredAutoLayout(record: { node: SceneNode; layout: any; isGroup: boolean }) {
    const { node, isGroup } = record;
    if (isRemovedNode(node) || isGroup || !hasAutoLayout(node)) return;
    const layout = preserveAbsoluteAlignedBox(normalizeDeferredLayoutForNativeGroupParent(node, record.layout));
    if (layout.width === undefined || layout.height === undefined || !shouldRestoreFixedSize(node, layout)) return;

    const rotated = rotatedStretchSize(layout, node.parent);
    if (rotated) {
        safeSet(node, "layoutAlign", "INHERIT");
        safeSet(node, "primaryAxisSizingMode", "FIXED");
        safeSet(node, "counterAxisSizingMode", "FIXED");
        safeResize(node, rotated.width, rotated.height);
        return;
    }
    const mode = normalizeLayoutMode(layout.layoutMode || (node as any).layoutMode);
    const primaryFixed = normalizeAxisSizingMode(layout.primaryAxisSizingMode || (node as any).primaryAxisSizingMode) === "FIXED";
    const counterFixed = normalizeAxisSizingMode(layout.counterAxisSizingMode || (node as any).counterAxisSizingMode) === "FIXED";
    const horizontalPrimary = mode === "HORIZONTAL";
    const widthFixed = horizontalPrimary ? primaryFixed : counterFixed;
    const heightFixed = horizontalPrimary ? counterFixed : primaryFixed;
    // Resizing both dimensions turns a HUG axis into FIXED in Figma. Keep the
    // live HUG dimension and resize only the physical axis that is explicit.
    const parentMode = hasAutoLayoutParent(node) && layout.layoutPositioning !== "ABSOLUTE" ? (node.parent as any).layoutMode : "NONE";
    const fillWidth = (parentMode === "VERTICAL" && layout.layoutAlign === "STRETCH") || (parentMode === "HORIZONTAL" && layout.layoutGrow === 1);
    const fillHeight = (parentMode === "HORIZONTAL" && layout.layoutAlign === "STRETCH") || (parentMode === "VERTICAL" && layout.layoutGrow === 1);
    safeResize(node, widthFixed && !fillWidth ? layout.width : node.width, heightFixed && !fillHeight ? layout.height : node.height);
    if (layout.primaryAxisSizingMode) safeSet(node, "primaryAxisSizingMode", normalizeAxisSizingMode(layout.primaryAxisSizingMode));
    if (layout.counterAxisSizingMode) safeSet(node, "counterAxisSizingMode", normalizeAxisSizingMode(layout.counterAxisSizingMode));
    if (parentMode !== "NONE") {
        if (layout.layoutAlign !== undefined) safeSet(node, "layoutAlign", normalizeLayoutAlign(layout.layoutAlign));
        if (layout.layoutGrow !== undefined) safeSet(node, "layoutGrow", layout.layoutGrow);
    }
    if (hasFiniteRelativeTransform(layout)) {
        safeSet(node, "relativeTransform", layout.relativeTransform);
    } else {
        if (layout.x !== undefined) safeSet(node, "x", layout.x);
        if (layout.y !== undefined) safeSet(node, "y", layout.y);
    }
}

// MasterGo stretches a quarter-turned auto-layout child along its logical
// axis; Figma stretches its rotated bounding box. Resolve the logical size
// after the parent's fill width/height settles, then let HUG follow that box.
export function rotatedStretchSize(layout: any, parent: any): { width: number; height: number } | null {
    const m = layout.relativeTransform;
    if (layout.layoutAlign !== "STRETCH" || layout.layoutPositioning === "ABSOLUTE" ||
        !m || Math.abs(m[0][0]) > 1e-6 || Math.abs(m[1][1]) > 1e-6 ||
        Math.abs(Math.abs(m[0][1]) - 1) > 1e-6 || Math.abs(Math.abs(m[1][0]) - 1) > 1e-6 ||
        !Number.isFinite(layout.width) || !Number.isFinite(layout.height)) return null;
    if (parent?.layoutMode === "VERTICAL") {
        return { width: Math.max(0.01, parent.width - (parent.paddingLeft || 0) - (parent.paddingRight || 0)), height: layout.height };
    }
    if (parent?.layoutMode === "HORIZONTAL") {
        return { width: layout.width, height: Math.max(0.01, parent.height - (parent.paddingTop || 0) - (parent.paddingBottom || 0)) };
    }
    return null;
}

export function absoluteStretchSize(layout: any, parentLayout: any, parent: any, constraints: any) {
    // AUTO children in ordinary frames also obey constraints. Only children
    // participating in auto-layout should be excluded from this correction.
    const parentMode = normalizeLayoutMode(parent?.layoutMode || parentLayout?.layoutMode);
    if ((layout.layoutPositioning !== "ABSOLUTE" && parentMode !== "NONE") ||
        normalizeLayoutMode(layout.layoutMode) !== "NONE" || !parentLayout) return null;
    const dimension = (axis: string, key: string) => {
        if (constraints?.[axis] !== "STRETCH" || !Number.isFinite(layout[key]) || !Number.isFinite(parentLayout[key])) return null;
        return Math.max(0.01, layout[key] + parent[key] - parentLayout[key]);
    };
    return { width: dimension("horizontal", "width"), height: dimension("vertical", "height") };
}

export function absoluteConstrainedPosition(layout: any, parentLayout: any, parent: any, node: any): { x?: number; y?: number } | null {
    if (layout.layoutPositioning !== "ABSOLUTE" || !parentLayout) return null;
    const result: { x?: number; y?: number } = {};
    for (const [axis, size, position] of [["horizontal", "width", "x"], ["vertical", "height", "y"]]) {
        if (![layout[position], layout[size], parentLayout[size], parent[size], node[size]].every(Number.isFinite)) continue;
        const constraint = node.constraints?.[axis];
        const delta = parent[size] - parentLayout[size] - (node[size] - layout[size]);
        if (constraint === "MAX") (result as any)[position] = layout[position] + delta;
        if (constraint === "CENTER") (result as any)[position] = layout[position] + delta / 2;
    }
    return result;
}

function restoreAbsoluteConstrainedPosition(record: { node: SceneNode; layout: any; isGroup: boolean }) {
    const { node, layout, isGroup } = record;
    if (isRemovedNode(node) || isGroup || !node.parent) return;
    const position = absoluteConstrainedPosition(layout, state.restoredLayoutByNodeId[node.parent.id], node.parent, node);
    if (position?.x !== undefined) safeSet(node, "x", position.x);
    if (position?.y !== undefined) safeSet(node, "y", position.y);
}

function restoreAbsoluteStretchBox(record: { node: SceneNode; layout: any; isGroup: boolean }) {
    const { node, layout, isGroup } = record;
    if (isRemovedNode(node) || isGroup || !("constraints" in node) || !node.parent) return;
    const parent = node.parent as any;
    const size = absoluteStretchSize(layout, state.restoredLayoutByNodeId[parent.id], parent, node.constraints);
    if (!size || (size.width === null && size.height === null)) return;
    safeResize(node, size.width ?? node.width, size.height ?? node.height);
    if (hasFiniteRelativeTransform(layout)) safeSet(node, "relativeTransform", layout.relativeTransform);
}

// Outer groups are finalized after their descendants. Grouping an outer shell
// moves nested groups into the enclosing coordinate space, invalidating offsets
// captured during inner-group creation. Snapshot once, before layout changes
// can alter group bounds; reading live bounds during each restore would drift.
export function refreshNativeGroupOffsets(
    records: { node: any }[],
    offsets: { [nodeId: string]: { x: number; y: number } }
) {
    const visited = new Set<string>();
    for (const { node } of records) {
        if (isRemovedNode(node)) continue;
        const parent = node.parent;
        if (!parent || parent.type !== "GROUP" || !offsets[parent.id] || visited.has(parent.id)) continue;
        visited.add(parent.id);
        if (Number.isFinite(parent.x) && Number.isFinite(parent.y)) {
            offsets[parent.id] = { x: parent.x, y: parent.y };
        }
    }
}

function normalizeDeferredLayoutForNativeGroupParent(node: SceneNode, layout: any): any {
    const parent = node.parent as any;
    if (!parent || parent.type !== "GROUP") return layout;

    const offset = state.nativeGroupOffsetByNodeId[parent.id];
    if (!offset || (!offset.x && !offset.y)) return layout;

    const normalized: any = { ...layout };
    if (layout.x !== undefined) normalized.x = (layout.x || 0) + offset.x;
    if (layout.y !== undefined) normalized.y = (layout.y || 0) + offset.y;

    if (hasFiniteRelativeTransform(layout)) {
        normalized.relativeTransform = [
            [...layout.relativeTransform[0]],
            [...layout.relativeTransform[1]]
        ];
        normalized.relativeTransform[0][2] += offset.x;
        normalized.relativeTransform[1][2] += offset.y;
    }

    return normalized;
}

function hasFiniteRelativeTransform(layout: any): boolean {
    return Array.isArray(layout?.relativeTransform) &&
        Array.isArray(layout.relativeTransform[0]) &&
        Array.isArray(layout.relativeTransform[1]) &&
        Number.isFinite(layout.relativeTransform[0][0]) &&
        Number.isFinite(layout.relativeTransform[0][1]) &&
        Number.isFinite(layout.relativeTransform[0][2]) &&
        Number.isFinite(layout.relativeTransform[1][0]) &&
        Number.isFinite(layout.relativeTransform[1][1]) &&
        Number.isFinite(layout.relativeTransform[1][2]);
}

export function applySingleChildAutoSpaceAlignmentFix(node: any, layout: any) {
    if (!isAutoSpaceAlongPrimaryAxis(layout)) return;
    if (getRestorableChildCount(node) !== 1) return;

    // Force MIN here so the restored layout preserves MasterGo's visual result for SPACE_BETWEEN.
    safeSet(node, "primaryAxisAlignItems", "MIN");
}

// Processes only the SPACE_BETWEEN candidates recorded during this page's
// restore (deferLayoutRestore) instead of walking the entire restored page
// tree — the walk cost one children-snapshot per container plus a
// restoredLayoutByNodeId lookup per node, all through the plugin API bridge.
// The layout is re-read from restoredLayoutByNodeId at apply time and
// applySingleChildAutoSpaceAlignmentFix re-checks the SPACE_BETWEEN condition,
// so removed/overwritten nodes behave exactly as the tree walk did.
export async function applyDeferredSingleChildAutoSpaceAlignmentFixes(progress?: PostprocessProgressCallback) {
    const candidates = state.singleChildAutoSpaceCandidates;
    state.singleChildAutoSpaceCandidates = [];
    const total = Math.max(1, candidates.length);
    let done = 0;
    let lastYieldAt = Date.now();

    for (const node of candidates) {
        if (!isRemovedNode(node) && isSceneNode(node)) {
            const layout = state.restoredLayoutByNodeId[node.id];
            if (layout && hasAutoLayout(node)) applySingleChildAutoSpaceAlignmentFix(node, layout);
        }
        done++;
        lastYieldAt = await maybeYieldPostprocess(done, total, lastYieldAt, progress);
    }
}

async function maybeYieldPostprocess(
    done: number,
    total: number,
    lastYieldAt: number,
    progress?: PostprocessProgressCallback
): Promise<number> {
    const now = Date.now();
    if (done < total && done % POSTPROCESS_BATCH_SIZE !== 0 && now - lastYieldAt < POSTPROCESS_YIELD_INTERVAL_MS) {
        return lastYieldAt;
    }
    if (progress) await progress(done, total);
    await yieldToEventLoop();
    return Date.now();
}

function isAutoSpaceAlongPrimaryAxis(layout: any): boolean {
    return normalizeAxisAlign(layout.primaryAxisAlignItems) === "SPACE_BETWEEN" ||
        normalizeAxisAlign(layout.mainAxisAlignItems) === "SPACE_BETWEEN";
}

export function getRestorableChildCount(node: any): number {
    if (!("children" in node)) return 0;

    // node.children already returns a fresh snapshot array; counting directly
    // avoids the extra spread copy and intermediate filtered array.
    let count = 0;
    for (const child of node.children as BaseNode[]) {
        if (!child.name.startsWith(INTERNAL_PROPS_PREFIX) && !child.name.startsWith(SIBLING_PROPS_PREFIX)) count++;
    }
    return count;
}

export function hasAutoLayout(node: any): boolean {
    return "layoutMode" in node && node.layoutMode !== "NONE";
}

export function hasAutoLayoutParent(node: any): boolean {
    const parent = node.parent as any;
    return !!parent && "layoutMode" in parent && parent.layoutMode !== "NONE";
}

export function shouldRestoreFixedSize(node: any, layout: any): boolean {
    if (!hasAutoLayout(node)) return true;

    const primarySizing = normalizeAxisSizingMode(layout.primaryAxisSizingMode || node.primaryAxisSizingMode);
    const counterSizing = normalizeAxisSizingMode(layout.counterAxisSizingMode || node.counterAxisSizingMode);
    return primarySizing === "FIXED" || counterSizing === "FIXED";
}

export function applyAspectRatioLock(node: any, shouldLock: boolean) {
    if (typeof node.lockAspectRatio === "function" && typeof node.unlockAspectRatio === "function") {
        try {
            if (shouldLock) {
                node.lockAspectRatio();
            } else if (node.targetAspectRatio) {
                node.unlockAspectRatio();
            }
        } catch (e) {}
    }
}
