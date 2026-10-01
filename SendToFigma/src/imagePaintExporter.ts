import { state } from "./state";
import { registerImageAsset } from "./imageExporter";
import { parseSvgImageTruth, decodeImageDataUri } from "./serializers/svgImageTruth";
import { describeError, isOutOfMemoryError } from "../../shared/utils";

const MAX_SVG_BYTES = 12 * 1024 * 1024;
const MAX_DERIVED_BYTES = 16 * 1024 * 1024;

export async function enrichImagePaintTruth(node: SceneNode, json: any): Promise<void> {
    const context = state.activeImageAssetContext;
    if (!context || ("children" in node && node.children.length > 0)) return;
    const fills = json?.geometry?.fills;
    if (!Array.isArray(fills) || fills.length !== 1 || fills[0]?.type !== "IMAGE") return;
    const paint = fills[0];
    const bakeFilters = Number.isFinite(paint.filters?.hue) && Math.abs(paint.filters.hue) > 1e-8;
    const needsCrop = paint.scaleMode === "CROP" && !paint.imageTransform;
    if (!bakeFilters && !needsCrop) return;
    try {
        const output = await node.exportAsync({ format: "SVG" });
        if (!output || output.length > MAX_SVG_BYTES) throw new Error("SVG image probe exceeds byte limit");
        let svg = "";
        if (typeof output === "string") svg = output;
        else for (let i = 0; i < output.length; i++) svg += String.fromCharCode(output[i]);
        const truth = parseSvgImageTruth(svg, node.width, node.height);
        if (!truth) throw new Error("SVG image pattern is ambiguous or unsupported");
        if (bakeFilters) {
            const retained = context.assets.reduce((sum, asset) => sum +
                (asset.sourceRef.startsWith("native-svg:") && asset.bytes ? asset.bytes.length : 0), 0);
            const bytes = decodeImageDataUri(truth.dataUri, MAX_DERIVED_BYTES - retained);
            if (!bytes) throw new Error("Native adjusted image exceeds retained byte limit");
            const asset = registerImageAsset(`native-svg:${node.id}:fill`);
            asset.bytes = bytes;
            paint.imageRef = asset.key;
            // Native SVG embeds all image adjustments. Keeping Figma filters
            // here would apply exposure/contrast/etc a second time.
            delete paint.filters;
        }
        paint.scaleMode = "CROP";
        paint.imageTransform = truth.imageTransform;
        delete paint.rotation;
        delete paint.ratio;
    } catch (error) {
        if (isOutOfMemoryError(error)) throw error;
        state.logDiagnostic("warn", "[MasterGo2Figma] Image paint SVG recovery skipped", {
            nodeId: node.id, needsCrop, bakeFilters, error: describeError(error)
        });
    }
}
