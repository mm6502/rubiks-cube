/**
 * Demo part/act filter — parsed once from process.argv so both
 * record-demo.ts and acts.ts can import the helpers without creating
 * a circular dependency.
 *
 * Usage:
 *   npm run demo                        → full demo (video + snapshots + assemble)
 *   npm run demo -- --mode video        → video only (no snapshots)
 *   npm run demo -- --mode snapshots    → snapshots only (no video, no assemble)
 *   npm run demo -- --mode assemble     → assemble existing snapshots into gif/apng
 *   npm run demo -- 3                   → all parts of Act 3
 *   npm run demo -- 2.4,2.6            → only parts 2.4 and 2.6
 *   npm run demo -- 1,4                 → all of Act 1 + all of Act 4
 */

// ─── Recording mode ─────────────────────────────────────────────────────────

export type DemoMode = 'full' | 'video' | 'snapshots' | 'assemble';

function parseDemoMode(argv: string[]): DemoMode {
    const idx = argv.indexOf('--mode');
    if (idx === -1 || idx + 1 >= argv.length) return 'full';
    const val = argv[idx + 1];
    if (val === 'video' || val === 'snapshots' || val === 'assemble') return val;
    return 'full';
}

export const demoMode: DemoMode = parseDemoMode(process.argv);

if (demoMode !== 'full') {
    console.log(`[00:00.000] Demo mode: ${demoMode}`);
}

// ─── Act / part filter ──────────────────────────────────────────────────────

interface DemoFilter {
    acts: Set<number>; // empty = all acts
    parts: Set<string>; // empty = all parts within selected acts
}

function parseDemoFilter(raw: string | undefined): DemoFilter | null {
    if (!raw || !/^(?=.*\d)[\d.,a-z]+$/i.test(raw)) return null;
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

// Find the first argv that looks like a filter (digits / dots / commas,
// with optional trailing letter for sub-part IDs like "2.2b").
// Works for both `npm run demo 3` and `npm run demo -- 3`.
const _rawFilter = process.argv.slice(2).find(a => /^(?=.*\d)[\d.,a-z]+$/i.test(a));
export const activeFilter = parseDemoFilter(_rawFilter);

if (_rawFilter) {
    console.log(`[00:00.000] Demo filter: "${_rawFilter}"`);
}

/** Returns true if the given act number should run. */
export function shouldRunAct(n: number): boolean {
    return !activeFilter || activeFilter.acts.size === 0 || activeFilter.acts.has(n);
}

/**
 * Returns true if the given part (e.g. "2.4" or "2.2b") should run.
 * When only whole-act selectors were given (e.g. "3"), all parts within that
 * act pass through.  Sub-part IDs inherit from their parent: if the filter
 * contains "2.2", then "2.2b" also passes.
 */
export function shouldRunPart(id: string): boolean {
    if (!activeFilter) return true;
    if (activeFilter.parts.size === 0) return true;
    if (activeFilter.parts.has(id)) return true;
    // Check prefix match: "2.2b" passes when filter contains "2.2"
    for (const p of activeFilter.parts) {
        if (id.startsWith(p)) return true;
    }
    return false;
}
