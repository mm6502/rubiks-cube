// Helpers for asserting on the Basic view's stylesheet from jsdom tests.
//
// jsdom implements no layout, no compositing and no 3D, so tests in this directory cannot
// observe anything a browser would render — no culling difference, no cell width, no seam.
// What they CAN do, honestly, is pin the declarations that carry a contract. Several
// regressions in this view (the backface-culling flash, the ghost strips' grid metrics)
// were wrong DECLARATIONS rather than wrong code, and no rendered assertion in jsdom could
// have caught either one. Parsing the stylesheet is the only way to pin them.
//
// The stylesheet is read with `node:fs`, not `?raw`. Vite's CSS-modules plugin intercepts
// `?raw` and `?inline` for a `.module.css` path and returns a class-name proxy and an empty
// string respectively (both measured), so `import.meta.glob(…, '?raw')` — the convention
// used by `src/types/event-catalogue.test.ts` — is not available for a stylesheet. The
// `node` types are pulled in for these consumers alone by a `/// <reference types="node" />`
// in each test file, rather than by widening the project's `types` array, so no other test
// gains an implicit Node dependency.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The Basic view stylesheet with comments removed.
 *
 * Stripping first is not tidiness — it is required for correctness. These rules carry long
 * explanatory comments that mention property names and braces in prose, and a naive scan
 * either matches a property name out of a sentence or has its `[^}]*` capture run past the
 * declaration it was meant to read. Removing comments makes the remaining text pure
 * declarations, so the scans see exactly what the browser would.
 */
export const basicViewCss = readFileSync(
    resolve(__dirname, 'basic-view.module.css'),
    'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '');

/** The ghost strip stylesheet, with comments stripped for the same reason. */
export const ghostStripCss = readFileSync(
    resolve(__dirname, 'ghost-stickers.module.css'),
    'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declaration block of a rule, by selector, in the given stylesheet.
 *
 * Deliberately a plain text scan rather than a CSS parser: these files have no parser
 * dependency, and the selectors used are single, unique rules. The function throws when a
 * selector is missing or ambiguous, so a rename cannot silently turn an assertion into a
 * no-op — which is the failure mode a "contains" check on the whole file would have.
 *
 * Selector matching is whitespace-insensitive: a selector written across several lines
 * (`a,\n b {`) matches the same search as `a, b`, because the comparison collapses runs of
 * whitespace on both sides. That is what makes multi-line selector lists usable without
 * the caller having to reproduce their exact line breaks.
 *
 * A grouped selector list can be looked up EITHER by its full text or by any one of its
 * members. Both forms are in use: callers asserting on a shared rule pass the whole list,
 * while a caller asking "what style does this one selector resolve to?" passes a single
 * member. Grouping is how this codebase states that several rules are deliberately one
 * style, so it has to be assertable from either direction — otherwise the only way to pin
 * a shared style would be to write it out once per member, which is the drift the grouping
 * exists to prevent.
 *
 * @param selector - The selector text to find; line breaks and spacing are normalised
 * @param css - The comment-stripped stylesheet to search (defaults to the Basic view)
 */
export function blockFor(selector: string, css: string = basicViewCss): string {
    const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();
    const wanted = normalise(selector);

    // Walk every `selector { … }` pair in the sheet, normalising each selector as we go.
    const found: string[] = [];
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = rulePattern.exec(css)) !== null) {
        const ruleSelector = normalise(match[1]);
        const matchesWholeList = ruleSelector === wanted;
        const matchesOneMember = ruleSelector.split(',').some(part => part.trim() === wanted);
        if (matchesWholeList || matchesOneMember) found.push(match[2]);
    }

    if (found.length === 0) throw new Error(`no rule found for ${selector}`);
    if (found.length > 1) throw new Error(`ambiguous: ${found.length} rules for ${selector}`);
    return found[0];
}

/** A declaration's value, normalised to lower case; `undefined` when absent. */
export function valueOf(block: string, property: string): string | undefined {
    // Properties may follow `{`, `;` or a newline, so allow any of them rather than `;` alone.
    const match = new RegExp(`(?:^|[;{\\n])\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(block);
    return match?.[1].trim().toLowerCase();
}
