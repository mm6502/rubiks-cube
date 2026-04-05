/*
 * Functions to help with keyboard navigation of stickers in the Circular Cube View.
 */
import { StickerId } from '@/cube/types';
import { compareValues, distance2 } from '@/cube/utils';
import { logger } from '@/diagnostics/logger';

import { CircularCubeViewInternalData } from './circular-view';
import { AxisCircle, getCenterOfElement } from './svg-tools';

/**
 * Direction enum for keyboard navigation.
 */
export const Direction = {
    Up: 'up',
    Down: 'down',
    Left: 'left',
    Right: 'right',
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

/**
 * Check if a keyboard event is a navigation key (arrow keys).
 */
export function isNavigationKey(event: KeyboardEvent): event is KeyboardEvent {
    return mapKeyToDirection(event) !== undefined;
}

/**
 * Maps keyboard arrow keys to Direction enum values.
 */
export function mapKeyToDirection(event: KeyboardEvent): Direction | undefined {
    switch (event.key) {
        case 'ArrowUp':
            return Direction.Up;
        case 'ArrowDown':
            return Direction.Down;
        case 'ArrowLeft':
            return Direction.Left;
        case 'ArrowRight':
            return Direction.Right;
        default:
            return undefined;
    }
}

/**
 * Type to hold scoring information for keyboard navigation.
 * The distance and angle closeness values are normalized between 1 and 0.
 * This allows for easy weighted score calculation.
 * @param element - The SVG element being scored.
 * @param distance - The distance from the current element.
 * @param distanceCloseness - Normalized closeness to the current element (1 = closest, 0 = farthest).
 * @param angle - The angle difference from the desired direction.
 * @param angleCloseness - Normalized closeness to the desired angle (1 = closest, 0 = farthest).
 */
type WalkingScore = {
    element: SVGElement;
    distance: number;
    distanceCloseness: number;
    angle: number;
    angleCloseness: number;
};

/**
 * Attempt to navigate the cube using keyboard input.
 */
export function navigate(
    event: KeyboardEvent,
    preview: boolean = false,
    state: CircularCubeViewInternalData,
    onSelected?: (id: StickerId) => void
): boolean {
    // If not a navigation key, return false.
    const direction = mapKeyToDirection(event);
    if (!direction) return false;

    // If no sticker is selected, return false.
    if (!state.model || !state.currentSelected) {
        logger.error('[Circular Navigation] No sticker selected or model unavailable.');
        return false;
    }

    // Find the next sticker based on the current selection and direction.
    const nextStickerId = findNextSticker(
        state.currentSelected,
        direction,
        state.svgElementCache,
        state.stickerIdToSvgId,
        state.svgIdToStickerId,
        state.axisCircles
    );

    // If no next sticker found, return false.
    if (!nextStickerId) return false;

    // If the next sticker is the same as the current, no navigation occurs.
    if (nextStickerId === state.currentSelected) return false;

    // Dispatch sticker selected event
    if (!preview) {
        onSelected?.(nextStickerId);
    }

    return true;
}

/**
 * Finds the next sticker ID based on the current sticker ID and the direction of movement.
 * Returns the next sticker ID or undefined if not found.
 * @param currentStickerId - The current sticker ID.
 * @param direction - The direction of movement (up, down, left, right).
 * @param svgElementCache - A map of SVG element IDs to SVG elements.
 * @param stickerIdToSvgId - A map of sticker IDs to SVG element IDs.
 * @param svgIdToStickerId - A map of SVG element IDs to sticker IDs.
 * @param axisCircles - An array of AxisCircle objects (not used in current implementation).
 */
export function findNextSticker(
    currentStickerId: StickerId,
    direction: Direction,
    svgElementCache: Map<string, SVGElement>,
    stickerIdToSvgId: Map<StickerId, string>,
    svgIdToStickerId: Map<string, StickerId>,
    _axisCircles: AxisCircle[]
): StickerId | undefined {
    const currentSvgId = stickerIdToSvgId.get(currentStickerId as StickerId);
    if (!currentSvgId) return undefined;

    const currentSvgElement = svgElementCache.get(currentSvgId);
    if (!currentSvgElement) return undefined;

    // Score all other SVG elements as candidates.
    const scoredElements = getScoredElements(svgElementCache, currentSvgElement, direction);

    // Determine tolerance based on size of current element.
    const radius = parseFloat(window.getComputedStyle(currentSvgElement).r) ?? 7;

    // Try selecting best candidate:

    // Narrower angle, short distance tolerance
    // (local in face moves)
    let bestCandidateElement = selectBestCandidate(scoredElements, radius * 3, 52, 1, 0.8);

    // Narrower angle, longer distance tolerance
    // (face to face moves)
    if (!bestCandidateElement)
        bestCandidateElement = selectBestCandidate(scoredElements, radius * 9, 72, 1, 1);

    // Wide angle, long distance tolerance
    // (local in face extremes - B7 to B8 - angle)
    // (face to face extremes - D8 to R8 - distance)
    if (!bestCandidateElement)
        bestCandidateElement = selectBestCandidate(scoredElements, radius * 12, 85, 0.2, 1);

    // Default to returning the current sticker if no movement is possible.
    return svgIdToStickerId.get(bestCandidateElement?.element?.id!) || currentStickerId;
}

/**
 * Selects the best candidate from a list based on distance and angle tolerances.
 * Returns the best WalkingScore or undefined if none meet the criteria.
 * @param candidates - Array of WalkingScore objects to evaluate.
 * @param distanceTolerance - Maximum allowable distance for a candidate.
 * @param angleTolerance - Maximum allowable angle for a candidate.
 * @param distanceWeight - Weighting factor for distance in score calculation (0..1).
 * @param angleWeight - Weighting factor for angle in score calculation (0..1).
 */
function selectBestCandidate(
    candidates: WalkingScore[],
    distanceTolerance: number,
    angleTolerance: number,
    distanceWeight = 1,
    angleWeight = 1
): WalkingScore | undefined {
    // No candidates to evaluate.
    if (candidates.length === 0) return undefined;

    // Find best candidate based on weighted score.
    let bestCandidate: WalkingScore | undefined = undefined;
    let bestScore = 0;

    // Evaluate each candidate.
    for (const candidate of candidates) {
        // Disqualify candidates outside distance tolerance.
        if (candidate.distance > distanceTolerance) continue;

        // Disqualify candidates outside angle tolerance.
        if (candidate.angle > angleTolerance) continue;

        // Calculate weighted score.
        var score =
            candidate.distanceCloseness * distanceWeight * (candidate.angleCloseness * angleWeight);

        // Update best candidate if score is higher.
        if (score > bestScore) {
            bestCandidate = candidate;
            bestScore = score;
        }
    }

    // Return best candidate or undefined if none found.
    return bestCandidate;
}

/**
 * Gets scored elements for keyboard navigation.
 * Returns an array of WalkingScore objects.
 * Scores are based on distance and angle from the current element in the
 * specified direction.
 * @param svgElementCache - Map of SVG element IDs to SVG elements.
 * @param currentSvgElement - The currently selected SVG element.
 * @param direction - The direction of movement (up, down, left, right).
 */
function getScoredElements(
    svgElementCache: Map<string, SVGElement>,
    currentSvgElement: SVGElement,
    direction: Direction
) {
    // Score all other SVG elements as candidates.
    var scoredElements = Array.from(svgElementCache.values())
        .filter(e => e !== currentSvgElement)
        .map(e => scoreCandidate(currentSvgElement, e, direction));

    // Get max distance.
    const maxDistance = Math.max(...scoredElements.map(se => se.distance));

    // Update with normalized distance.
    scoredElements = scoredElements.map(se => {
        return {
            ...se,
            distanceCloseness: (maxDistance - se.distance) / maxDistance,
        } as WalkingScore;
    });

    // Sort by distance.
    scoredElements = scoredElements.sort((a, b) => compareValues(a.distance, b.distance));

    // Return scored elements.
    return scoredElements;
}

/**
 * Function calculates distance and closeness to angle indicated by direction.
 * Returns a WalkingScore object containing:
 * - element: the candidate SVG element
 * - distance: Euclidean distance between current and candidate element
 * - angle: angle difference between actual direction and desired direction
 * - angleCloseness: normalized closeness to desired angle (0 to 1)
 */
function scoreCandidate(
    currentSvgElement: SVGElement,
    candidateSvgElement: SVGElement,
    direction: Direction
): WalkingScore {
    // Compute distance
    let distance = computeDistanceBetweenElements(currentSvgElement, candidateSvgElement);

    // Compute angle closeness
    let angle = computeAngleClosenessBetweenElements(
        currentSvgElement,
        candidateSvgElement,
        direction
    );

    let angleCloseness = 1 - angle / 180;

    // return score;
    return {
        element: candidateSvgElement,
        distance,
        angle,
        angleCloseness: angleCloseness,
    } as WalkingScore;
}

/**
 * Computes the Euclidean distance between the centers of two SVG elements.
 */
function computeDistanceBetweenElements(
    currentSvgElement: SVGElement,
    candidateSvgElement: SVGElement
): number {
    const centerOfCurrent = getCenterOfElement(currentSvgElement);
    const centerOfCandidate = getCenterOfElement(candidateSvgElement);

    return distance2(centerOfCurrent, centerOfCandidate);
}

/**
 * Computes the angle difference between the direction vector and the desired direction.
 * Returns the smallest angle difference in radians (0 to π).
 */
function computeAngleClosenessBetweenElements(
    currentSvgElement: SVGElement,
    candidateSvgElement: SVGElement,
    direction: Direction
): number {
    const centerCurrent = getCenterOfElement(currentSvgElement);
    const centerCandidate = getCenterOfElement(candidateSvgElement);

    const dx = centerCandidate.x - centerCurrent.x;
    const dy = centerCandidate.y - centerCurrent.y;

    // in radians, -π to π
    const actualAngle = Math.atan2(dy, dx);

    let desiredAngle: number;

    switch (direction) {
        case Direction.Up:
            desiredAngle = -Math.PI / 2;
            break;
        case Direction.Down:
            desiredAngle = Math.PI / 2;
            break;
        case Direction.Left:
            desiredAngle = Math.PI;
            break;
        case Direction.Right:
            desiredAngle = 0;
            break;
        default:
            desiredAngle = 0;
    }

    let angleDiff = Math.abs(actualAngle - desiredAngle);

    // Normalize to smallest angle
    angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);

    // convert to degrees
    return angleDiff * (180 / Math.PI);
}
