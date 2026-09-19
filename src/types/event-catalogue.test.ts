// R13 — no member declared in the event catalogue may remain inert.
//
// A declared-but-unused event is invisible to the compiler (it is a valid string
// constant and a valid payload type) and invisible to the UI (nothing throws,
// nothing renders differently). It only shows up as documentation that describes
// a mechanism the app does not have. `COMMAND_EXECUTED` sat in the catalogue from
// the first commit with neither an emitter nor a subscriber, which is exactly
// the drift this test exists to prevent from recurring.
//
// The test reads production sources rather than exercising behaviour, because
// "was this ever emitted" is a property of the code, not of any single run.
// Sources are gathered with `import.meta.glob` (Vite-native, and already typed
// through the `vite/client` types this project configures) rather than `node:fs`
// so the test needs no Node type definitions.
import { EventName } from './events';

/** Raw text of every production `.ts` file under `src/`, keyed by path. */
const allSources = import.meta.glob('/src/**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

/**
 * Raw text of the prose documentation, which the `.ts` glob above does not
 * match. The catalogue lives in markdown, so it needs its own glob.
 */
const allDocs = import.meta.glob('/src/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

const sources = Object.entries(allSources)
    .filter(([path]) => !path.endsWith('.test.ts'))
    .map(([path, contents]) => ({ path, contents }));

/** The catalogue's own file, where a member is *declared* rather than emitted. */
const CATALOGUE = '/src/types/events.ts';

describe('event catalogue hygiene (R13)', () => {
    const members = Object.entries(EventName);

    it('finds production sources to inspect (guards against a vacuous pass)', () => {
        // If the glob silently returned nothing, every assertion below would pass
        // without checking anything.
        expect(sources.length).toBeGreaterThan(50);
        expect(sources.some(s => s.path === CATALOGUE)).toBe(true);
    });

    it.each(members)('%s is emitted by production code', (memberName, eventValue) => {
        const emitters = sources.filter(
            ({ path, contents }) =>
                // Exclude the declaration site: declaring an event is not emitting it.
                path !== CATALOGUE &&
                (contents.includes(`emit(EventName.${memberName}`) ||
                    contents.includes(`emit('${eventValue}'`))
        );

        expect(
            emitters.map(e => e.path),
            `${memberName} is declared in the EventName catalogue but no production code emits it. ` +
                'Either wire it up or remove it — see R13.'
        ).not.toHaveLength(0);
    });

    it('has no member whose only reference is its own declaration', () => {
        // Catches a member that is *mentioned* (e.g. in a comment or an unrelated
        // string) but never emitted — the weaker check above could be satisfied by
        // an incidental textual match.
        const declarationOnly = members.filter(([memberName, eventValue]) => {
            const referencing = sources.filter(
                ({ contents }) =>
                    contents.includes(`EventName.${memberName}`) ||
                    contents.includes(`'${eventValue}'`)
            );
            return referencing.every(({ path }) => path === CATALOGUE);
        });

        expect(declarationOnly.map(([name]) => name)).toEqual([]);
    });
});

// The prose catalogue is what a reader consults before writing an emitter or a
// subscriber, and prose cannot be type-checked — so it drifts silently. It
// documented `moveRequested` as `{notation, viewId}` while the implemented type
// was `{moveNotation, viewId, tentative}`, and listed 5 of the 16 events while
// presenting that list as the contract. These checks pin the document to the
// type file, which is the only authority for what exists.
describe('documented event catalogue matches the implementation', () => {
    const docPath = '/src/docs/commanding-and-eventing-system.md';
    const doc = allDocs[docPath];

    it('finds the catalogue document (guards against a vacuous pass)', () => {
        expect(doc, `${docPath} should be readable as raw text`).toBeTruthy();
        expect(doc.length).toBeGreaterThan(1000);
    });

    it.each(Object.values(EventName))('%s is documented', eventValue => {
        expect(
            doc.includes(eventValue),
            `The catalogue documents no "${eventValue}" event. ` +
                'Add it to the event list in the "Proposed Solutions" section.'
        ).toBe(true);
    });

    it('documents the moveRequested payload with the implemented field names', () => {
        // The specific drift: the doc presented this payload as `{notation,
        // viewId}`. A reader following it writes `payload.notation` and reads
        // `undefined` with no type error, because prose is not type-checked.
        //
        // Checked as a payload shape rather than a bare word match, because a
        // bare `notation` is legitimate in two places: prose describing the field
        // ("moveNotation is the notation string"), and `moveDetails.notation`,
        // which is a real field on `moveExecuted`.
        expect(
            /\{notation\s*[,}]/.test(doc),
            'the document still shows a payload opening with a bare `notation` field'
        ).toBe(false);

        // Both halves of the drift: the renamed field and the omitted one.
        expect(doc, 'the renamed field `moveNotation` should be documented').toMatch(
            /moveNotation/
        );
        expect(doc, 'the required `tentative` field should be documented').toMatch(/tentative/);
    });

    it('records the retirement of COMMAND_EXECUTED as retired', () => {
        // Removing the member from the catalogue loses the fact that it ever
        // existed; a reader cannot tell the difference between "never existed"
        // and "deliberately removed". The doc must say which.
        expect(doc).toMatch(/COMMAND_EXECUTED/);
        expect(doc).toMatch(/retired/i);
    });
});
