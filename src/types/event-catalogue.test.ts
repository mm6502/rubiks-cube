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
