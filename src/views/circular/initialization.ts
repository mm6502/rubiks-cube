import { Application } from '@/application';
import { Axis, Face, Position3D, PositionKey, ReadOnlyCubeModel, StickerId } from '@/cube/types';
import { getPositionKey } from '@/cube/utils';
import { logger } from '@/diagnostics/logger';
import { EventName } from '@/types';

import { CircularCubeViewInternalData } from './circular-view';
import { AxisCircle, SVGAxisCoords, getCenterOfElement, isPointOnCircle } from './svg-tools';
import rawSvg from './view.svg?raw';

/**
 * Parse axis circles from SVG element by querying for all <circle>
 * elements that carry a data-axis attribute.
 * Throws if no axis circle elements are found — indicates a broken or
 * mismatched SVG file.
 */
function parseAxisCircles(svgRoot: SVGSVGElement): AxisCircle[] {
    const circles = svgRoot.querySelectorAll('circle[data-axis]');
    if (circles.length === 0) {
        throw new Error('SVG contains no axis circle elements (circle[data-axis])');
    }

    const axisCircles: AxisCircle[] = [];

    for (const circle of circles) {
        const axis = circle.getAttribute('data-axis') as Axis;
        const layerRaw = circle.getAttribute('data-layer-index');
        /* c8 ignore if */
        if (!axis || layerRaw === null) continue;

        const layer = parseInt(layerRaw, 10);
        /* c8 ignore next 3 */
        if (Number.isNaN(layer)) {
            logger.warn(
                `Skipping axis circle ${circle.id}: invalid data-layer-index="${layerRaw}"`
            );
            continue;
        }

        const cx = parseFloat(circle.getAttribute('cx') || '0');
        const cy = parseFloat(circle.getAttribute('cy') || '0');
        const r = parseFloat(circle.getAttribute('r') || '0');
        axisCircles.push({ id: circle.id, axis, layer, cx, cy, r });
    }

    return axisCircles;
}

/**
 * Compute axis intersection coordinates for a sticker by checking which
 * axis circles it lies on.
 */
function computeAxisCoords(
    stickerElement: SVGCircleElement,
    axisCircles: AxisCircle[]
): SVGAxisCoords {
    const position = getCenterOfElement(stickerElement);

    const coords: SVGAxisCoords = {
        [Axis.X]: null,
        [Axis.Y]: null,
        [Axis.Z]: null,
    };

    for (const circle of axisCircles) {
        if (isPointOnCircle(position, circle)) {
            coords[circle.axis] = circle.layer;
        }
    }

    return coords;
}

/**
 * Derive cube position and face from SVG axis coordinates and SVG face label.
 *
 * SVG face labels match cube model faces:
 * - SVG 'L' → Cube L (x=0)
 * - SVG 'R' → Cube R (x=cubeSize-1)
 * - SVG 'D' → Cube D (y=0)
 * - SVG 'U' → Cube U (y=cubeSize-1)
 * - SVG 'F' → Cube F (z=0)
 * - SVG 'B' → Cube B (z=cubeSize-1)
 */
function svgToCubeMapping(
    svgFace: string,
    axisCoords: SVGAxisCoords,
    cubeSize: number
): { cubePosition: Position3D; cubeFace: Face } | undefined {
    const far = cubeSize - 1;
    const x = axisCoords[Axis.X];
    const y = axisCoords[Axis.Y];
    const z = axisCoords[Axis.Z];
    let cubePosition: Position3D;
    let cubeFace: Face;

    // Based on which axis is null and the SVG face label, determine position and actual cube face
    if (x === null && y !== null && z !== null) {
        // X is null → sticker on L or R face
        if (svgFace === Face.L) {
            cubePosition = { x: 0, y, z };
            cubeFace = Face.L;
        } else if (svgFace === Face.R) {
            cubePosition = { x: far, y, z };
            cubeFace = Face.R;
        } else {
            /* c8 ignore next 2 */
            logger.error(`Unexpected SVG face '${svgFace}' with X=null`);
            return undefined;
        }
        /* c8 ignore next 1 */
    } else if (y === null && x !== null && z !== null) {
        // Y is null → sticker on D or U face
        if (svgFace === Face.D) {
            cubePosition = { x, y: 0, z };
            cubeFace = Face.D;
        } else if (svgFace === Face.U) {
            cubePosition = { x, y: far, z };
            cubeFace = Face.U;
        } else {
            /* c8 ignore next 2 */
            logger.error(`Unexpected SVG face '${svgFace}' with Y=null`);
            return undefined;
        }
        /* c8 ignore next 1 */
    } else if (z === null && x !== null && y !== null) {
        // Z is null → sticker on F or B face
        if (svgFace === Face.F) {
            cubePosition = { x, y, z: 0 };
            cubeFace = Face.F;
        } else if (svgFace === Face.B) {
            cubePosition = { x, y, z: far };
            cubeFace = Face.B;
        } else {
            /* c8 ignore next 2 */
            logger.error(`Unexpected SVG face '${svgFace}' with Z=null`);
            return undefined;
        }
    } else {
        /* c8 ignore next 2 */
        logger.error(`Invalid axis coordinates: X=${x}, Y=${y}, Z=${z}`);
        return undefined;
    }

    return { cubePosition, cubeFace };
}

