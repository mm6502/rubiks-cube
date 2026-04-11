/**
 * Demo part/act filter — parsed once from process.argv so both
 * record-demo.ts and acts.ts can import the helpers without creating
 * a circular dependency.
 *
 * Usage:
 *   npm run demo              → full demo
 *   npm run demo -- 3         → all parts of Act 3
 *   npm run demo -- 2.4,2.6  → only parts 2.4 and 2.6
 *   npm run demo -- 1,4       → all of Act 1 + all of Act 4
 */

interface DemoFilter {
    acts: Set<number>; // empty = all acts
    parts: Set<string>; // empty = all parts within selected acts
}

function parseDemoFilter(raw: string | undefined): DemoFilter | null {
    if (!raw || !/^[\d.,]+$/.test(raw)) return null;
    const acts = new Set<number>();
    const parts = new Set<string>();
    for (const token of raw.split(',')) {
        const t = token.trim();
        if (!t) continue;
        if (t.includes('.')) {
            parts.add(t);
            acts.add(Number(t.split('.')[0]));
        } else {
            acts.add(Number(t));
        }
    }
    return { acts, parts };
}

// Find the first argv that looks like a filter (digits / dots / commas).
// Works for both `npm run demo 3` and `npm run demo -- 3`.
const _rawFilter = process.argv.slice(2).find(a => /^[\d.,]+$/.test(a));
export const activeFilter = parseDemoFilter(_rawFilter);

if (_rawFilter) {
    console.log(`[00:00.000] Demo filter: "${_rawFilter}"`);
}

/** Returns true if the given act number should run. */
export function shouldRunAct(n: number): boolean {
    return !activeFilter || activeFilter.acts.size === 0 || activeFilter.acts.has(n);
}

/**
 * Returns true if the given part (e.g. "2.4") should run.
 * When only whole-act selectors were given (e.g. "3"), all parts within that
 * act pass through.
 */
export function shouldRunPart(id: string): boolean {
    return !activeFilter || activeFilter.parts.size === 0 || activeFilter.parts.has(id);
}
