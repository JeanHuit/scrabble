export interface Tile {
  id: string;
  letter: string;
  score: number;
}

export interface BoardCell {
  row: number;
  col: number;
  letter?: string;
  score?: number;
  playerId?: string;
  isFixed?: boolean; // Whether it was placed and locked in a previous turn
}

export type CellMultiplier = 'normal' | 'DL' | 'TL' | 'DW' | 'TW';

export interface Player {
  uid: string;
  name: string;
  score: number;
  rack: Tile[];
  isConnected: boolean;
}

export type GameStatus = 'waiting' | 'active' | 'finished' | 'abandoned';

export interface LastMove {
  playerUid: string;
  playerName: string;
  type: 'play' | 'pass' | 'exchange' | 'resign';
  word?: string;
  score?: number;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  playerUid: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  id: string;
  status: GameStatus;
  players: Player[];
  board: BoardCell[]; // Flat list of placed letters to keep database updates efficient
  bag: string[]; // List of remaining characters in the bag
  turnIndex: number;
  lastMove: LastMove | null;
  winnerId: string | null;
  gameType: 'ai' | 'pvp';
  createdAt: number;
  updatedAt: number;
}
