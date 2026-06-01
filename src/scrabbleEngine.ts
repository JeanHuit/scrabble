import { Tile, BoardCell, CellMultiplier } from './types';

// Standard letter values in Scrabble
export const LETTER_VALUES: Record<string, number> = {
  'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4, 'I': 1,
  'J': 8, 'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1, 'P': 3, 'Q': 10, 'R': 1,
  'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8, 'Y': 4, 'Z': 10,
  '_': 0 // Blank/Wildcard tile
};

// Standard letter quantities in a Scrabble bag
export const LETTER_DISTRIBUTION: Record<string, number> = {
  'A': 9, 'B': 2, 'C': 2, 'D': 4, 'E': 12, 'F': 2, 'G': 3, 'H': 2, 'I': 9,
  'J': 1, 'K': 1, 'L': 4, 'M': 2, 'N': 6, 'O': 8, 'P': 2, 'Q': 1, 'R': 6,
  'S': 4, 'T': 6, 'U': 4, 'V': 2, 'W': 2, 'X': 1, 'Y': 2, 'Z': 1,
  '_': 2 // Blanks
};

// Generates a fully populated shuffled bag of tile objects
export function generateSharedBag(): string[] {
  const letters: string[] = [];
  for (const [letter, qty] of Object.entries(LETTER_DISTRIBUTION)) {
    for (let i = 0; i < qty; i++) {
      letters.push(letter);
    }
  }
  
  // Shuffle letters
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  
  return letters;
}

// Maps specific grid coordinates to standard premium multipliers
export function getCellMultiplier(row: number, col: number): CellMultiplier {
  // Center is Double Word (represented as DW or a custom visual center star)
  if (row === 7 && col === 7) return 'DW';
  
  // Triple Word Scores
  const twCoords = [
    [0, 0], [0, 7], [0, 14],
    [7, 0],          [7, 14],
    [14, 0], [14, 7], [14, 14]
  ];
  if (twCoords.some(([r, c]) => r === row && c === col)) return 'TW';
  
  // Double Word Scores
  const dwCoords = [
    [1, 1], [2, 2], [3, 3], [4, 4],
    [10, 10], [11, 11], [12, 12], [13, 13],
    [1, 13], [2, 12], [3, 11], [4, 10],
    [10, 4], [11, 3], [12, 2], [13, 1]
  ];
  if (dwCoords.some(([r, c]) => r === row && c === col)) return 'DW';
  
  // Triple Letter Scores
  const tlCoords = [
    [1, 5], [1, 9],
    [5, 1], [5, 5], [5, 9], [5, 13],
    [9, 1], [9, 5], [9, 9], [9, 13],
    [13, 5], [13, 9]
  ];
  if (tlCoords.some(([r, c]) => r === row && c === col)) return 'TL';
  
  // Double Letter Scores
  const dlCoords = [
    [0, 3], [0, 11],
    [2, 6], [2, 8],
    [3, 0], [3, 7], [3, 14],
    [6, 2], [6, 6], [6, 8], [6, 12],
    [7, 3], [7, 11],
    [8, 2], [8, 6], [8, 8], [8, 12],
    [11, 0], [11, 7], [11, 14],
    [12, 6], [12, 8],
    [14, 3], [14, 11]
  ];
  if (dlCoords.some(([r, c]) => r === row && c === col)) return 'DL';
  
  return 'normal';
}

// Check if cell is within bounds
export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 15 && col >= 0 && col < 15;
}

// Convert a grid of cells into static coordinates representation
export function getBoardGrid(placeCells: BoardCell[]): (BoardCell | undefined)[][] {
  const grid: (BoardCell | undefined)[][] = Array(15).fill(null).map(() => Array(15).fill(undefined));
  placeCells.forEach(cell => {
    if (inBounds(cell.row, cell.col)) {
      grid[cell.row][cell.col] = cell;
    }
  });
  return grid;
}

export interface ValidationResult {
  isValid: boolean;
  score: number;
  words: string[];
  errorMessage?: string;
}

/**
 * Validates a move on the board and calculates the points.
 * Rule constraints checked:
 * 1. Move has at least one tile.
 * 2. New tiles are laid in a single straight row or column.
 * 3. Newly placed tiles are contiguous, or bridged by existing locked tiles.
 * 4. Touches at least one existing locked tile, OR if board was empty, it covers the center tile (7,7).
 * 5. Calculates correct Scrabble scoring including premium combinations.
 */
