import React, { useState } from 'react';
import { Tile, BoardCell } from '../types';
import { validateAndScoreMove } from '../scrabbleEngine';
import { RefreshCw, Play, RotateCcw, SkipForward, Ban } from 'lucide-react';

interface ActiveGameControlsProps {
  rack: Tile[];
  tempPlacements: BoardCell[];
  allBoardCells: BoardCell[];
  selectedTileId: string | null;
  isMyTurn: boolean;
  rackExchangeSelection: string[]; // List of tile IDs marked for exchange
  onSelectTile: (tileId: string) => void;
  onToggleExchangeTile: (tileId: string) => void;
  onCommitMove: () => void;
  onRecallAll: () => void;
  onExchangeSelected: () => void;
  onPassTurn: () => void;
  onResign: () => void;
}

export const ActiveGameControls: React.FC<ActiveGameControlsProps> = ({
  rack,
  tempPlacements,
  allBoardCells,
  selectedTileId,
  isMyTurn,
  rackExchangeSelection,
  onSelectTile,
  onToggleExchangeTile,
  onCommitMove,
  onRecallAll,
  onExchangeSelected,
  onPassTurn,
  onResign,
}) => {
  const [exchangeMode, setExchangeMode] = useState(false);

  // Calculate live temporary score or error warnings
  const validation = validateAndScoreMove(
    [...allBoardCells.filter(c => c.isFixed), ...tempPlacements],
    tempPlacements
  );

  return (
    <div id="game-controls-container" className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-4">
      {/* Dynamic Word & Point Preview Banner */}
      {tempPlacements.length > 0 && (
        <div id="word-placement-analyzer-banner" className={`p-3 rounded-lg border text-center transition-all duration-300 ${
          validation.isValid 
            ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-400' 
            : 'bg-rose-900/20 border-rose-500/30 text-rose-300'
        }`}>
          {validation.isValid ? (
            <div className="flex flex-col items-center">
              <span className="text-[11px] uppercase tracking-widest text-emerald-500 font-bold">Valid Formation!</span>
              <span className="text-xl font-bold">
                "{validation.words.join(', ')}" <span className="text-emerald-300 text-lg font-black font-mono">+{validation.score} pts</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-xs text-rose-300">
              <span className="font-semibold">⚠️ Move Status:</span>
              <span>{validation.errorMessage || 'Invalid tile layout'}</span>
            </div>
          )}
        </div>
      )}

      {/* Selector Info or Status Header */}
      <div className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800 pb-2.5">
        <span>{exchangeMode ? 'Select tiles to exchange' : 'Tap a tile, then tap a cell to place'}</span>
        <div className="flex gap-2">
          <button 
            id="toggle-exchange-btn"
            onClick={() => {
              setExchangeMode(!exchangeMode);
              if (!exchangeMode) onRecallAll(); // Recall current layout to allow swapping
            }}
            disabled={!isMyTurn}
            className={`px-2 py-0.5 rounded transition ${
              exchangeMode 
                ? 'bg-amber-600/30 text-amber-300 border border-amber-600/50' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40'
            }`}
          >
            {exchangeMode ? 'Cancel Exchange' : 'Exchange Tiles...'}
          </button>
        </div>
      </div>

      {/* Player Tile Rack Grid */}
      <div id="tile-rack-list" className="flex items-center justify-center gap-2 py-2 overflow-x-auto min-h-[50px]">
        {rack.length === 0 ? (
          <span className="text-sm text-slate-500 italic">No tiles left on rack</span>
        ) : (
          rack.map((tile) => {
            const isSelected = selectedTileId === tile.id;
            const isMarkedExchange = rackExchangeSelection.includes(tile.id);
            
            return (
              <button
                key={tile.id}
                id={`rack-tile-${tile.id}`}
                onClick={() => {
                  if (exchangeMode) {
                    onToggleExchangeTile(tile.id);
                  } else {
                    onSelectTile(tile.id);
                  }
                }}
                className={`
                  relative w-12 h-12 flex flex-col items-center justify-center rounded-lg font-bold text-slate-800 cursor-pointer select-none transition-all duration-150 transform hover:-translate-y-1 active:scale-95
                  ${isMarkedExchange 
                    ? 'bg-rose-900 border-2 border-rose-500 text-slate-300 scale-95 brightness-75' 
                    : isSelected 
                      ? 'bg-amber-100 ring-4 ring-amber-400 scale-105 border-transparent shadow-lg text-amber-900' 
                      : 'bg-[#f7e3c1] hover:bg-[#faebca] border-2 border-[#dac197] shadow shadow-black/40'
                  }
                `}
              >
                <span className="text-lg font-extrabold leading-none">
                  {tile.letter === '_' ? ' ' : tile.letter}
                </span>
                <span className="absolute bottom-1 right-1 text-[8px] font-medium text-slate-500 leading-none">
                  {tile.score}
                </span>
                {isMarkedExchange && (
                  <span className="absolute top-1 left-1 text-[8px] text-rose-400 font-bold flex gap-0.5 items-center leading-none">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Swap
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Main Core Commands Toolbar */}
      <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 mt-2">
        {exchangeMode ? (
          <button
            id="confirm-exchange-action-btn"
            onClick={onExchangeSelected}
            disabled={!isMyTurn || rackExchangeSelection.length === 0}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white py-2.5 px-4 rounded-xl font-bold transition-all shadow shadow-rose-950"
          >
            <RefreshCw className="w-4 h-4" /> Swap ({rackExchangeSelection.length})
          </button>
        ) : (
          <button
            id="commit-turn-action-btn"
            onClick={onCommitMove}
            disabled={!isMyTurn || !validation.isValid}
            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white py-2.5 px-4 rounded-xl font-bold transition-all shadow shadow-emerald-950"
          >
            <Play className="w-4 h-4" /> Play ({validation.score})
          </button>
        )}

        <button
          id="recall-turn-action-btn"
          onClick={onRecallAll}
          disabled={tempPlacements.length === 0}
          className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 py-2.5 px-3 rounded-xl font-semibold transition"
        >
          <RotateCcw className="w-4 h-4" /> Recall
        </button>

        <button
          id="pass-turn-action-btn"
          onClick={onPassTurn}
          disabled={!isMyTurn || tempPlacements.length > 0}
          className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 py-2.5 px-3 rounded-xl font-semibold transition"
        >
          <SkipForward className="w-4 h-4" /> Skip
        </button>

        <button
          id="resign-game-action-btn"
          onClick={onResign}
          className="flex items-center justify-center gap-1.5 bg-red-950/40 hover:bg-red-900 border border-red-900/30 text-rose-300 py-2.5 px-3 rounded-xl font-semibold transition"
        >
          <Ban className="w-4 h-4" /> Resign
        </button>
      </div>
    </div>
  );
};
