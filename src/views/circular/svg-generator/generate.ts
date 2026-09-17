import { emitSvg } from './emit';
import { ALL_FACES, CircularSvgParameters } from './geometry';
import { GhostSpec, allGhosts, emitGhosts } from './ghosts';
import { PROBE_VIEWBOX, boundsToViewBox, markupBounds } from './measure';
import parametersFile from './parameters.json';
import { ValidationIssue, formatIssues, validate } from './validate';

/**
 * Generation orchestration: parameters in, a validated SVG out.
 *
 * This lives under `src/` rather than in the CLI script so that `tsc` and
 * `vitest` both see it — the type checker compiles `src/**`, and the test
 * runner collects only `src/**`, so a script-side implementation could not have
 * been unit-tested. The CLI in `scripts/circular-svg/` stays a thin argument
 * parser around these functions.
 *
 * Nothing here writes to disk; the caller decides where output lands. That keeps
 * failure cases testable without touching the working tree.
 */

export interface ParametersFile {
    /** Shared values applied to any size that does not override them. */
    defaults: Record<string, number>;
    /** Per-size overrides, keyed by cube size as a string. */
    sizes: Record<string, Record<string, number | string>>;
}

/**
 * The bundled parameter sets.
 *
 * Cast through `unknown` because the JSON carries `$comment` documentation keys
 * that the runtime type deliberately does not model — they exist for readers of
 * the file, not for code.
 */
const PARAMETERS: ParametersFile = parametersFile as unknown as ParametersFile;

/** The bundled parameter sets. */
export function loadParameters(): ParametersFile {
    return PARAMETERS;
}

/**
 * Merge the shared defaults with one size's overrides.
 *
 * Throws on a missing size rather than falling back to a default, so generating
 * an unconfigured size fails loudly instead of silently producing a 3x3 asset
 * under a different name.
 */
export function resolveParameters(
    cubeSize: number,
    file: ParametersFile = PARAMETERS
): CircularSvgParameters & { ghostRadiusOffset: number } {
    const override = file.sizes[String(cubeSize)];
    if (!override) {
        throw new Error(
            `No parameter set for size ${cubeSize}. Add an entry under "sizes" in parameters.json.`
        );
    }

    const merged: Record<string, unknown> = { ...file.defaults, ...override };
    delete merged['$comment'];

    const numeric = (key: string): number => {
        const value = merged[key];
        if (typeof value !== 'number') {
            throw new Error(
                `Parameter "${key}" must be a number for size ${cubeSize}, got ${JSON.stringify(value)}`
            );
        }
        return value;
    };

    const viewBox = merged['viewBox'];
    if (typeof viewBox !== 'string') {
        throw new Error(`Parameter "viewBox" must be a string for size ${cubeSize}`);
    }

    return {
        triangleSide: numeric('triangleSide'),
        innerRadius: numeric('innerRadius'),
        ringStep: numeric('ringStep'),
        stickerRadius: numeric('stickerRadius'),
        viewBox,
        centreX: numeric('centreX'),
        centreY: numeric('centreY'),
        apexHeight: numeric('apexHeight'),
        ellipseOffsetNear: numeric('ellipseOffsetNear'),
        ellipseOffsetFar: numeric('ellipseOffsetFar'),
        ellipseMargin: numeric('ellipseMargin'),
        ellipseAspect: numeric('ellipseAspect'),
        labelWidth: numeric('labelWidth'),
        labelHeight: numeric('labelHeight'),
        faceLabelGap: numeric('faceLabelGap'),
        ghostRadiusOffset: numeric('ghostRadiusOffset'),
    };
}

export interface GenerationResult {
    cubeSize: number;
    svg: string;
    ghosts: GhostSpec[];
    issues: ValidationIssue[];
}

/**
 * Build one size's SVG markup WITHOUT validating it.
 *
 * Split out from `generate()` so the runtime can generate on demand without
 * paying for five geometry checks on every first view of a size. Validation
 * exists to protect the committed assets at build time; at runtime the markup is
 * identical, and a failure there would be a generator bug that the test suite
 * already covers. Callers that write files must use `generate()`.
 *
 * Throws if the size has no parameter set — see `resolveParameters`.
 */
export function buildSvg(cubeSize: number, file: ParametersFile = PARAMETERS): string {
    return build(cubeSize, file).svg;
}

/**
 * The shared build, returning the intermediates `generate()` needs to validate.
 *
 * Kept private so the two public entries cannot drift: `buildSvg` and `generate`
 * produce byte-identical markup because they run this same function once.
 */
function build(
    cubeSize: number,
    file: ParametersFile
): { svg: string; ghosts: GhostSpec[]; params: CircularSvgParameters; viewBox: string } {
    const resolved = resolveParameters(cubeSize, file);
    const { ghostRadiusOffset, ...params } = resolved;

    const ghosts = allGhosts(cubeSize, params, { radiusOffset: ghostRadiusOffset });

    // Emit once against a deliberately oversized canvas to measure what is drawn,
    // then re-emit with a viewBox fitted to that measurement. Deriving the canvas
    // this way means a layer the emitter adds later is included automatically:
    // sizing from a hand-written list of element kinds was wrong twice, the second
    // time omitting the axis circles and cropping their outer arc at every size
    // from 4 up.
    //
    // The probe canvas is large enough that nothing is clipped, and the mask
    // backing rect tracks the viewBox, so the probe is a faithful measurement of
    // the real drawing rather than of a clipped one.
    const probeParams: CircularSvgParameters = { ...params, viewBox: PROBE_VIEWBOX };
    const probeSvg = emitSvg({
        cubeSize,
        params: probeParams,
        ghosts: emitGhosts(ghosts, params.stickerRadius),
    });
    const viewBox = boundsToViewBox(markupBounds(probeSvg));

    const fitted: CircularSvgParameters = { ...params, viewBox };
    const svg = emitSvg({
        cubeSize,
        params: fitted,
        ghosts: emitGhosts(ghosts, params.stickerRadius),
    });

    return { svg, ghosts, params: fitted, viewBox };
}

/**
 * Generate one size and validate it.
 *
 * Validation runs before the result is returned, so a caller that writes only on
 * an empty issue list can never leave a partial or non-conforming asset behind.
 * Use this for anything that lands on disk; use `buildSvg` for runtime rendering.
 */
export function generate(cubeSize: number, file: ParametersFile = PARAMETERS): GenerationResult {
    const { svg, ghosts, params } = build(cubeSize, file);
    return { cubeSize, svg, ghosts, issues: validate({ cubeSize, params, svg, ghosts }) };
}

/** Sizes with a parameter set, ascending. */
export function availableSizes(file: ParametersFile = PARAMETERS): number[] {
    return Object.keys(file.sizes)
        .map(Number)
        .sort((a, b) => a - b);
}

/** Human-readable validation report. */
export { formatIssues };
export { ALL_FACES };
