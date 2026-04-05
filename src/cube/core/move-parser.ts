import type { MoveDefinition } from '@/cube/types/move';

import { CubeInvariants, getCubeInvariants } from './cube-invariants';
import { getMoveDefinition } from './move-engine';

/**
 * Parse a move string (possibly containing multiple moves) into an array of MoveDefinitions
 * @param moveString - The move notation string (e.g., "R U R' U'")
 * @returns Array of parsed move definitions
 */
export function parseStringMove(moveString: string, cubeSize: number = 3): MoveDefinition[] {
    const normalized = normalizeMoveNotation(moveString.trim());
    if (normalized.length === 0) {
        throw new Error('Empty move string');
    }

    const tokens = normalized.split(/\s+/).filter(token => token.length > 0);
    const moves: MoveDefinition[] = [];
    const invariants = getCubeInvariants(cubeSize);

    for (const token of tokens) {
        moves.push(parseNotationToken(invariants, token));
    }

    return moves;
}

/**
 * Get the inverse of a given move notation
 * @param move - The move notation to invert
 * @returns The inverse move notation
 */
export function getInverseMove(move: string): string {
    // Handle slice moves M, E, S
    if (move.length === 1 || (move.length === 2 && (move[1] === "'" || move[1] === '2'))) {
        const face = move[0];
        const modifier = move.length > 1 ? move[1] : '';
        if (modifier === '') return `${face}'`;
        if (modifier === "'") return face;
        if (modifier === '2') return move;
    }

    // Handle wide moves and regular moves
    const match = move.match(/^(\d*)([LRUDFBMES])(w?)(['2]?)$/);
    if (match) {
        const [, num, face, w, modifier] = match;
        const prefix = num || (w ? '' : ''); // keep num, or empty
        const wide = w || '';
        if (modifier === '') return `${prefix}${face}${wide}'`;
        if (modifier === "'") return `${prefix}${face}${wide}`;
        if (modifier === '2') return move;
    }

    // Fallback
    if (move.endsWith("'")) return move.slice(0, -1);
    if (move.endsWith('2')) return move;
    return move + "'";
}

/**
 * Parse a single move notation token into a MoveDefinition
 * @param notation - Single move notation (e.g., "R", "U'", "2Rw")
 * @returns Parsed move definition
 */
function parseNotationToken(invariants: CubeInvariants, notation: string): MoveDefinition {
    const match = notation.match(/^(\d*)([A-Za-z]+)(['2]?)$/);
    if (!match) {
        throw new Error(`Invalid move: ${notation}`);
    }

    const [, prefix, letters, suffix] = match;
    const canonicalLetters = canonicalizeLetters(letters);
    const canonical = `${prefix ?? ''}${canonicalLetters}${suffix ?? ''}`;

    const move = getMoveDefinition(invariants, canonical);

    return move;
}

/**
 * Canonicalize letter casing in move notation
 * @param letters - The letter part of the move notation
 * @returns Canonicalized letters
 */
function canonicalizeLetters(letters: string): string {
    if (letters.length === 0) {
        return letters;
    }

    if (letters.length === 1) {
        const lower = letters.toLowerCase();
        if (lower === 'x' || lower === 'y' || lower === 'z') {
            return lower;
        }
        return letters.toUpperCase();
    }

    const chars = [...letters];
    let result = '';

    chars.forEach((char, index) => {
        if (index === 0) {
            const lower = char.toLowerCase();
            if (lower === 'x' || lower === 'y' || lower === 'z') {
                result += lower;
            } else {
                result += char.toUpperCase();
            }
            return;
        }

        if (index === chars.length - 1 && char.toLowerCase() === 'w') {
            result += 'w';
        } else {
            result += char.toUpperCase();
        }
    });

    return result;
}

/**
 * Normalize move notation by replacing various apostrophe-like characters
 * @param moveString - Raw move string
 * @returns Normalized move string
 */
function normalizeMoveNotation(moveString: string): string {
    // Replace various apostrophe-like characters with standard apostrophe
    return (
        moveString
            // Replace various apostrophe-like characters with standard apostrophe
            .replace(/[''′″`\u2018\u2019]/g, "'")
    );
}