/**
 * Sticker lookup map: position3D → face → SVG element ID
 * Allows efficient lookup of which SVG sticker to update for a given cube sticker
 */
export type StickerLookupMap = Map<PositionKey, Map<Face, string>>;

/**
 * Return type for buildStickerLookupMap
 */
export interface StickerLookupResult {
    lookupMap: StickerLookupMap;
    axisCircles: AxisCircle[];
}

/**
 * Build a lookup map from cube position + face to SVG sticker ID by
 * parsing the SVG at runtime.
 * @param svgRoot The SVG root element containing axis circles and stickers
 * @returns Object containing the lookup map and axis circles
 */
export function buildStickerLookupMap(svgRoot: SVGSVGElement): StickerLookupResult {
    const lookupMap: StickerLookupMap = new Map();

    // Read and validate cube size from SVG root
    const cubeSizeRaw = svgRoot.getAttribute('data-cube-size');
    if (!cubeSizeRaw) {
        throw new Error('SVG root is missing data-cube-size attribute');
    }
    const cubeSize = parseInt(cubeSizeRaw, 10);
    if (!Number.isInteger(cubeSize) || cubeSize < 1) {
        throw new Error(`Invalid data-cube-size="${cubeSizeRaw}": must be a positive integer`);
    }

    // Parse axis circle positions from SVG
    const axisCircles = parseAxisCircles(svgRoot);

    // Find all sticker elements
    const stickers = svgRoot.querySelectorAll<SVGCircleElement>('circle.sticker');

    for (const stickerElement of stickers) {
        const svgId = stickerElement.id;
        /* c8 ignore if */
        if (!svgId) continue;

        // Parse SVG face label from ID (format: "sticker-F-0" or "sticker-F-15")
        const match = svgId.match(/^sticker-([UDFLBR])-\d+$/);
        if (!match) {
            logger.warn(`Invalid SVG sticker ID: ${svgId}`);
            continue;
        }

        const svgFace = match[1];

        // Compute which axis circles this sticker intersects
        const axisCoords = computeAxisCoords(stickerElement, axisCircles);

        // Map to cube position and face
        const mapping = svgToCubeMapping(svgFace, axisCoords, cubeSize);
        if (!mapping) {
            continue;
        }

        const { cubePosition, cubeFace } = mapping;
        const posKey = getPositionKey(cubePosition);

        if (!lookupMap.has(posKey)) {
            lookupMap.set(posKey, new Map());
        }

        const faceMap = lookupMap.get(posKey)!;
        if (faceMap.has(cubeFace)) {
            logger.warn(`Duplicate mapping for position ${posKey}, face ${cubeFace}`);
        }

        faceMap.set(cubeFace, svgId);
    }

    return { lookupMap, axisCircles };
}

/**
 * Initialize CircularCubeView internal data structure.
 * @param container The HTML container element for the view
 * @param model The cube model to visualize
 * @param styles CSS styles to apply
 * @returns Initialized internal data or null on failure
 */
