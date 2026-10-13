import { state } from "./state";
import { registerImageAsset } from "./imageExporter";
import { parseSvgImageTruth } from "./serializers/svgImageTruth";
import { describeError, isOutOfMemoryError } from "../../shared/utils";

const MAX_SVG_BYTES = 12 * 1024 * 1024;
const MAX_DERIVED_BYTES = 16 * 1024 * 1024;

export async function enrichImagePaintTruth(node: SceneNode, json: any): Promise<void> {
    const context = state.activeImageAssetContext;
    if (!context) return;
    const fills = json?.geometry?.fills;
    if (!Array.isArray(fills)) return;
    const imageFills = fills.filter(paint => paint?.type === "IMAGE");
    if (imageFills.length === 0) return;
    const isolate = fills.length !== 1 || ("children" in node && node.children.length > 0);
    // Serialization can omit unsupported paints, so match IMAGE paints by
    // their order among images rather than by their index among all fills.
    let sourceImages: ImagePaint[] = [];
    if ("fills" in node) {
        try {
            const sourceFills = node.fills;
            if (Array.isArray(sourceFills)) {
                sourceImages = sourceFills.filter((paint): paint is ImagePaint => paint.type === "IMAGE");
            }
        } catch (error) {
            if (isOutOfMemoryError(error)) throw error;
            state.logDiagnostic("warn", "[MasterGo2Figma] Source image paint read skipped", {
                nodeId: node.id, error: describeError(error)
            });
        }
    }
    for (let index = 0; index < imageFills.length; index++) {
        const paint = imageFills[index];
        if (paint.visible === false) continue;
        await enrichSingleImagePaint(node, paint, isolate,
            sourceImages.length === imageFills.length ? sourceImages[index] : undefined, index);
    }
}

async function enrichSingleImagePaint(node: SceneNode, paint: any, isolate: boolean,
    sourcePaint: ImagePaint | undefined, imageIndex: number): Promise<void> {
    const context = state.activeImageAssetContext;
    if (!context) return;
    const bakeFilters = Number.isFinite(paint.filters?.hue) && Math.abs(paint.filters.hue) > 1e-8;
    const needsCrop = paint.scaleMode === "CROP" && !paint.imageTransform;
    if (!bakeFilters && !needsCrop) return;
    try {
        if (bakeFilters) {
            // SVG's embedded image is unadjusted in real MasterGo exports.
            // Rasterize only this paint in its local box, never the container.
            const output = await exportIsolatedImagePaint(node, sourcePaint, "PNG", imageIndex);
            const retained = context.assets.reduce((sum, asset) => sum +
                (/^native-(?:svg|png):/.test(asset.sourceRef) && asset.bytes ? asset.bytes.length : 0), 0);
            if (!(output instanceof Uint8Array) || output.length < 8 ||
                ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => output[index] === byte) ||
                output.length > MAX_DERIVED_BYTES - retained) {
                throw new Error("Native adjusted PNG is invalid or exceeds retained byte limit");
            }
            const asset = registerImageAsset(`native-png:${node.id}:fill:${imageIndex}`);
            asset.bytes = output;
            paint.imageRef = asset.key;
            // The full-box bitmap already includes crop, rotation and filters.
            // Original paint opacity remains on the editable source node.
            paint.scaleMode = "CROP";
            paint.imageTransform = [[1, 0, 0], [0, 1, 0]];
            delete paint.filters;
            delete paint.rotation;
            delete paint.ratio;
            return;
        }
        const output = await exportImagePaintSvg(node, isolate, sourcePaint, imageIndex);
        if (!output || output.length > MAX_SVG_BYTES) throw new Error("SVG image probe exceeds byte limit");
        let svg = "";
        if (typeof output === "string") svg = output;
        else for (let i = 0; i < output.length; i++) svg += String.fromCharCode(output[i]);
        const truth = parseSvgImageTruth(svg, node.width, node.height);
        if (!truth) throw new Error("SVG image pattern is ambiguous or unsupported");
        paint.scaleMode = "CROP";
        paint.imageTransform = truth.imageTransform;
        delete paint.rotation;
        delete paint.ratio;
    } catch (error) {
        if (isOutOfMemoryError(error)) throw error;
        state.logDiagnostic("warn", "[MasterGo2Figma] Image paint SVG recovery skipped", {
            nodeId: node.id, imageIndex, needsCrop, bakeFilters, error: describeError(error)
        });
    }
}

async function exportImagePaintSvg(node: SceneNode, isolate: boolean,
    sourcePaint: ImagePaint | undefined, imageIndex: number): Promise<string | Uint8Array> {
    if (!isolate) return node.exportAsync({ format: "SVG" });
    return exportIsolatedImagePaint(node, sourcePaint, "SVG", imageIndex);
}

async function exportIsolatedImagePaint(node: SceneNode,
    sourcePaint: ImagePaint | undefined, format: "SVG" | "PNG", imageIndex: number): Promise<string | Uint8Array> {
    if (!sourcePaint) throw new Error("Source image paint mapping is ambiguous");
    // Isolate the local paint without exporting descendant patterns or text.
    // CROP placement is private node state in MasterGo. Assigning the same
    // paint to a new rectangle loses it (real exports became a single pixel).
    // Clone that state, then remove the unrelated content from the clone.
    const width = node.width, height = node.height;
    const probe = node.clone();
    try {
        probe.name = "__MasterGo2Figma image paint probe";
        mg.document.currentPage.appendChild(probe);
        if ("layoutMode" in probe) probe.layoutMode = "NONE";
        if ("children" in probe) {
            for (const child of [...probe.children]) child.remove();
        }
        if (!("fills" in probe)) throw new Error("Native image clone has no fills");
        if (probe.type === "TEXT" || probe.type === "LINE") {
            throw new Error("Native image isolation requires a resizable shape or container");
        }
        const original = probe.fills;
        let ordinal = -1;
        const target = original.findIndex(paint => paint.type === "IMAGE" && ++ordinal === imageIndex);
        if (target < 0) throw new Error("Native image clone mapping is ambiguous");
        const visible = original.filter(paint => paint.isVisible !== false);
        // Keep the native fill untouched when it is already the sole visible
        // paint. This preserves crop state that the public paint API omits.
        if (visible.length !== 1 || visible[0] !== original[target] || (sourcePaint.alpha ?? 1) !== 1) {
            probe.fills = original.map((paint, index) => index === target
                ? { ...paint, isVisible: true, alpha: 1 }
                : { ...paint, isVisible: false });
        }
        probe.width = width;
        probe.height = height;
        if ("opacity" in probe) probe.opacity = 1;
        if ("strokes" in probe) probe.strokes = [];
        if ("effects" in probe) probe.effects = [];
        return await probe.exportAsync({ format });
    } finally {
        probe.remove();
    }
}
