import React, { useState, useEffect } from 'react';
import { BoardCell, Tile } from '../types';
import { validateAndScoreMove } from '../scrabbleEngine';
import { CheckCircle2, XCircle, HelpingHand, List, Sparkles, ChevronRight, Calculator, HelpCircle } from 'lucide-react';

interface MoveValidatorPanelProps {
  tempPlacements: BoardCell[];
  allBoardCells: BoardCell[];
  isMyTurn: boolean;
  gameId?: string;
}

export const MoveValidatorPanel: React.FC<MoveValidatorPanelProps> = ({
  tempPlacements,
  allBoardCells,
  isMyTurn,
  gameId
}) => {
  const [wordValidity, setWordValidity] = useState<Record<string, { isValid: boolean; isLoading: boolean }>>({});
  
  // 1. Core structural logic validation
  const validation = validateAndScoreMove(
    [...allBoardCells.filter(c => c.isFixed), ...tempPlacements],
    tempPlacements
  );

  // 2. Fetch dictionary verification from Express backend whenever words are formed
  useEffect(() => {
    if (tempPlacements.length === 0 || validation.words.length === 0) {
      return;
    }

    const wordsToFetch = validation.words.map(w => w.toUpperCase().trim());

    wordsToFetch.forEach(async (word) => {
      // If already in state, skip to prevent repeated fetches
      if (wordValidity[word] !== undefined) return;

      // Mark as loading
      setWordValidity(prev => ({
        ...prev,
        [word]: { isValid: false, isLoading: true }
      }));

      try {
        const res = await fetch(`/api/validate-word?word=${encodeURIComponent(word)}`);
        const data = await res.json();
        setWordValidity(prev => ({
          ...prev,
          [word]: { isValid: data.isValid, isLoading: false }
        }));
      } catch (err) {
        console.error(`Error validating word "${word}" via backend API:`, err);
        setWordValidity(prev => ({
          ...prev,
          [word]: { isValid: true, isLoading: false } // Fallback to avoid aggressive blocks on network failure
        }));
      }
    });

  }, [tempPlacements, validation.words]);

  if (tempPlacements.length === 0) {
    return (
      <div id="validator-empty-state" className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-3 h-full min-h-[160px]">
        <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 text-slate-500">
          <HelpCircle className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Awaiting Tile Placement</h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-[240px] leading-relaxed">
            Drag tiles from your rack onto the boards to trigger the live Real-time Scrabble Validation System.
          </p>
        </div>
      </div>
    );
  }

  // Check if any formed words are invalid according to backend dictionary verification
  const formedWordsDetails = validation.words.map(w => {
    const wordUpper = w.toUpperCase().trim();
    const cached = wordValidity[wordUpper];
    const isLoading = cached?.isLoading ?? false;
    const isWordValid = cached?.isValid ?? true; // Default to valid until proven otherwise or loaded
    return {
      word: wordUpper,
      isValid: isWordValid,
      isLoading
    };
  });

  const hasInvalidWord = formedWordsDetails.some(w => !w.isLoading && !w.isValid);
  const isCorrectStructure = validation.isValid;

  // Final validation decision
  const finalDecision = isCorrectStructure && !hasInvalidWord ? 'ACCEPT' : 'REJECT';

  // Primary word is generally the longest word formed or the first main axis word
  const primaryWordDetail = formedWordsDetails.length > 0 ? formedWordsDetails[0] : null;
  const crossWordsDetails = formedWordsDetails.length > 1 ? formedWordsDetails.slice(1) : [];

  // Gather specific issues
  const structuralChecklist = [
    {
      label: "Row or Column Alignment",
      status: isCorrectStructure && !validation.errorMessage?.includes("aligned") ? 'pass' : 'fail',
      info: "Tiles must align in a single continuous direction."
    },
    {
      label: "No Gaps Allowed / Continuous Play",
      status: isCorrectStructure && !validation.errorMessage?.includes("continuous") ? 'pass' : 'fail',
      info: "Letters must form a continuous layout without spaces."
    },
    {
      label: "Connected to Board Layout",
      status: isCorrectStructure && !validation.errorMessage?.includes("connect to tiles") ? 'pass' : 'fail',
      info: "Must touch at least one pre-existing letter on the board."
    },
    {
      label: "Center Double Word Covered",
      status: isCorrectStructure && !validation.errorMessage?.includes("center") ? 'pass' : 'fail',
      info: "First move must cover the center star (7,7)."
    }
  ];

  // Scoring breakdown calculation estimation
  const tileCount = tempPlacements.length;
  const isBingo = tileCount === 7;

  return (
    <div id="scrabble-validation-system-panel" className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col gap-4 text-xs">
      
      {/* Header Panel */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
          <h2 className="text-xs font-bold text-slate-100 uppercase tracking-widest">
            Scrabble Validation Engine
          </h2>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow ${
          finalDecision === 'ACCEPT' 
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
        }`}>
          DECISION: {finalDecision}
        </div>
      </div>

      {/* Main Analysis Sections */}
      <div className="flex flex-col gap-4">
        
        {/* 1. Word Validation Details */}
        <div className="bg-slate-950/50 rounded-2xl p-3 border border-slate-800/60 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
            <span>Lexicon Formed Words</span>
            <span>Dictionary Check</span>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            {/* Primary word display */}
            {primaryWordDetail && (
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 font-bold px-1.5 py-0.5 rounded uppercase">
                    Primary
                  </span>
                  <span className="text-sm font-extrabold text-slate-100 font-mono tracking-wide">
                    {primaryWordDetail.word}
                  </span>
                </div>
                {primaryWordDetail.isLoading ? (
                  <span className="text-[10px] text-slate-500 font-mono animate-pulse">Checking...</span>
                ) : primaryWordDetail.isValid ? (
                  <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> VALID
                  </span>
                ) : (
                  <span className="text-[11px] font-black text-rose-400 flex items-center gap-1 animate-bounce">
                    <XCircle className="w-3.5 h-3.5" /> REJECTED
                  </span>
                )}
              </div>
            )}

            {/* Cross-words display */}
            {crossWordsDetails.length > 0 ? (
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Cross-Words Formed</span>
                {crossWordsDetails.map((cw, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-900/40 p-1.5 rounded-lg border border-slate-900">
                    <span className="font-mono text-xs font-semibold text-slate-300">
                      {cw.word}
                    </span>
                    {cw.isLoading ? (
                      <span className="text-[10px] text-slate-500 font-mono animate-pulse">Checking...</span>
                    ) : cw.isValid ? (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> VALID
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> INVALID
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : primaryWordDetail && (
              <span className="text-[10px] text-slate-500 italic mt-0.5">No perpendicular cross words formed.</span>
            )}
          </div>
        </div>

        {/* 2. Structured checklist checking */}
        <div>
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-2">
            CORE RULES ENFORCEMENT
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {structuralChecklist.map((rule, idx) => (
              <div key={idx} className="bg-slate-950/20 border border-slate-800/40 rounded-xl p-2.5 flex items-start gap-2">
                {rule.status === 'pass' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                )}
                <div>
                  <h4 className="font-bold text-slate-200 text-[11px] leading-tight">
                    {rule.label}
                  </h4>
                  <span className="text-[9px] text-slate-500 leading-normal block mt-0.5">
                    {rule.info}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Scoring breakdowns */}
        <div className="bg-slate-950/30 border border-slate-800/50 rounded-2xl p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
            <Calculator className="w-4 h-4 text-slate-400" />
            <span>SCORING & TILE VALIDATION</span>
          </div>
          
          <div className="flex justify-between text-[11px] border-b border-slate-800 pb-1.5 mt-1 text-slate-400">
            <span>Fitted draft score:</span>
            <span className="font-black text-slate-100 font-mono">
              {validation.score} pts
            </span>
          </div>

          {isBingo && (
            <div className="flex justify-between items-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg p-1.5 text-[10px] font-bold">
              <span>🎉 Play All 7 Tiles Bonus (Bingo)</span>
              <span>+50 PTS Active</span>
            </div>
          )}

          <div className="text-[10px] text-slate-500 font-mono leading-relaxed mt-0.5">
            Multiplier squares (DL, TL, DW, TW) parsed automatically on first use of candidates.
          </div>
        </div>

        {/* 4. Violations Summary Box */}
        <div className={`p-3 rounded-2xl border text-xs leading-relaxed ${
          finalDecision === 'ACCEPT' 
            ? 'bg-emerald-900/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
        }`}>
          <div className="font-bold text-[10px] uppercase tracking-wider mb-1">
            Current Analysis Issues
          </div>
          {finalDecision === 'ACCEPT' ? (
            <span>None! Move meets all acceptance criteria. Perfect play.</span>
          ) : (
            <ul className="list-disc pl-4 space-y-1 text-[11px]">
              {!isCorrectStructure && validation.errorMessage && (
                <li>{validation.errorMessage}</li>
              )}
              {hasInvalidWord && (
                <li>One or more words formed fail standard dictionary verification.</li>
              )}
              {tempPlacements.length > 7 && (
                <li>Move has more tiles than a player rack contains (Max 7 tiles).</li>
              )}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
};
