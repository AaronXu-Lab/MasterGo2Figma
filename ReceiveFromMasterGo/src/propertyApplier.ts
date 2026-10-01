import { localConnectorSvg } from "./appliers/connectorSvg";
import { localEllipseArcSvg } from "./appliers/ellipseArcSvg";
import { roundedArcNetwork } from "./appliers/roundedArc";
import { applyUniversalProperties } from "./appliers/universal";
import { applyTextProperties } from "./appliers/text";
import { getFixedMixedTextLines } from "./appliers/multilineText";
import { applyConnectorProperties } from "./appliers/connector";
import { applyVectorNetwork } from "./appliers/vector";
import { normalizeMasterGoStrokeCapForFigma } from "../../shared/connectorUtils";
import { safeSet } from "../../shared/utils";

export async function applyProperties(node: any, data: any) {
    if (!node || !data) return;
    // MasterGo connectors never occupy auto-layout flow slots. Figma's
    // vector fallback must preserve that semantic even if the API says AUTO.
    if (data.sourceType === "CONNECTOR" && data.layout) {
        data = { ...data, layout: { ...data.layout, layoutPositioning: "ABSOLUTE" } };
    }

    // The SVG children already carry native fills and outlined strokes.
    // Keep the full-size wrapper transparent; painting it would fill the hole.
    const arcSvgWrapper = node.type === "FRAME" && (localEllipseArcSvg(data) || localConnectorSvg(data));
    await applyUniversalProperties(node, arcSvgWrapper
        ? { ...data, geometry: { fills: [], strokes: [], strokeWeight: 0 }, clipsContent: false }
        : data);
    if (arcSvgWrapper) node.clipsContent = false;

    const fixedLines = node.type === "FRAME" ? getFixedMixedTextLines(data) : null;
    if (fixedLines) {
        const fills = node.fills;
        const strokes = node.strokes;
        node.fills = [];
        node.strokes = [];
        node.clipsContent = false;
        for (let index = 0; index < fixedLines.length; index++) {
            const line = figma.createText();
            node.appendChild(line);
            line.name = fixedLines[index].characters;
            line.fills = fills;
            line.strokes = strokes;
            line.strokeWeight = data.geometry?.strokeWeight ?? 0;
            await applyTextProperties(line, { ...data, ...fixedLines[index], textAutoResize: "NONE" });
            line.resize(data.layout.width, data.lineHeight.value);
            line.x = 0;
            line.y = index * data.lineHeight.value;
        }
    }

    const arcNetwork = node.type === "VECTOR" ? roundedArcNetwork(data) : null;
    if (arcNetwork) await applyVectorNetwork(node, arcNetwork, { ...data, vectorAutoLayoutBox: true });

    // SVG fallback supplies the missing regions and rounded path geometry.
    // Replaying the incomplete source network would erase those again.
    if (node.type === "VECTOR" && data.vectorNetwork && !data.svgFallback) {
        await applyVectorNetwork(node as VectorNode, data.vectorNetwork, data);
        reapplyVectorStrokeGeometry(node as VectorNode, data);
    }

    if (node.type === "TEXT" && data.characters !== undefined) {
        await applyTextProperties(node, data);
    }

    if (node.type === "CONNECTOR") {
        await applyConnectorProperties(node as ConnectorNode, data, true);
    }
}

function reapplyVectorStrokeGeometry(node: VectorNode, data: any) {
    const geometry = data && data.geometry;
    if (!geometry) return;

    if (geometry.strokeWeight !== undefined) safeSet(node, "strokeWeight", geometry.strokeWeight);
    if (geometry.strokeAlign) safeSet(node, "strokeAlign", geometry.strokeAlign);
    if (geometry.strokeJoin) safeSet(node, "strokeJoin", geometry.strokeJoin);
    if (geometry.dashPattern !== undefined) safeSet(node, "dashPattern", geometry.dashPattern);
    // Setting a uniform cap after the network erases its per-endpoint arrows.
    const hasVertexCaps = data.vectorNetwork?.vertices?.some((v: any) => v.strokeCap !== undefined);
    if (geometry.strokeCap && !data.connectorFallbackPolyline && !hasVertexCaps) {
        safeSet(node, "strokeCap", normalizeMasterGoStrokeCapForFigma(geometry.strokeCap));
    }
}
