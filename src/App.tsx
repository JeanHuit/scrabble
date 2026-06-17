import React, { useState, useEffect, useRef } from 'react';
import { 
  hasSupabase, 
  getOrCreateUserUid, 
  createGameRoom, 
  updateGameRoom, 
  fetchGameRoom, 
  subscribeToLobby, 
  subscribeToGame 
} from './supabase';

import { Tile, BoardCell, GameState, Player, ChatMessage } from './types';
import { GameBoard } from './components/GameBoard';
import { ActiveGameControls } from './components/ActiveGameControls';
import { MatchLobby } from './components/MatchLobby';
import { DictionaryManager } from './components/DictionaryManager';
import { 
  generateSharedBag, 
  LETTER_VALUES, 
  validateAndScoreMove 
} from './scrabbleEngine';

import { 
  ArrowLeft, 
  MessageCircle, 
  Award, 
  Layers, 
  Bot, 
  Users, 
  ChevronRight, 
  ChevronDown, 
  Send,
  Globe
} from 'lucide-react';

const LOCAL_NICKNAME_KEY = 'scrabble_user_nickname';

export default function App() {
  const [userUid, setUserUid] = useState<string>('');
  const [nickname, setNickname] = useState<string>(() => {
    return localStorage.getItem(LOCAL_NICKNAME_KEY) || 'Player 1';
  });

  // Main active game state (null = showing Lobby matching)
  const [activeGame, setActiveGame] = useState<GameState | null>(null);
  
  // Placements made during the current player's tentative turn
  const [tempPlacements, setTempPlacements] = useState<BoardCell[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [rackExchangeSelection, setRackExchangeSelection] = useState<string[]>([]);
  
  // Realtime waiting rooms from Firestore
  const [waitingGames, setWaitingGames] = useState<GameState[]>([]);
  
  // Chat messaging
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  
  // Pass & Play secure pass-over screen state
  const [showPassScreen, setShowPassScreen] = useState(false);

  // Loading indicator for online/AI solver operations
  const [solvingAI, setSolvingAI] = useState(false);
  const [loadingLobby, setLoadingLobby] = useState(false);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);

  // Scroll target for chat box bottom
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 1. Persist user nickname alterations
  useEffect(() => {
    localStorage.setItem(LOCAL_NICKNAME_KEY, nickname);
  }, [nickname]);

  // 2. Load persistent client player uuid on load and restore active session
  useEffect(() => {
    const uid = getOrCreateUserUid();
    setUserUid(uid);

    const savedGameId = localStorage.getItem('scrabble_active_game_id');
    const savedType = localStorage.getItem('scrabble_active_game_type');
    if (savedGameId) {
      if (savedType === 'pvp') {
        if (hasSupabase) {
          fetchGameRoom(savedGameId).then((dbGame) => {
            if (dbGame) {
              setActiveGame(dbGame as GameState);
            } else {
              localStorage.removeItem('scrabble_active_game_id');
              localStorage.removeItem('scrabble_active_game_type');
            }
            setIsInitialLoadDone(true);
          }).catch((err) => {
            console.error("Error auto-restoring PvP game session:", err);
            setIsInitialLoadDone(true);
          });
        } else {
          setIsInitialLoadDone(true);
        }
      } else {
        const localSaved = localStorage.getItem(`scrabble_saved_game_${savedGameId}`);
        if (localSaved) {
          try {
            setActiveGame(JSON.parse(localSaved));
          } catch (e) {
            console.error('Failed to parse local saved game:', e);
          }
        }
        setIsInitialLoadDone(true);
      }
    } else {
      setIsInitialLoadDone(true);
    }
  }, []);

  // Save or clear active game details to local storage
  useEffect(() => {
    if (!isInitialLoadDone) return;

    if (activeGame) {
      localStorage.setItem('scrabble_active_game_id', activeGame.id);
      localStorage.setItem('scrabble_active_game_type', activeGame.gameType);
      localStorage.setItem(`scrabble_saved_game_${activeGame.id}`, JSON.stringify(activeGame));
    } else {
      localStorage.removeItem('scrabble_active_game_id');
      localStorage.removeItem('scrabble_active_game_type');
    }
  }, [activeGame, isInitialLoadDone]);

  // Sync chat messages from the live PvP game state
  useEffect(() => {
    if (activeGame && activeGame.gameType === 'pvp' && activeGame.chat) {
      setChatMessages(activeGame.chat);
    }
  }, [activeGame?.chat]);

  // 3. Setup real-time listeners for waiting lobbies if Supabase is provisioned
  useEffect(() => {
    if (!hasSupabase || !userUid) return;

    const unsubscribe = subscribeToLobby((rooms) => {
      setWaitingGames(rooms as GameState[]);
    });

    return () => unsubscribe();
  }, [userUid]);

  // 4. Listen live to changes if we are currently connected inside an Online/PvP room
  useEffect(() => {
    if (!hasSupabase || !activeGame || activeGame.gameType !== 'pvp') return;

    // A. Realtime subscription (instant)
    const unsubscribe = subscribeToGame(activeGame.id, (gameData) => {
      if (gameData) {
        setActiveGame(current => {
          if (!current || !gameData) return gameData as GameState;
          
          const isPlayerCountDifferent = gameData.players?.length !== current.players?.length;
          const isStatusDifferent = gameData.status !== current.status;
          const isTurnDifferent = gameData.turnIndex !== current.turnIndex;
          const isBoardDifferent = (gameData.board?.length || 0) !== (current.board?.length || 0);

          if (gameData.updatedAt > current.updatedAt || isPlayerCountDifferent || isStatusDifferent || isTurnDifferent || isBoardDifferent) {
            return gameData as GameState;
          }
          return current;
        });
      } else {
        alert("The online game room was closed or dismantled.");
        setActiveGame(null);
      }
    });

    // B. Lightweight polling fallback (every 3 seconds) as an absolute guarantee
    const pollInterval = setInterval(async () => {
      try {
        const gameData = await fetchGameRoom(activeGame.id);
        if (gameData) {
          setActiveGame(current => {
            if (!current || !gameData) return gameData as GameState;
            
            const isPlayerCountDifferent = gameData.players?.length !== current.players?.length;
            const isStatusDifferent = gameData.status !== current.status;
            const isTurnDifferent = gameData.turnIndex !== current.turnIndex;
            const isBoardDifferent = (gameData.board?.length || 0) !== (current.board?.length || 0);

            if (gameData.updatedAt > current.updatedAt || isPlayerCountDifferent || isStatusDifferent || isTurnDifferent || isBoardDifferent) {
              console.log("Polling updated state from DB (backup)...");
              return gameData as GameState;
            }
            return current;
          });
        }
      } catch (err) {
        console.warn("Polling fallback error (silently ignored):", err);
      }
    }, 3000);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
    };
  }, [activeGame?.id]);

  // Scroll to bottom of chat list on text expansions
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatOpen]);

  // Helper: Drawing letters securely out of a bag
  const drawLetters = (currentBag: string[], count: number) => {
    const bagCopy = [...currentBag];
    const tiles: Tile[] = [];
    const drawLimit = Math.min(count, bagCopy.length);

    for (let i = 0; i < drawLimit; i++) {
      // Pull tile from the end of shuffled pool
      const letter = bagCopy.pop() || '';
      tiles.push({
        id: `tile-${Math.random().toString(36).substring(2, 9)}`,
        letter,
        score: LETTER_VALUES[letter] ?? 0
      });
    }

    return { drawnTiles: tiles, revisedBag: bagCopy };
  };

  // 5. SOLO PRACTICE MODE: Create offline game vs Scrabble AI
  const handleStartSoloAI = () => {
    const freshBag = generateSharedBag();
    
    // Distribute user tiles + AI tiles
    const userDraw = drawLetters(freshBag, 7);
    const aiDraw = drawLetters(userDraw.revisedBag, 7);

    const initialGame: GameState = {
      id: `SOLO-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      status: 'active',
      gameType: 'ai',
      players: [
        { uid: 'human', name: nickname, score: 0, rack: userDraw.drawnTiles, isConnected: true },
        { uid: 'gemini', name: 'Scrabble AI', score: 0, rack: aiDraw.drawnTiles, isConnected: true }
      ],
      board: [],
      bag: aiDraw.revisedBag,
      turnIndex: 0, // Human goes first
      lastMove: null,
      winnerId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setTempPlacements([]);
    setSelectedTileId(null);
    setChatMessages([
      {
        id: 'welcome',
        playerUid: 'system',
        playerName: 'System',
        text: `Welcome to solo practice mode! Challenge Scrabble AI. You go first, placement star at Center cells is ready.`,
        timestamp: Date.now()
      }
    ]);
    setActiveGame(initialGame);
  };

  // 6. LOCAL PASS & PLAY: Create local multiplayer game
  const handleStartPassPlay = () => {
    const freshBag = generateSharedBag();
    const player1Draw = drawLetters(freshBag, 7);
    const player2Draw = drawLetters(player1Draw.revisedBag, 7);

    const initialGame: GameState = {
      id: 'LOCAL',
      status: 'active',
      gameType: 'ai', // We treat local custom state identically to offline
      players: [
        { uid: 'guest1', name: nickname || 'Player 1', score: 0, rack: player1Draw.drawnTiles, isConnected: true },
        { uid: 'guest2', name: 'Opponent (Pass & Play)', score: 0, rack: player2Draw.drawnTiles, isConnected: true }
      ],
      board: [],
      bag: player2Draw.revisedBag,
      turnIndex: 0,
      lastMove: null,
      winnerId: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Override gameType to recognize 'local' pass trigger
    initialGame.gameType = 'ai'; // Treated as client-managed offline game
    initialGame.id = `LOCAL-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    // We'll tag the player uids to trigger local hide screens
    initialGame.players[0].uid = 'local1';
    initialGame.players[1].uid = 'local2';

    setTempPlacements([]);
    setSelectedTileId(null);
    setChatMessages([
      {
        id: 'welcome',
        playerUid: 'system',
        playerName: 'System',
        text: `Local Pass & Play game launched! Let's play. Turn belongs to ${initialGame.players[0].name}.`,
        timestamp: Date.now()
      }
    ]);
    setActiveGame(initialGame);
  };

  // 7. ONLINE MODE: Create custom waiting room in Supabase
  const handleCreateOnlineGame = async () => {
    if (!hasSupabase || !userUid) return;

    setLoadingLobby(true);
    const customRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const freshBag = generateSharedBag();
    const hostDraw = drawLetters(freshBag, 7);

    const initialLobbyMsg: ChatMessage = {
      id: 'welcome',
      playerUid: 'system',
      playerName: 'System',
      text: `Online lobby created! Room code is "${customRoomCode}". Share the code or invite an opponent to join.`,
      timestamp: Date.now()
    };

    const newGame: GameState = {
      id: customRoomCode,
      status: 'waiting',
      gameType: 'pvp',
      players: [
        { uid: userUid, name: nickname, score: 0, rack: hostDraw.drawnTiles, isConnected: true }
      ],
      board: [],
      bag: hostDraw.revisedBag,
      turnIndex: 0,
      lastMove: null,
      winnerId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chat: [initialLobbyMsg]
    };

    try {
      await createGameRoom(newGame);
      setTempPlacements([]);
      setSelectedTileId(null);
      setChatMessages([initialLobbyMsg]);
      setActiveGame(newGame);
    } catch (err) {
      console.error('Failed to create online room:', err);
      alert('Error creating game room. Please try again.');
    } finally {
      setLoadingLobby(false);
    }
  };

  // 8. ONLINE MODE: Join waiting room in Supabase
  const handleJoinOnlineGame = async (gameId: string) => {
    if (!hasSupabase || !userUid) return;

    setLoadingLobby(true);
    const targetRoomId = gameId.trim().toUpperCase();

    try {
      const roomData = await fetchGameRoom(targetRoomId);
      if (!roomData) {
        alert("This room code does not exist. Check code and try again.");
        return;
      }

      if (roomData.status !== 'waiting') {
        alert("This lobby is already active, full, or closed.");
        return;
      }

      // Check if user is already player 1 (for reconnect scenarios)
      if (roomData.players[0].uid === userUid) {
        setTempPlacements([]);
        setActiveGame(roomData as GameState);
        return;
      }

      // Draw Player 2 tiles
      const player2Draw = drawLetters(roomData.bag, 7);
      
      const opponentPlayer: Player = {
        uid: userUid,
        name: nickname,
        score: 0,
        rack: player2Draw.drawnTiles,
        isConnected: true
      };

      const joinMsg: ChatMessage = {
        id: `chat-${Math.random().toString()}`,
        playerUid: 'system',
        playerName: 'System',
        text: `${nickname} joined the game! Matchmaker activated. Let's play Scrabble!`,
        timestamp: Date.now()
      };

      const updatedPlayers = [roomData.players[0], opponentPlayer];
      const updatedGame: GameState = {
        ...roomData,
        players: updatedPlayers,
        status: 'active',
        bag: player2Draw.revisedBag,
        turnIndex: Math.floor(Math.random() * 2), // Pick random starting turn index
        updatedAt: Date.now(),
        chat: [...(roomData.chat || []), joinMsg]
      };

      await updateGameRoom(targetRoomId, updatedGame);
      
      setTempPlacements([]);
      setSelectedTileId(null);
      setChatMessages([...(roomData.chat || []), joinMsg]);
      
      // Load active game context
      setActiveGame(updatedGame);

    } catch (err) {
      console.error('Failed to join online room:', err);
      alert('Error joining game room. Please try again.');
    } finally {
      setLoadingLobby(false);
    }
  };

  // Click handler on board cells
  const handleCellClick = (row: number, col: number) => {
    if (!activeGame || !selectedTileId) return;

    const currentPlayer = activeGame.players[activeGame.turnIndex];
    if (!currentPlayer) return;

    // Is it our turn?
    const isOurTurn = isPlayerMyTurn();
    if (!isOurTurn) return;

    // Retrieve active tile object
    const selectedTileIndex = currentPlayer.rack.findIndex(t => t.id === selectedTileId);
    if (selectedTileIndex === -1) return;

    const tile = currentPlayer.rack[selectedTileIndex];

    // Build the provisional cell placement
    const newCell: BoardCell = {
      row,
      col,
      letter: tile.letter,
      score: tile.score,
      playerId: currentPlayer.uid,
      isFixed: false
    };

    // Remove tile from temporary rack list, add to placements list
    const updatedRack = currentPlayer.rack.filter(t => t.id !== selectedTileId);
    
    // Update local variables until they commit
    setTempPlacements([...tempPlacements, newCell]);
    
    // Assign updated temporary rack inside our current state view
    const playersCopy = activeGame.players.map((p, idx) => {
      if (idx === activeGame.turnIndex) {
        return { ...p, rack: updatedRack };
      }
      return p;
    });

    setActiveGame({
      ...activeGame,
      players: playersCopy
    });

    setSelectedTileId(null); // Reset selection
  };

  // Recall a specific draft tile by tapping it on the board
  const handleRecallTile = (row: number, col: number) => {
    if (!activeGame) return;

    const targetIndex = tempPlacements.findIndex(c => c.row === row && c.col === col);
    if (targetIndex === -1) return;

    const targetCell = tempPlacements[targetIndex];

    // Return tile to player's rack
    const returnedTile: Tile = {
      id: `tile-${Math.random().toString(36).substring(2, 9)}`,
      letter: targetCell.letter || '',
      score: targetCell.score || 0
    };

    const playersCopy = activeGame.players.map((p, idx) => {
      if (idx === activeGame.turnIndex) {
        return { ...p, rack: [...p.rack, returnedTile] };
      }
      return p;
    });

    setTempPlacements(tempPlacements.filter((_, idx) => idx !== targetIndex));
    setActiveGame({
      ...activeGame,
      players: playersCopy
    });
  };

  // Recall all current uncommitted draft placements back to player rack
  const handleRecallAll = () => {
    if (!activeGame || tempPlacements.length === 0) return;

    const returnedTiles: Tile[] = tempPlacements.map(cell => ({
      id: `tile-${Math.random().toString(36).substring(2, 9)}`,
      letter: cell.letter || '',
      score: cell.score || 0
    }));

    const playersCopy = activeGame.players.map((p, idx) => {
      if (idx === activeGame.turnIndex) {
        return { ...p, rack: [...p.rack, ...returnedTiles] };
      }
      return p;
    });

    setTempPlacements([]);
    setSelectedTileId(null);
    setActiveGame({
      ...activeGame,
      players: playersCopy
    });
  };

  // Mark tiles for exchange
  const handleToggleExchangeTile = (tileId: string) => {
    if (rackExchangeSelection.includes(tileId)) {
      setRackExchangeSelection(rackExchangeSelection.filter(id => id !== tileId));
    } else {
      setRackExchangeSelection([...rackExchangeSelection, tileId]);
    }
  };

  // Execute Exchange operation
  const handleExchangeSelected = async () => {
    if (!activeGame) return;
    const isOurTurn = isPlayerMyTurn();
    if (!isOurTurn) return;

    const activePlayer = activeGame.players[activeGame.turnIndex];
    if (!activePlayer) return;

    // Exchange steps:
    // 1. Put selected letters back in bag.
    // 2. Draw fresh batch of equivalent count from bag.
    // 3. Shake/shuffle bag.
    let updatedBag = [...activeGame.bag, ...activePlayer.rack.filter(t => rackExchangeSelection.includes(t.id)).map(t => t.letter)];
    
    // Shuffling bag with new entries
    for (let i = updatedBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [updatedBag[i], updatedBag[j]] = [updatedBag[j], updatedBag[i]];
    }

    const drawOutcome = drawLetters(updatedBag, rackExchangeSelection.length);
    
    // Retain rack tiles not exchanged, then append fresh drawings
    const remainingRack = activePlayer.rack.filter(t => !rackExchangeSelection.includes(t.id));
    const finalRack = [...remainingRack, ...drawOutcome.drawnTiles];

    const updatedPlayers = activeGame.players.map((p, idx) => {
      if (idx === activeGame.turnIndex) {
        return { ...p, rack: finalRack };
      }
      return p;
    });

    const nextTurn = (activeGame.turnIndex + 1) % 2;

    const msg: ChatMessage = {
      id: `chat-${Math.random().toString()}`,
      playerUid: 'system',
      playerName: 'System',
      text: `🔄 ${activePlayer.name} exchanged ${rackExchangeSelection.length} tiles. Turn passes!`,
      timestamp: Date.now()
    };

    const revisedState: GameState = {
      ...activeGame,
      bag: drawOutcome.revisedBag,
      players: updatedPlayers,
      turnIndex: nextTurn,
      lastMove: {
        playerUid: activePlayer.uid,
        playerName: activePlayer.name,
        type: 'exchange',
        score: 0,
        timestamp: Date.now()
      },
      updatedAt: Date.now(),
      chat: [...(activeGame.chat || []), msg]
    };

    setRackExchangeSelection([]);
    setChatMessages(prev => [...prev, msg]);
    await saveGameState(revisedState);
  };

  // Skip / Pass current turn
  const handlePassTurn = async () => {
    if (!activeGame) return;
    const isOurTurn = isPlayerMyTurn();
    if (!isOurTurn) return;

    const activePlayer = activeGame.players[activeGame.turnIndex];
    const nextTurn = (activeGame.turnIndex + 1) % 2;

    const msg: ChatMessage = {
      id: `chat-${Math.random().toString()}`,
      playerUid: 'system',
      playerName: 'System',
      text: `⏭️ ${activePlayer.name} passed their turn.`,
      timestamp: Date.now()
    };

    const revisedState: GameState = {
      ...activeGame,
      turnIndex: nextTurn,
      lastMove: {
        playerUid: activePlayer.uid,
        playerName: activePlayer.name,
        type: 'pass',
        score: 0,
        timestamp: Date.now()
      },
      updatedAt: Date.now(),
      chat: [...(activeGame.chat || []), msg]
    };

    setChatMessages(prev => [...prev, msg]);
    await saveGameState(revisedState);
  };

  // Resign / Forfeit game
  const handleResignGame = async () => {
    if (!activeGame) return;
    
    if (!confirm("Are you absolutely sure you want to resign this game? The opponent wins immediately.")) {
      return;
    }

    const nextTurn = (activeGame.turnIndex + 1) % 2;
    const winnerPlayer = activeGame.players[nextTurn];

    const msg: ChatMessage = {
      id: `chat-${Math.random().toString()}`,
      playerUid: 'system',
      playerName: 'System',
      text: `💀 ${activeGame.players[activeGame.turnIndex].name} resigned. ${winnerPlayer?.name || 'Opponent'} wins the match!`,
      timestamp: Date.now()
    };

    const revisedState: GameState = {
      ...activeGame,
      status: 'finished',
      winnerId: winnerPlayer ? winnerPlayer.uid : 'draw',
      lastMove: {
        playerUid: activeGame.players[activeGame.turnIndex].uid,
        playerName: activeGame.players[activeGame.turnIndex].name,
        type: 'resign',
        timestamp: Date.now()
      },
      updatedAt: Date.now(),
      chat: [...(activeGame.chat || []), msg]
    };

    setChatMessages(prev => [...prev, msg]);
    await saveGameState(revisedState);
  };

  // Helper verifying if the logged-in user owns the active turn
  const isPlayerMyTurn = (): boolean => {
    if (!activeGame) return false;
    const player = activeGame.players[activeGame.turnIndex];
    if (!player) return false;

    if (activeGame.gameType === 'ai') {
      // Offline mode:
      if (player.uid === 'local1' || player.uid === 'local2') return true; // Local play allows both
      return player.uid === 'human'; // Single player allows only human
    } else {
      // Realtime PvP:
      return player.uid === userUid;
    }
  };

  // 9. CORE RERevised: Validate and Commit Play Word!
  const handleCommitMove = async () => {
    if (!activeGame || tempPlacements.length === 0) return;

    // Form combined list of tiles
    const fullyPlacedCells = [
      ...activeGame.board,
      ...tempPlacements.map(p => ({ ...p, isFixed: true }))
    ];

    const validation = validateAndScoreMove(fullyPlacedCells, tempPlacements);
    if (!validation.isValid) {
      alert(validation.errorMessage || "Placement is invalid. Recall and try again.");
      return;
    }

    // Validate each formed word against the Scrabble dictionary endpoint
    for (const word of validation.words) {
      try {
        const checkRes = await fetch(`/api/validate-word?word=${encodeURIComponent(word)}`);
        const result = await checkRes.json();
        if (!result.isValid) {
          alert(`🚫 The word "${word}" does not belong in the Scrabble dictionary! Please recall tiles and play a valid word.`);
          return;
        }
      } catch (err) {
        console.warn(`Could not verify word "${word}" with dictionary server:`, err);
      }
    }

    const activePlayer = activeGame.players[activeGame.turnIndex];
    if (!activePlayer) return;

    // Commit changes:
    // 1. Append points to scores
    // 2. Refill the rack
    const drawCount = 7 - activePlayer.rack.length;
    const drawOutcome = drawLetters(activeGame.bag, drawCount);
    const finalRack = [...activePlayer.rack, ...drawOutcome.drawnTiles];

    const updatedPlayers = activeGame.players.map((p, idx) => {
      if (idx === activeGame.turnIndex) {
        return {
          ...p,
          score: p.score + validation.score,
          rack: finalRack
        };
      }
      return p;
    });

    const nextTurnIndex = (activeGame.turnIndex + 1) % 2;

    // Output visual chat alert log
    const matchLogMsg: ChatMessage = {
      id: `log-${Math.random().toString()}`,
      playerUid: 'system',
      playerName: 'System',
      text: `✏️ ${activePlayer.name} played "${validation.words.join(', ')}" for ${validation.score} points!`,
      timestamp: Date.now()
    };

    const revisedState: GameState = {
      ...activeGame,
      board: fullyPlacedCells,
      bag: drawOutcome.revisedBag,
      players: updatedPlayers,
      turnIndex: nextTurnIndex,
      lastMove: {
        playerUid: activePlayer.uid,
        playerName: activePlayer.name,
        type: 'play',
        word: validation.words.join(', '),
        score: validation.score,
        timestamp: Date.now()
      },
      updatedAt: Date.now(),
      chat: [...(activeGame.chat || []), matchLogMsg]
    };

    setChatMessages(prev => [...prev, matchLogMsg]);

    // Clear board drafts
    setTempPlacements([]);
    setSelectedTileId(null);

    // Save Game State (Online Firestore or Local client)
    await saveGameState(revisedState);
  };

  // 10. AI MATCH PLAYER CO-ORDINATOR: Executes turn automatically
  const triggerAITurn = async (gameConfig: GameState) => {
    const aiPlayer = gameConfig.players[1]; // Gemini always resides in slot 1
    if (!aiPlayer || solvingAI) return;

    setSolvingAI(true);
    
    // Output calculation start banner
    setChatMessages(prev => [...prev, {
      id: `ai-think-${Date.now()}`,
      playerUid: 'system',
      playerName: 'System',
      text: `🧠 ${aiPlayer.name} is evaluating board configurations and rack tiles...`,
      timestamp: Date.now()
    }]);

    try {
      const response = await fetch('/api/ai-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardSlots: gameConfig.board,
          rackTiles: aiPlayer.rack
        })
      });

      if (!response.ok) {
        throw new Error('Server AI Move route rejected.');
      }

      const decision = await response.json();
      
      const { placements, word, explanation } = decision;

      // Handle Pass if AI has no valid placements
      if (!placements || placements.length === 0) {
        const nextState: GameState = {
          ...gameConfig,
          turnIndex: 0, // Back to human
          lastMove: {
            playerUid: aiPlayer.uid,
            playerName: aiPlayer.name,
            type: 'pass',
            score: 0,
            timestamp: Date.now()
          },
          updatedAt: Date.now()
        };

        setChatMessages(prev => [
          ...prev.filter(m => !m.text.includes('evaluating board')),
          {
            id: `ai-pass-${Date.now()}`,
            playerUid: 'system',
            playerName: 'System',
            text: `⏭️ ${aiPlayer.name} passed their turn (no valid high-scoring words found). Your turn!`,
            timestamp: Date.now()
          }
        ]);

        setActiveGame(nextState);
        setSolvingAI(false);
        return;
      }

      // Clean, validate, and normalize placements returned by AI
      let parsedPlacements = (placements || []).map((p: any) => {
        const r = Math.round(Number(p.row));
        const c = Math.round(Number(p.col));
        const letter = String(p.letter || '').toUpperCase().trim();
        return { row: r, col: c, letter };
      }).filter((p: any) => p.letter && !isNaN(p.row) && !isNaN(p.col));

      // 1-indexing auto-detection: If board is empty and AI placed on (8, 8) instead of (7, 7)
      // or if any coordinate is 15 (as standard coordinates are 0-14)
      const isBoardEmpty = gameConfig.board.length === 0;
      const hasFifteen = parsedPlacements.some((p: any) => p.row === 15 || p.col === 15);
      const isOneIndexed = hasFifteen || (isBoardEmpty && parsedPlacements.some((p: any) => p.row === 8 && p.col === 8) && !parsedPlacements.some((p: any) => p.row === 7 && p.col === 7));

      if (isOneIndexed) {
        console.log("Auto-correcting AI placements from 1-indexed to 0-indexed coordinates...");
        parsedPlacements = parsedPlacements.map((p: any) => ({
          ...p,
          row: p.row - 1,
          col: p.col - 1
        }));
      }

      // Safeguard bounds (coordinates must be within standard 0 to 14)
      parsedPlacements = parsedPlacements.filter((p: any) => p.row >= 0 && p.row <= 14 && p.col >= 0 && p.col <= 14);

      // Build updated board placements matching AI's choices
      // Create objects fully marked with the AI Player identity
      const proposedPlacements: BoardCell[] = parsedPlacements.map((p: any) => ({
        row: p.row,
        col: p.col,
        letter: p.letter,
        score: LETTER_VALUES[p.letter] ?? 0,
        playerId: aiPlayer.uid,
        isFixed: true
      }));

      // Calculate score securely using our exact engine calculations
      const candidateBoard = [...gameConfig.board, ...proposedPlacements];
      const scoring = validateAndScoreMove(candidateBoard, proposedPlacements);

      if (!scoring.isValid) {
        console.warn("AI generated move rejected by Scrabble rules:", scoring.errorMessage);
        
        // Output chat alert log
        setChatMessages(prev => [
          ...prev.filter(m => !m.text.includes('evaluating board')),
          {
            id: `ai-reject-${Date.now()}`,
            playerUid: 'system',
            playerName: 'System',
            text: `⚠️ Play "${word}" by AI was rejected by Scrabble rules: ${scoring.errorMessage || 'Invalid layout'}. Turn passed!`,
            timestamp: Date.now()
          }
        ]);

        const nextState: GameState = {
          ...gameConfig,
          turnIndex: 0, // human turn
          lastMove: {
            playerUid: aiPlayer.uid,
            playerName: aiPlayer.name,
            type: 'pass',
            score: 0,
            timestamp: Date.now()
          },
          updatedAt: Date.now()
        };

        setActiveGame(nextState);
        setSolvingAI(false);
        return;
      }

      // Distribute AI letters. Remove used letters from AI Rack, refill from bag!
      const usedLetters = proposedPlacements.map(p => p.letter);
      
      // Match rack by single character removals
      let revisedAiRack = [...aiPlayer.rack];
      usedLetters.forEach(letter => {
        const matchIdx = revisedAiRack.findIndex(t => t.letter === letter || (letter && t.letter === '_'));
        if (matchIdx !== -1) {
          revisedAiRack.splice(matchIdx, 1);
        }
      });

      const drawCount = 7 - revisedAiRack.length;
      const drawOutcome = drawLetters(gameConfig.bag, drawCount);
      const finalAiRack = [...revisedAiRack, ...drawOutcome.drawnTiles];

      const finalizedAiScore = aiPlayer.score + scoring.score;

      const nextState: GameState = {
        ...gameConfig,
        board: candidateBoard,
        bag: drawOutcome.revisedBag,
        players: [
          gameConfig.players[0], // Human index 0 stays same
          {
            ...aiPlayer,
            score: finalizedAiScore,
            rack: finalAiRack
          }
        ],
        turnIndex: 0, // Returns turn to Human
        lastMove: {
          playerUid: aiPlayer.uid,
          playerName: aiPlayer.name,
          type: 'play',
          word: scoring.isValid ? scoring.words.join(', ') : word,
          score: scoring.isValid ? scoring.score : 0,
          timestamp: Date.now()
        },
        updatedAt: Date.now()
      };

      setChatMessages(prev => [
        ...prev.filter(m => !m.text.includes('evaluating board')),
        {
          id: `ai-move-${Date.now()}`,
          playerUid: aiPlayer.uid,
          playerName: aiPlayer.name,
          text: `🤖 Played "${scoring.isValid ? scoring.words.join(', ') : word}" for ${scoring.isValid ? scoring.score : 0} points! 📝 Explanation: ${explanation || 'Formed board connection.'}`,
          timestamp: Date.now()
        }
      ]);

      setActiveGame(nextState);

    } catch (error) {
      console.error("AI turn solving failure:", error);
      // Fallback AI Pass turn to avoid blocking gameplay in failure
      const nextState: GameState = {
        ...gameConfig,
        turnIndex: 0,
        updatedAt: Date.now()
      };
      setChatMessages(prev => [...prev, {
        id: `ai-err-${Date.now()}`,
        playerUid: 'system',
        playerName: 'System',
        text: `⚠️ AI solver ran into a glitch. Passing turn back to Player 1.`,
        timestamp: Date.now()
      }]);
      setActiveGame(nextState);
    } finally {
      setSolvingAI(false);
    }
  };

  // Helper saving changes locally or executing Supabase database updates
  const saveGameState = async (revisedGameConfig: GameState) => {
    if (revisedGameConfig.gameType === 'pvp') {
      // Supabase synced room
      if (!hasSupabase) return;
      try {
        await updateGameRoom(revisedGameConfig.id, revisedGameConfig);
        setActiveGame(revisedGameConfig);
      } catch (err) {
        console.error('Error saving game state:', err);
      }
    } else {
      // Offline Pass / AI solo game
      setActiveGame(revisedGameConfig);

      // Trigger Pass & Play pass screen overlay if Player ID changes to other local player!
      const nextPlayer = revisedGameConfig.players[revisedGameConfig.turnIndex];
      const prevPlayer = activeGame?.players[activeGame?.turnIndex];
      
      const isLocalTransition = (
        (prevPlayer?.uid === 'local1' && nextPlayer?.uid === 'local2') ||
        (prevPlayer?.uid === 'local2' && nextPlayer?.uid === 'local1')
      );

      if (isLocalTransition) {
        setShowPassScreen(true);
      }

      // Automatically trigger Solo AI plays if turn becomes Gemini and game is SOLO mode
      if (revisedGameConfig.gameType === 'ai' && nextPlayer?.uid === 'gemini') {
        setTimeout(() => triggerAITurn(revisedGameConfig), 1200);
      }
    }
  };

  // Custom chat message routing
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeGame) return;

    const myUid = activeGame.gameType === 'pvp' ? userUid : 'human';
    const myName = activeGame.gameType === 'pvp'
      ? activeGame.players.find(p => p.uid === userUid)?.name || nickname
      : activeGame.players[activeGame.turnIndex]?.name || nickname;

    const newMsg: ChatMessage = {
      id: `chat-${Math.random().toString()}`,
      playerUid: myUid,
      playerName: myName,
      text: chatInput.trim(),
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, newMsg]);
    setChatInput('');
  };

  const handleLeaveGame = () => {
    if (confirm("Disconnect and leave game? Your progress will be archived.")) {
      setActiveGame(null);
      setChatMessages([]);
      setTempPlacements([]);
      setShowPassScreen(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      
      {/* 1. TOP HEADER NAVIGATION BAR */}
      <header className="bg-slate-900 border-b border-slate-800/80 px-4 py-3 sticky top-0 z-40 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          {activeGame ? (
            <button
              onClick={handleLeaveGame}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-bold uppercase"
            >
              <ArrowLeft className="w-4 h-4" /> Exit Lobby
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center font-black text-slate-950 font-mono text-lg">
                S
              </div>
              <span className="font-extrabold text-slate-100 tracking-wider text-sm uppercase">SCRABBLE</span>
            </div>
          )}
        </div>

        {/* Dynamic status displays */}
        {activeGame ? (
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono font-bold px-2.5 py-1 rounded-lg text-xs tracking-wide">
              {activeGame.id}
            </span>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="relative p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            >
              <MessageCircle className="w-5 h-5" />
              {chatMessages.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 text-slate-950 font-black font-mono text-[9px] rounded-full flex items-center justify-center">
                  {chatMessages.length}
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Globe className={`w-3.5 h-3.5 ${hasSupabase ? "text-emerald-500" : "text-rose-500"}`} />
            <span>{hasSupabase ? "Multiplayer Active" : "Local Mode Play"}</span>
          </div>
        )}
      </header>

      {/* 2. CHAT DRAWER SIDE-DRAWER */}
      {chatOpen && activeGame && (
        <div id="side-chat-drawer" className="fixed right-0 top-[53px] bottom-0 w-80 max-w-full bg-slate-900 border-l border-slate-800 flex flex-col z-[100] shadow-2xl animate-slide-left">
          <div className="p-3 border-b border-slate-800 flex justify-between items-center">
            <span className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-amber-500" /> Match Feed ({chatMessages.length})
            </span>
            <button 
              onClick={() => setChatOpen(false)}
              className="text-slate-500 hover:text-slate-300 text-xs font-semibold"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
            {chatMessages.map((msg) => {
              const isSystem = msg.playerUid === 'system';
              const isGemini = msg.playerUid === 'gemini';
              const isMe = msg.playerUid === 'human' || (hasSupabase && msg.playerUid === userUid);

              return (
                <div
                  key={msg.id}
                  className={`p-2.5 rounded-xl text-xs max-w-[90%] leading-relaxed ${
                    isSystem
                      ? 'bg-slate-950/40 text-slate-400 border border-slate-800/80 mx-auto w-full text-center'
                      : isGemini
                        ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/30 self-start'
                        : isMe
                          ? 'bg-amber-500 text-slate-950 self-end ml-auto font-medium'
                          : 'bg-slate-800 text-slate-200 self-start'
                  }`}
                >
                  {!isSystem && (
                    <span className="block font-extrabold text-[10px] mb-0.5 opacity-80 uppercase tracking-wide">
                      {isMe ? 'You' : msg.playerName}
                    </span>
                  )}
                  <span>{msg.text}</span>
                </div>
              );
            })}
            <div ref={chatBottomRef} />
          </div>

          <form onSubmit={handleSendChat} className="p-2 border-t border-slate-800 bg-slate-950 flex gap-1.5">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Send message..."
              className="flex-1 bg-slate-900 text-xs rounded-lg px-2.5 py-2 text-slate-100 placeholder:text-slate-500 border border-slate-705/50 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 p-2 rounded-lg transition"
            >
              <Send className="w-3.5 h-3.5 font-bold" />
            </button>
          </form>
        </div>
      )}

      {/* 3. CORE LAYOUT VIEWPORTS */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-3 sm:p-5 flex flex-col justify-center gap-4">
        
        {!activeGame ? (
          /* Lobby match interface */
          <div className="w-full py-8">
            {loadingLobby ? (
              <div className="w-full py-12 text-center flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-slate-400 text-sm font-semibold">Matchmaker synchronizing lobbies...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start max-w-4xl mx-auto w-full">
                <MatchLobby
                  nickname={nickname}
                  setNickname={setNickname}
                  waitingGames={waitingGames}
                  isCloudDbAvailable={hasSupabase}
                  onStartSoloAI={handleStartSoloAI}
                  onStartPassPlay={handleStartPassPlay}
                  onCreateOnlineGame={handleCreateOnlineGame}
                  onJoinOnlineGame={handleJoinOnlineGame}
                />
                <DictionaryManager />
              </div>
            )}
          </div>
        ) : (
          /* Active Playing screen */
          <div className="flex flex-col gap-4">
            
            {/* Dynamic Interactive HUD */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-lg flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
              
              {/* Player 1 Details */}
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-black transition-all ${
                  activeGame.turnIndex === 0 
                    ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-400/40 scale-105' 
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {activeGame.players[0]?.uid === 'gemini' ? <Bot className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">
                    {activeGame.players[0]?.name}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono leading-none">{activeGame.players[0]?.score || 0}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Points</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Bag / Last Played Action Banner */}
              <div className="bg-slate-950 border border-slate-850 px-4 py-2 rounded-2xl text-center flex flex-col justify-center items-center flex-1">
                {activeGame.lastMove ? (
                  <div className="text-[10px] text-slate-400 leading-tight">
                    <span className="font-bold text-amber-400 block">Last Action:</span>
                    <span>
                      {activeGame.lastMove.playerName}{' '}
                      {activeGame.lastMove.type === 'play' 
                        ? `played "${activeGame.lastMove.word}" (+${activeGame.lastMove.score})` 
                        : `skipped or swapped letters`
                      }
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Board empty. Place letters first.</span>
                )}
                <div className="mt-1 flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                  <Layers className="w-3 h-3 text-slate-500" /> Letter Bag remaining: {activeGame.bag.length}
                </div>
              </div>

              {/* Player 2 Details */}
              <div className="flex items-center justify-end gap-3 flex-1 text-right">
                <div>
                  <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">
                    {activeGame.players[1]?.name || 'Waiting...'}
                  </span>
                  {activeGame.players[1] ? (
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span className="text-2xl font-black font-mono leading-none">{activeGame.players[1]?.score || 0}</span>
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Points</span>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-500 animate-pulse font-bold">Awaiting Opponent...</span>
                  )}
                </div>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-black transition-all ${
                  activeGame.turnIndex === 1 
                    ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-400/40 scale-105' 
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {activeGame.players[1]?.uid === 'gemini' ? <Bot className="w-6 h-6" /> : <Users className="w-6 h-6" />}
                </div>
              </div>

            </div>

            {/* AI Turn Calculating Indicator */}
            {solvingAI && (
              <div className="bg-emerald-950/80 border border-emerald-500/30 rounded-2xl p-3 text-xs text-emerald-400 text-center animate-pulse flex items-center justify-center gap-2">
                <Bot className="w-5 h-5 animate-spin" />
                <span><strong>Scrabble AI Turn:</strong> Processing optimal plays. Scrabble solving model calculating...</span>
              </div>
            )}

            {/* Standard 15x15 Play Grid */}
            <GameBoard
              board={activeGame.board}
              tempPlacements={tempPlacements}
              selectedTileId={selectedTileId}
              onCellClick={handleCellClick}
              onRecallTile={handleRecallTile}
            />

            {/* Core control interface */}
            {activeGame.players[activeGame.turnIndex] && (
              <ActiveGameControls
                rack={activeGame.players[activeGame.turnIndex].rack}
                tempPlacements={tempPlacements}
                allBoardCells={activeGame.board}
                selectedTileId={selectedTileId}
                isMyTurn={isPlayerMyTurn() && !solvingAI}
                rackExchangeSelection={rackExchangeSelection}
                onSelectTile={(id) => {
                  setSelectedTileId(selectedTileId === id ? null : id);
                }}
                onToggleExchangeTile={handleToggleExchangeTile}
                onCommitMove={handleCommitMove}
                onRecallAll={handleRecallAll}
                onExchangeSelected={handleExchangeSelected}
                onPassTurn={handlePassTurn}
                onResign={handleResignGame}
              />
            )}

          </div>
        )}

      </main>

      {/* 4. PASS & PLAY SCREEN COVER INTERCEPTOR */}
      {showPassScreen && activeGame && (
        <div className="fixed inset-0 bg-slate-950 z-[200] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-3xl bg-amber-500 flex items-center justify-center font-extrabold text-slate-950 mb-6 shadow-xl shadow-amber-950/50">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-amber-100 uppercase tracking-wide">
            Turn Complete!
          </h2>
          <p className="text-slate-400 text-sm max-w-sm mt-2 leading-relaxed">
            Please hand the screen over to <strong className="text-amber-400">{activeGame.players[activeGame.turnIndex]?.name}</strong>. Keep your tile rack private!
          </p>
          <button
            onClick={() => setShowPassScreen(false)}
            className="mt-8 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-8 py-3.5 rounded-2xl shadow-xl transition active:scale-95"
          >
            I AM {activeGame.players[activeGame.turnIndex]?.name.toUpperCase()} - REVEAL TILES
          </button>
        </div>
      )}

      {/* FOOTER */}
      <footer className="py-6 text-center text-[10px] text-slate-600 font-medium uppercase tracking-widest border-t border-slate-900/50 mt-6 select-none bg-slate-950">
        Prismatic Classical Scrabble Board. Tap tiles to place. Good luck!
      </footer>

    </div>
  );
}
