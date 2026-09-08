import { applyUniversalProperties } from "./appliers/universal";
import { applyTextProperties } from "./appliers/text";
import { getFixedMixedTextLines } from "./appliers/multilineText";
import { applyConnectorProperties } from "./appliers/connector";
import { applyVectorNetwork } from "./appliers/vector";
import { normalizeMasterGoStrokeCapForFigma } from "../../shared/connectorUtils";
import { safeSet } from "../../shared/utils";

export async function applyProperties(node: any, data: any) {
    if (!node || !data) return;

    await applyUniversalProperties(node, data);

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

    if (node.type === "VECTOR" && data.vectorNetwork) {
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
