import React from 'react';
import { BoardCell } from '../types';
import { getCellMultiplier, LETTER_VALUES } from '../scrabbleEngine';

interface GameBoardProps {
  board: BoardCell[];                     // Fixed/committed game tiles
  tempPlacements: BoardCell[];            // Active player's uncommitted draft placements
  selectedTileId: string | null;          // Currently selected tile from rack
  onCellClick: (row: number, col: number) => void;
  onRecallTile: (row: number, col: number) => void; // Allow recalling a draft tile by tapping it
}

export const GameBoard: React.FC<GameBoardProps> = ({
  board,
  tempPlacements,
  selectedTileId,
  onCellClick,
  onRecallTile
}) => {
  // Combine fixed and temporary placements into a 15x15 grid lookup
  const grid: { cell?: BoardCell; isTemp: boolean }[][] = Array(15)
    .fill(null)
    .map(() => Array(15).fill(null).map(() => ({ isTemp: false })));

  // Populate fixed board tiles
  board.forEach(cell => {
    grid[cell.row][cell.col] = { cell, isTemp: false };
  });

  // Populate temp draft tiles
  tempPlacements.forEach(cell => {
    grid[cell.row][cell.col] = { cell, isTemp: true };
  });

  // Decide specific style classes for multipliers
  const getMultiplierStyle = (row: number, col: number) => {
    if (row === 7 && col === 7) {
      return 'bg-amber-100 border-amber-300 text-amber-700 font-bold'; // Center star
    }
    const mult = getCellMultiplier(row, col);
    switch (mult) {
      case 'TW':
        return 'bg-rose-500 border-rose-600 text-white font-black text-[9px] sm:text-[10px]';
      case 'DW':
        return 'bg-rose-200 border-rose-300 text-rose-700 font-bold text-[9px] sm:text-[10px]';
      case 'TL':
        return 'bg-blue-500 border-blue-600 text-white font-black text-[9px] sm:text-[10px]';
      case 'DL':
        return 'bg-blue-100 border-blue-200 text-blue-700 font-bold text-[9px] sm:text-[10px]';
      default:
        return 'bg-emerald-50/40 border-slate-100 text-slate-300';
    }
  };

  const getMultiplierLabel = (row: number, col: number) => {
    if (row === 7 && col === 7) return '★';
    const mult = getCellMultiplier(row, col);
    return mult === 'normal' ? '' : mult;
  };

  return (
    <div id="scrabble-grid-container" className="w-full max-w-[min(100vw-24px,100vh-320px)] aspect-square mx-auto bg-[#0f342a] p-1 sm:p-3 rounded-2xl shadow-xl border border-[#0d2a21]">
      <div className="grid grid-cols-15 grid-rows-15 gap-[1px] sm:gap-[2px] md:gap-1 w-full h-full">
        {Array.from({ length: 15 }).map((_, row) => (
          Array.from({ length: 15 }).map((_, col) => {
            const { cell, isTemp } = grid[row][col];
            const hasTile = !!cell;
            const multStyle = getMultiplierStyle(row, col);
            const label = getMultiplierLabel(row, col);

            return (
              <button
                key={`${row}-${col}`}
                id={`cell-${row}-${col}`}
                onClick={() => {
                  if (hasTile) {
                    if (isTemp) {
                      onRecallTile(row, col);
                    }
                  } else {
                    onCellClick(row, col);
                  }
                }}
                disabled={hasTile && !isTemp} // Can't touch committed items
                className={`
                  relative aspect-square flex items-center justify-center rounded-sm sm:rounded-md border text-center transition-all duration-200 select-none
                  ${hasTile 
                    ? isTemp 
                      ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-300 animate-pulse hover:bg-amber-200' 
                      : 'bg-amber-50 border-amber-200 shadow-sm cursor-not-allowed'
                    : `${multStyle} hover:brightness-105 active:scale-95`
                  }
                `}
              >
                {hasTile ? (
                  // Elegant wooden tile visual representation
                  <div className="absolute inset-0.5 bg-[#f5dfb8] rounded border border-[#d6bc8a] shadow flex flex-col items-center justify-center text-slate-800 font-semibold select-none leading-none">
                    <span className="text-[10px] xs:text-sm sm:text-lg md:text-xl font-bold tracking-tight leading-none">
                      {cell.letter === '_' ? ' ' : cell.letter}
                    </span>
                    <span className="absolute bottom-0.5 right-0.5 text-[6px] xs:text-[7px] sm:text-[9px] font-medium text-slate-500 leading-none">
                      {LETTER_VALUES[cell.letter || ''] ?? 0}
                    </span>
                    {isTemp && (
                      <span className="absolute top-[2px] left-[2px] text-[5px] text-amber-600 bg-amber-200/60 px-0.5 rounded uppercase leading-none font-bold">
                        Draft
                      </span>
                    )}
                  </div>
                ) : (
                  // Multiplier or blank field labels
                  <span className="text-[5px] xs:text-[7px] sm:text-[10px] uppercase pointer-events-none select-none tracking-tighter">
                    {label}
                  </span>
                )}
              </button>
            );
          })
        ))}
      </div>
    </div>
  );
};
