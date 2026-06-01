import React, { useState } from 'react';
import { GameState, Player } from '../types';
import { Bot, User, Users, Compass, Plus, Globe, HelpCircle } from 'lucide-react';

interface MatchLobbyProps {
  nickname: string;
  setNickname: (name: string) => void;
  waitingGames: GameState[];
  isFirebaseAvailable: boolean;
  onStartSoloAI: () => void;
  onStartPassPlay: () => void;
  onCreateOnlineGame: () => void;
  onJoinOnlineGame: (gameId: string) => void;
}

export const MatchLobby: React.FC<MatchLobbyProps> = ({
  nickname,
  setNickname,
  waitingGames,
  isFirebaseAvailable,
  onStartSoloAI,
  onStartPassPlay,
  onCreateOnlineGame,
  onJoinOnlineGame,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'local' | 'online'>('ai');
  const [roomCodeInput, setRoomCodeInput] = useState('');

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCodeInput.trim()) {
      onJoinOnlineGame(roomCodeInput.trim().toUpperCase());
    }
  };

  return (
    <div id="scrabble-lobby-container" className="w-full max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col gap-6">
      
      {/* Title Header */}
      <div className="flex flex-col items-center text-center gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-amber-100 uppercase">
          Scrabble Online
        </h1>
        <p className="text-sm text-slate-400">
          Play classic words against friends nearby, online opponents, or AI
        </p>
      </div>

      {/* Nickname Entry Section */}
      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 flex flex-col gap-2 shadow-inner">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-amber-400" /> Player Nickname:
        </label>
        <input
          id="user-nickname-input"
          type="text"
          maxLength={15}
          value={nickname}
          onChange={(e) => setNickname(e.target.value || 'Player')}
          placeholder="Enter custom nickname..."
          className="w-full bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      </div>

      {/* Mode Chooser Tabs */}
      <div className="grid grid-cols-3 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
        <button
          id="tab-ai-mode-btn"
          onClick={() => setActiveTab('ai')}
          className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'ai' 
              ? 'bg-amber-500 text-slate-950 shadow-md' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bot className="w-5 h-5" />
          <span>Vs Gemini AI</span>
        </button>

        <button
          id="tab-local-mode-btn"
          onClick={() => setActiveTab('local')}
          className={`flex flex-col items-center gap-1 py-3 px-1 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'local' 
              ? 'bg-amber-500 text-slate-950 shadow-md' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Pass & Play</span>
        </button>

        <button
          id="tab-online-mode-btn"
          onClick={() => setActiveTab('online')}
          className={`relative flex flex-col items-center gap-1 py-3 px-1 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'online' 
              ? 'bg-amber-500 text-slate-950 shadow-md' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe className="w-5 h-5" />
          <span>Multiplayer</span>
          {!isFirebaseAvailable && (
            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Tab Panel Context */}
      <div id="tab-content" className="min-h-[180px]">
        
        {/* Gemini AI Tab Panel */}
        {activeTab === 'ai' && (
          <div className="flex flex-col gap-4 animate-fade-in text-center sm:text-left">
            <h3 className="text-lg font-bold text-amber-100 flex items-center justify-center sm:justify-start gap-2">
              <Bot className="w-5 h-5 text-amber-400" /> Play against Solved AI
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Challenge ScrabblePlayAI! Practice your placements, try letter layouts, and receive dynamic word strategies. The AI makes decisions and generates scores based on Gemini.
            </p>
            <button
              id="start-solo-ai-btn"
              onClick={onStartSoloAI}
              className="mt-2 w-full bg-amber-500 hover:bg-amber-400 active:scale-[98%] text-slate-950 font-extrabold py-3.5 px-6 rounded-2xl shadow transition"
            >
              LAUNCH GAME WITH AI OPPROUNT
            </button>
          </div>
        )}

        {/* Pass & Play Tab Panel */}
        {activeTab === 'local' && (
          <div className="flex flex-col gap-4 animate-fade-in text-center sm:text-left">
            <h3 className="text-lg font-bold text-amber-100 flex items-center justify-center sm:justify-start gap-2">
              <Users className="w-5 h-5 text-amber-400" /> Local Pass and Play
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Play with a friend on the same smartphone or tablet screen! The board stays in position, and players pass the device after performing their turn to keep their tiles private.
            </p>
            <button
              id="start-pass-play-btn"
              onClick={onStartPassPlay}
              className="mt-2 w-full bg-amber-500 hover:bg-amber-400 active:scale-[98%] text-slate-950 font-extrabold py-3.5 px-6 rounded-2xl shadow transition"
            >
              START LOCAL PASS & PLAY
            </button>
          </div>
        )}

        {/* Firebase PvP Tab Panel */}
        {activeTab === 'online' && (
          <div className="flex flex-col gap-4 animate-fade-in">
            {!isFirebaseAvailable ? (
              // When firebase is not connected on system
              <div className="bg-slate-950/80 p-4 border border-rose-950 rounded-2xl text-center flex flex-col gap-3">
                <HelpCircle className="w-8 h-8 text-rose-400 mx-auto" />
                <h4 className="text-sm font-bold text-rose-300">Firebase Setup Required for PvP</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Real-time multiplayer utilizes Firebase Firestore. It will activate once approved in the <strong>Settings Secrets panel</strong>.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className="flex-1 bg-slate-800 text-slate-300 text-xs font-semibold py-2 px-4 rounded-xl"
                  >
                    Play Single Player (AI)
                  </button>
                </div>
              </div>
            ) : (
              // When firebase connection is active!
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="create-online-game-btn"
                    onClick={onCreateOnlineGame}
                    className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3.5 px-4 rounded-xl text-xs transition"
                  >
                    <Plus className="w-4 h-4" /> Create Custom Room
                  </button>
                  <form onSubmit={handleJoinByCode} className="flex gap-1.5">
                    <input
                      type="text"
                      maxLength={6}
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value)}
                      placeholder="ROOM CODE"
                      className="w-full bg-slate-950 border border-slate-700/60 rounded-xl px-2.5 text-center text-xs font-bold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      className="bg-amber-600/30 text-amber-300 border border-amber-500/50 hover:bg-amber-600/50 text-xs font-bold px-3 rounded-xl"
                    >
                      Join
                    </button>
                  </form>
                </div>

                {/* Waiting room lobbies database query */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[11px] uppercase text-slate-500 font-extrabold tracking-widest flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5" /> Public Lobbies Available
                  </span>
                  
                  {waitingGames.length === 0 ? (
                    <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl py-6 text-center text-slate-500 text-xs italic">
                      No active lobbies waiting. Click "Create Custom Room" to start one!
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1">
                      {waitingGames.map((game) => (
                        <div
                          key={game.id}
                          className="flex justify-between items-center bg-slate-950/80 border border-slate-800 rounded-xl p-3 hover:border-slate-700 transition"
                        >
                          <div>
                            <span className="text-xs font-bold text-slate-200 block">
                              👤 {game.players[0]?.name || 'Anonymous User'}'s Lobby
                            </span>
                            <span className="text-[9px] text-slate-500 uppercase font-mono tracking-wider">
                              ID: {game.id}
                            </span>
                          </div>
                          <button
                            id={`join-lobby-btn-${game.id}`}
                            onClick={() => onJoinOnlineGame(game.id)}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] px-3.5 py-1.5 rounded-lg transition"
                          >
                            Join & Play
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