export function initialize(
    container: HTMLElement,
    model: ReadOnlyCubeModel,
    styles: Record<string, string>
): CircularCubeViewInternalData | undefined {
    // Validate container.
    if (!container || !model) return undefined;

    // Initialize internal data structure.
    var result: CircularCubeViewInternalData = {
        model: undefined,
        container: undefined,
        styles: styles,
        svgRoot: undefined,
        svgReady: false,
        axisCircles: [],
        stickerLookupMap: undefined,
        svgElementCache: new Map<string, SVGCircleElement>(),
        svgIdToStickerId: new Map<string, StickerId>(),
        stickerIdToSvgId: new Map<StickerId, string>(),
        animationChain: Promise.resolve(),
        axisAnimationChains: { X: Promise.resolve(), Y: Promise.resolve(), Z: Promise.resolve() },
        cubeWalk: true,
        showGhosts: true,
        ghostOpacityIndex: 0,
        zoomPan: null,
        touchHandler: null,
        panMode: false,
    };

    // Store references
    result.container = container;
    result.model = model;

    // Make container focusable for keyboard navigation
    container.tabIndex = 0;

    // Inline the SVG so we can address elements directly and ensure it scales to the lesser of width/height.
    // data-role="clip-container"  — clips overflowing content when zoomed/panned; receives wheel/pointer events.
    // data-role="transform-target" — CSS translate+scale is applied here; position:absolute;inset:0 ensures
    //   its layout origin is at (0,0) relative to clip-container so zoom-around-cursor math is exact.
    container.innerHTML += `
            <div data-role="clip-container" style="height:100%; position:relative;">
                <div data-role="transform-target" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:8px; box-sizing:border-box;">
                    ${rawSvg}
                </div>
            </div>
        `;

    // Find the inline SVG element we just added.
    result.svgRoot = container.querySelector('svg') as SVGSVGElement | null;
    /* c8 ignore next 3 */
    if (!result.svgRoot) {
        result.svgReady = false;
        return result;
    }

    // Build the position → face → SVG ID lookup map from the SVG itself.
    const stickerLookupResult = buildStickerLookupMap(result.svgRoot);
    result.stickerLookupMap = stickerLookupResult.lookupMap;
    result.axisCircles = stickerLookupResult.axisCircles;

    // Build cache of SVG elements by ID for fast access.
    result.svgElementCache = buildSvgElementCache(result.svgRoot);

    // Determine if SVG is ready based on presence of mappings and elements.
    result.svgReady =
        result.stickerLookupMap.size > 0 &&
        result.svgElementCache.size > 0 &&
        result.axisCircles.length > 0;

    /* c8 ignore next 2 */
    if (!result.svgReady) {
        throw new Error('CircularCubeView: Failed to initialize sticker mapping.');
    }

    return result;
}

/**
 * Build a cache mapping SVG element IDs to their corresponding SVGCircleElement.
 * @param svgRoot The SVG root element containing sticker circles
 * @returns Map of SVG element IDs to SVGCircleElement
 */
function buildSvgElementCache(svgRoot: SVGSVGElement): Map<string, SVGCircleElement> {
    let result = new Map<string, SVGCircleElement>();

    /* c8 ignore if */
    if (!svgRoot) {
        return result;
    }

    const stickers = Array.from(svgRoot.querySelectorAll<SVGCircleElement>('circle.sticker'));

    for (const circle of stickers) {
        const id = circle.id;
        /* c8 ignore if */
        if (id) {
            result.set(id, circle);
        }
    }

    return result;
}

/**
 * Attach mouse and click event listeners to sticker SVG elements so the view
 * can emit highlight and selection events via the global event bus.
 */
export function attachStickerEventListeners(
    state: CircularCubeViewInternalData,
    viewId: string,
    onStickerSelected: (id: StickerId) => void
): void {
    for (const [svgId, circle] of state.svgElementCache) {
        // Mouseover for highlighting
        circle.addEventListener('mouseover', () => {
            const stickerId = state.svgIdToStickerId.get(svgId);
            if (stickerId) {
                Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, {
                    stickerId,
                    viewId,
                });
            }
        });

        // Mouseout to clear highlight
        circle.addEventListener('mouseout', () => {
            Application.eventBus.emit(EventName.HIGHLIGHT_CHANGED, {
                stickerId: undefined,
                viewId,
            });
        });

        // Click for selection
        circle.addEventListener('click', () => {
            const stickerId = state.svgIdToStickerId.get(svgId);
            if (stickerId) {
                onStickerSelected(stickerId);
            }
        });
    }
}