export function validateAndScoreMove(
  allBoardCells: BoardCell[], // Already fixed + newly candidate tiles
  newlyPlacedCells: BoardCell[] // Only candidate files of current turn
): ValidationResult {
  if (newlyPlacedCells.length === 0) {
    return { isValid: false, score: 0, words: [], errorMessage: 'No tiles drafted on board.' };
  }

  // Create lookup structures
  const fixedCells = allBoardCells.filter(c => c.isFixed);
  const fixedGrid = getBoardGrid(fixedCells);
  const combinedGrid = getBoardGrid(allBoardCells);

  // 1. Verify standard constraints on new cells
  const isFirstTurn = fixedCells.length === 0;

  // Center cover check for first turn
  if (isFirstTurn) {
    const coversCenter = newlyPlacedCells.some(c => c.row === 7 && c.col === 7);
    if (!coversCenter) {
      return { isValid: false, score: 0, words: [], errorMessage: 'First move must cross the center tile star.' };
    }
  }

  // Row or Col alignment
  const rows = newlyPlacedCells.map(c => c.row);
  const cols = newlyPlacedCells.map(c => c.col);
  const uniqueRows = Array.from(new Set(rows));
  const uniqueCols = Array.from(new Set(cols));

  const isRowAligned = uniqueRows.length === 1;
  const isColAligned = uniqueCols.length === 1;

  if (!isRowAligned && !isColAligned) {
    return { isValid: false, score: 0, words: [], errorMessage: 'Tiles must be aligned in a single row or column.' };
  }

  // Gather coordinates of the alignment
  let alignDirection: 'row' | 'col';
  let fixedIndex: number; // Row number or col number that shares placement
  let minVarIndex: number;
  let maxVarIndex: number;

  if (isRowAligned) {
    alignDirection = 'row';
    fixedIndex = uniqueRows[0];
    const variables = newlyPlacedCells.map(c => c.col);
    minVarIndex = Math.min(...variables);
    maxVarIndex = Math.max(...variables);
  } else {
    alignDirection = 'col';
    fixedIndex = uniqueCols[0];
    const variables = newlyPlacedCells.map(c => c.row);
    minVarIndex = Math.min(...variables);
    maxVarIndex = Math.max(...variables);
  }

  // Ensure there are no gaps between the minimum and maximum placed tiles.
  // Real layout allows gap bridged by PRE-EXISTING fixed tiles.
  for (let idx = minVarIndex; idx <= maxVarIndex; idx++) {
    const row = alignDirection === 'row' ? fixedIndex : idx;
    const col = alignDirection === 'row' ? idx : fixedIndex;
    if (!combinedGrid[row][col]) {
      return { isValid: false, score: 0, words: [], errorMessage: 'Formed word must be continuous. No gaps allowed.' };
    }
  }

  // Ensure that the new placement touches at least one locked tile (unless first turn)
  if (!isFirstTurn) {
    let touchesExisting = false;
    for (const cell of newlyPlacedCells) {
      // Check immediate 4 cardinal neighbors
      const neighbors = [
        [cell.row - 1, cell.col],
        [cell.row + 1, cell.col],
        [cell.row, cell.col - 1],
        [cell.row, cell.col + 1]
      ];
      for (const [r, c] of neighbors) {
        if (inBounds(r, c) && fixedGrid[r][c]) {
          touchesExisting = true;
          break;
        }
      }
      if (touchesExisting) break;
    }

    if (!touchesExisting) {
      return { isValid: false, score: 0, words: [], errorMessage: 'New tiles must connect to tiles already on the board.' };
    }
  }

  // 2. Identify all words formed
  // A played word includes the main axis word, plus any newly formed perpendicular words!
  const formedWords: { word: string; cells: BoardCell[] }[] = [];

  // Main word extraction
  // Trace back to start of main word on axis
  let mainStart = minVarIndex;
  while (mainStart > 0) {
    const r = alignDirection === 'row' ? fixedIndex : mainStart - 1;
    const c = alignDirection === 'row' ? mainStart - 1 : fixedIndex;
    if (combinedGrid[r][c]) {
      mainStart--;
    } else {
      break;
    }
  }

  // Trace forward to end of main word
  let mainEnd = maxVarIndex;
  while (mainEnd < 14) {
    const r = alignDirection === 'row' ? fixedIndex : mainEnd + 1;
    const c = alignDirection === 'row' ? mainEnd + 1 : fixedIndex;
    if (combinedGrid[r][c]) {
      mainEnd++;
    } else {
      break;
    }
  }

  // Compile main word
  const mainCells: BoardCell[] = [];
  for (let idx = mainStart; idx <= mainEnd; idx++) {
    const r = alignDirection === 'row' ? fixedIndex : idx;
    const c = alignDirection === 'row' ? idx : fixedIndex;
    const cellRef = combinedGrid[r][c];
    if (cellRef) mainCells.push(cellRef);
  }

  if (mainCells.length > 1) {
    formedWords.push({
      word: mainCells.map(c => c.letter || '').join(''),
      cells: mainCells
    });
  }

  // Perpendicular words extraction
  for (const cell of newlyPlacedCells) {
    const rStart = cell.row;
    const cStart = cell.col;

    // We search perpendicular to the alignment direction
    const perpDir = alignDirection === 'row' ? 'col' : 'row';
    const cellIdx = alignDirection === 'row' ? rStart : cStart;

    let perpMin = cellIdx;
    while (perpMin > 0) {
      const r = perpDir === 'row' ? perpMin - 1 : rStart;
      const c = perpDir === 'col' ? perpMin - 1 : cStart;
      if (combinedGrid[r][c]) {
        perpMin--;
      } else {
        break;
      }
    }

    let perpMax = cellIdx;
    while (perpMax < 14) {
      const r = perpDir === 'row' ? perpMax + 1 : rStart;
      const c = perpDir === 'col' ? perpMax + 1 : cStart;
      if (combinedGrid[r][c]) {
        perpMax++;
      } else {
        break;
      }
    }

    if (perpMin !== perpMax) {
      const perpCells: BoardCell[] = [];
      for (let idx = perpMin; idx <= perpMax; idx++) {
        const r = perpDir === 'row' ? idx : rStart;
        const c = perpDir === 'col' ? idx : cStart;
        const cellRef = combinedGrid[r][c];
        if (cellRef) perpCells.push(cellRef);
      }
      formedWords.push({
        word: perpCells.map(c => c.letter || '').join(''),
        cells: perpCells
      });
    }
  }

  // If list empty but we had 1 tile on the center, it represents a single letter word.
  // Normal scrabble doesn't end turn with 1 letter word that touches nothing, except on first turn.
  if (formedWords.length === 0 && isFirstTurn && newlyPlacedCells.length === 1) {
    formedWords.push({
      word: newlyPlacedCells[0].letter || '',
      cells: newlyPlacedCells
    });
  }

  if (formedWords.length === 0) {
    return { isValid: false, score: 0, words: [], errorMessage: 'Tiles must form at least one connected word.' };
  }

  // 3. Compute Scoring
  // Standard Scrabble scoring:
  // For each word formed:
  // - Sum up letters * premium letter multipliers (DL/TL apply ONLY to newly placed tiles in those locations).
  // - Multiply final sum * premium word multipliers (DW/TW apply ONLY to newly placed tiles in those locations).
  // - Double word covers can accumulate (e.g. 2 Double Words = 4x total word score).
  let totalScore = 0;
  const wordStrings: string[] = [];

  for (const { word, cells } of formedWords) {
    wordStrings.push(word);
    let wordSum = 0;
    let wordMultiplier = 1;

    for (const cell of cells) {
      // Base score of letter
      const baseValue = LETTER_VALUES[cell.letter || ''] || 0;
      
      // Check if this was a NEWLY placed tile (premium multipliers only trigger once)
      const isNew = newlyPlacedCells.some(nc => nc.row === cell.row && nc.col === cell.col);
      
      if (isNew) {
        const mult = getCellMultiplier(cell.row, cell.col);
        if (mult === 'DL') {
          wordSum += baseValue * 2;
        } else if (mult === 'TL') {
          wordSum += baseValue * 3;
        } else {
          wordSum += baseValue;
        }

        if (mult === 'DW') {
          wordMultiplier *= 2;
        } else if (mult === 'TW') {
          wordMultiplier *= 3;
        }
      } else {
        // Locked static pre-existing tiles have normal scores with no multiplier triggers
        wordSum += baseValue;
      }
    }

    totalScore += wordSum * wordMultiplier;
  }

  // Standard Scrabble Bingo: playing all 7 tiles from rack gives +50 raw bonus points!
  if (newlyPlacedCells.length === 7) {
    totalScore += 50;
  }

  return {
    isValid: true,
    score: totalScore,
    words: wordStrings
  };
}
