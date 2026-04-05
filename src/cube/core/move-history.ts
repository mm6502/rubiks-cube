/**
 * Manages move history with undo/redo capability using string notation
 * Stores moves as strings (e.g., "R", "U'", "F2") for simplicity and compatibility
 */
export class MoveHistory {
    private moves: string[] = [];
    private currentIndex: number = -1;

    /**
     * Create a new move history
     * @param initialMoves - Optional array of initial moves to populate history
     */
    constructor(initialMoves?: string[]) {
        if (initialMoves && initialMoves.length > 0) {
            this.moves = [...initialMoves];
            this.currentIndex = initialMoves.length - 1;
        }
    }

    /**
     * Create a copy of the current MoveHistory instance
     * @returns A new MoveHistory instance with the same moves and current index
     */
    copy(): MoveHistory {
        const copy = new MoveHistory(this.moves);
        copy.currentIndex = this.currentIndex;
        return copy;
    }

    /**
     * Add a move to the history, truncating any future moves if not at the end
     * @param move - The move notation to add (e.g., "R", "U'", "F2")
     */
    addMove(move: string): void {
        // If we're not at the end, truncate future moves (clears redo history)
        if (this.currentIndex < this.moves.length - 1) {
            this.moves = this.moves.slice(0, this.currentIndex + 1);
        }

        this.moves.push(move);
        this.currentIndex = this.moves.length - 1;
    }

    /**
     * Undo the last move
     * @returns The move notation that was undone (to be inverted), or undefined if nothing to undo
     */
    undo(): string | undefined {
        if (!this.canUndo()) {
            return undefined;
        }

        const move = this.moves[this.currentIndex];
        this.currentIndex--;
        return move;
    }

    /**
     * Redo the next move
     * @returns The move notation to reapply, or undefined if nothing to redo
     */
    redo(): string | undefined {
        if (!this.canRedo()) {
            return undefined;
        }

        this.currentIndex++;
        return this.moves[this.currentIndex];
    }

    /**
     * Check if undo operation is available
     * @returns True if there are moves that can be undone
     */
    canUndo(): boolean {
        return this.currentIndex >= 0;
    }

    /**
     * Check if redo operation is available
     * @returns True if there are moves that can be redone
     */
    canRedo(): boolean {
        return this.currentIndex < this.moves.length - 1;
    }

    /**
     * Get all moves up to the current position in history
     * @returns Array of move notations from the beginning up to current position
     */
    getCurrentMoves(): string[] {
        return this.moves.slice(0, this.currentIndex + 1);
    }

    /**
     * Clear all history
     */
    clear(): void {
        this.moves = [];
        this.currentIndex = -1;
    }

    /**
     * Get the full moves array (read-only)
     * @returns Readonly array of all moves in history
     */
    getMoves(): readonly string[] {
        return this.moves;
    }

    /**
     * Get the current index in history
     * @returns Current position (-1 means at beginning, before any moves)
     */
    getCurrentIndex(): number {
        return this.currentIndex;
    }

    /**
     * Get all moves in history (including undone moves)
     * @returns Readonly array of all moves
     */
    getHistory(): ReadonlyArray<string> {
        return this.moves;
    }

    /**
     * Get the redo stack (moves that have been undone)
     * @returns Readonly array of moves available for redo
     */
    getRedoStack(): ReadonlyArray<string> {
        if (this.currentIndex >= this.moves.length - 1) {
            return [];
        }
        return this.moves.slice(this.currentIndex + 1);
    }

    /**
     * Get the total number of moves in history
     * @returns Total size of the move history
     */
    getSize(): number {
        return this.moves.length;
    }

    /**
     * Check if history is empty
     * @returns True if no moves are stored
     */
    isEmpty(): boolean {
        return this.moves.length === 0;
    }

    /**
     * Get the last executed move
     * @returns The last move notation that was executed, or undefined if no moves
     */
    getLastMove(): string | undefined {
        if (this.currentIndex < 0) {
            return undefined;
        }
        return this.moves[this.currentIndex];
    }

    /**
     * Serialize the history to a string
     * @returns Space-delimited string of all moves with currentIndex marker
     * Format: "move1 move2 move3:currentIndex" where : separates moves from index
     * If at the end, just returns "move1 move2 move3"
     */
    serialize(): string {
        if (this.moves.length === 0) {
            return '';
        }

        const movesString = this.moves.join(' ');

        // Only include index if we're not at the end (i.e., there are undone moves)
        if (this.currentIndex < this.moves.length - 1) {
            return `${movesString}:${this.currentIndex}`;
        }

        return movesString;
    }

    /**
     * Deserialize history from a string of moves
     * @param movesString - Space-delimited string of move notations with optional index
     *                      Format: "R U R' F2" or "R U R' F2:1" (where 1 is currentIndex)
     * @returns A new MoveHistory instance
     * @throws Error if moves string is invalid
     */
    static deserialize(movesString: string): MoveHistory {
        try {
            if (!movesString || typeof movesString !== 'string') {
                return new MoveHistory();
            }

            const trimmed = movesString.trim();
            if (trimmed === '') {
                return new MoveHistory();
            }

            // Check if there's a currentIndex marker
            const parts = trimmed.split(':');
            const movesPart = parts[0].trim();
            const indexPart = parts[1]?.trim();

            if (!movesPart) {
                return new MoveHistory();
            }

            const moves = movesPart.split(/\s+/);
            const history = new MoveHistory(moves);

            // If there's an index part, adjust the currentIndex
            if (indexPart !== undefined) {
                const index = parseInt(indexPart, 10);
                if (!isNaN(index) && index >= -1 && index < moves.length) {
                    history.currentIndex = index;
                }
            }

            return history;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to deserialize move history: ${message}`);
        }
    }
}
