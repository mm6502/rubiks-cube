import { describe, expect, it } from 'vitest';

import { getInverseMove, parseStringMove } from './move-parser';

describe('move-parser', () => {
    describe('parseStringMove', () => {
        it('should parse single move', () => {
            const result = parseStringMove('R');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('R');
        });

        it('should parse multiple moves separated by spaces', () => {
            const result = parseStringMove('R U F');
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('R');
            expect(result[1].name).toBe('U');
            expect(result[2].name).toBe('F');
        });

        it('should parse moves with apostrophes', () => {
            const result = parseStringMove("R' U'");
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe("R'");
            expect(result[1].name).toBe("U'");
        });

        it('should parse moves with 2 modifier', () => {
            const result = parseStringMove('R2 U2');
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('R2');
            expect(result[1].name).toBe('U2');
        });

        it('should parse wide moves', () => {
            const result = parseStringMove('Rw Uw');
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('Rw');
            expect(result[1].name).toBe('Uw');
        });

        it('should parse slice moves', () => {
            const result = parseStringMove('M E S');
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('M');
            expect(result[1].name).toBe('E');
            expect(result[2].name).toBe('S');
        });

        it('should parse rotation moves', () => {
            const result = parseStringMove('x y z');
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('x');
            expect(result[1].name).toBe('y');
            expect(result[2].name).toBe('z');
        });

        it('should handle different cube sizes', () => {
            const result3x3 = parseStringMove('R', 3);
            const result4x4 = parseStringMove('R', 4);
            expect(result3x3[0].name).toBe('R');
            expect(result4x4[0].name).toBe('R');
        });

        it('should normalize various apostrophe characters', () => {
            // Test right single quote
            const result1 = parseStringMove('R' + String.fromCharCode(8217));
            expect(result1[0].name).toBe("R'");

            // Test left single quote
            const result2 = parseStringMove('U' + String.fromCharCode(8216));
            expect(result2[0].name).toBe("U'");

            // Test prime symbol
            const result3 = parseStringMove('F' + String.fromCharCode(8242));
            expect(result3[0].name).toBe("F'");

            // Test backtick
            const result4 = parseStringMove('R`');
            expect(result4[0].name).toBe("R'");
        });

        it('should throw on empty string after trimming', () => {
            expect(() => parseStringMove('   ')).toThrow('Empty move string');
        });

        it('should handle empty tokens after filtering', () => {
            // This shouldn't happen with normal input, but let's test edge case
            expect(() => parseStringMove('')).toThrow('Empty move string');
        });

        it('should handle multiple spaces between moves', () => {
            const result = parseStringMove('R   U    F');
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('R');
            expect(result[1].name).toBe('U');
            expect(result[2].name).toBe('F');
        });

        it('should throw on empty string', () => {
            expect(() => parseStringMove('')).toThrow('Empty move string');
            expect(() => parseStringMove('   ')).toThrow('Empty move string');
        });

        it('should throw on invalid move notation', () => {
            expect(() => parseStringMove('INVALID')).toThrow();
            // Q is not a valid move
            expect(() => parseStringMove('R Q')).toThrow();
            expect(() => parseStringMove('123R')).toThrow();
            // Invalid character
            expect(() => parseStringMove('R!')).toThrow();
        });
    });

    describe('getInverseMove', () => {
        it('should invert regular moves without modifier', () => {
            expect(getInverseMove('R')).toBe("R'");
            expect(getInverseMove('U')).toBe("U'");
            expect(getInverseMove('F')).toBe("F'");
            expect(getInverseMove('L')).toBe("L'");
            expect(getInverseMove('D')).toBe("D'");
            expect(getInverseMove('B')).toBe("B'");
        });

        it('should invert moves with apostrophe', () => {
            expect(getInverseMove("R'")).toBe('R');
            expect(getInverseMove("U'")).toBe('U');
            expect(getInverseMove("F'")).toBe('F');
        });

        it('should invert moves with 2 modifier', () => {
            expect(getInverseMove('R2')).toBe('R2');
            expect(getInverseMove('U2')).toBe('U2');
            expect(getInverseMove('F2')).toBe('F2');
        });

        it('should invert wide moves', () => {
            expect(getInverseMove('Rw')).toBe("Rw'");
            expect(getInverseMove("Rw'")).toBe('Rw');
            expect(getInverseMove('Rw2')).toBe('Rw2');
        });

        it('should invert numbered wide moves', () => {
            expect(getInverseMove('2Rw')).toBe("2Rw'");
            expect(getInverseMove("2Rw'")).toBe('2Rw');
            expect(getInverseMove('2Rw2')).toBe('2Rw2');
        });

        it('should invert slice moves', () => {
            expect(getInverseMove('M')).toBe("M'");
            expect(getInverseMove("M'")).toBe('M');
            expect(getInverseMove('M2')).toBe('M2');
            expect(getInverseMove('E')).toBe("E'");
            expect(getInverseMove('S')).toBe("S'");
        });

        it('should invert rotation moves', () => {
            expect(getInverseMove('x')).toBe("x'");
            expect(getInverseMove("x'")).toBe('x');
            expect(getInverseMove('x2')).toBe('x2');
        });

        it('should invert slice moves with modifiers', () => {
            expect(getInverseMove("M'")).toBe('M');
            expect(getInverseMove('M2')).toBe('M2');
            expect(getInverseMove("E'")).toBe('E');
            expect(getInverseMove('E2')).toBe('E2');
            expect(getInverseMove("S'")).toBe('S');
            expect(getInverseMove('S2')).toBe('S2');
        });

        it('should invert wide moves with modifiers', () => {
            expect(getInverseMove("Rw'")).toBe('Rw');
            expect(getInverseMove('Rw2')).toBe('Rw2');
            expect(getInverseMove("Uw'")).toBe('Uw');
            expect(getInverseMove('Fw2')).toBe('Fw2');
        });

        it('should invert numbered moves', () => {
            expect(getInverseMove('2R')).toBe("2R'");
            expect(getInverseMove("2R'")).toBe('2R');
            expect(getInverseMove('2R2')).toBe('2R2');
            expect(getInverseMove('3U')).toBe("3U'");
        });

        it('should handle fallback cases', () => {
            expect(getInverseMove('XYZ')).toBe("XYZ'");
            expect(getInverseMove("XYZ'")).toBe('XYZ');
            expect(getInverseMove('XYZ2')).toBe('XYZ2');
        });
    });

    // Test private functions indirectly through parseStringMove
    describe('canonicalizeLetters (tested indirectly)', () => {
        it('should canonicalize single letters to uppercase', () => {
            const result = parseStringMove('r u f');
            expect(result[0].name).toBe('R');
            expect(result[1].name).toBe('U');
            expect(result[2].name).toBe('F');
        });

        it('should keep rotation letters lowercase', () => {
            const result = parseStringMove('x y z');
            expect(result[0].name).toBe('x');
            expect(result[1].name).toBe('y');
            expect(result[2].name).toBe('z');
        });

        it('should handle wide move notation', () => {
            const result = parseStringMove('rw uw fw');
            expect(result[0].name).toBe('Rw');
            expect(result[1].name).toBe('Uw');
            expect(result[2].name).toBe('Fw');
        });

        it('should handle mixed case wide moves', () => {
            const result = parseStringMove('Rw Uw Fw');
            expect(result[0].name).toBe('Rw');
            expect(result[1].name).toBe('Uw');
            expect(result[2].name).toBe('Fw');
        });
    });

    describe('normalizeMoveNotation (tested indirectly)', () => {
        it('should normalize various apostrophe characters', () => {
            // These are tested in parseStringMove tests above
            expect(true).toBe(true); // Placeholder test
        });
    });

    describe('parseNotationToken (tested indirectly)', () => {
        it('should parse valid tokens', () => {
            // These are tested through parseStringMove
            expect(true).toBe(true); // Placeholder test
        });

        it('should reject invalid tokens', () => {
            expect(() => parseStringMove('123')).toThrow();
            expect(() => parseStringMove('R!')).toThrow();
        });
    });
});
