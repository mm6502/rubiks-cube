import { emitSvg } from './emit';
import { ALL_FACES, CircularSvgParameters } from './geometry';
import { GhostParameters, GhostSpec, allGhosts, emitGhosts } from './ghosts';
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
        ellipseRadiusX: numeric('ellipseRadiusX'),
        ellipseRadiusY: numeric('ellipseRadiusY'),
        labelWidth: numeric('labelWidth'),
        labelHeight: numeric('labelHeight'),
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
 * Generate one size and validate it.
 *
 * Validation runs before the result is returned, so a caller that writes only on
 * an empty issue list can never leave a partial or non-conforming asset behind.
 */
export function generate(cubeSize: number, file: ParametersFile = PARAMETERS): GenerationResult {
    const resolved = resolveParameters(cubeSize, file);
    const { ghostRadiusOffset, ...params } = resolved;
    const ghostParams: GhostParameters = { radiusOffset: ghostRadiusOffset };

    const ghosts = allGhosts(cubeSize, params, ghostParams);
    const svg = emitSvg({
        cubeSize,
        params,
        ghosts: emitGhosts(ghosts, params.stickerRadius),
    });

    const issues = validate({ cubeSize, params, svg, ghosts });

    return { cubeSize, svg, ghosts, issues };
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
