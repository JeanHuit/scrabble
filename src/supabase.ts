import { createClient } from '@supabase/supabase-js';

const supabaseUrl = ((import.meta as any).env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = ((import.meta as any).env.VITE_SUPABASE_ANON_KEY || '').trim();

export const hasSupabase = !!(
  supabaseUrl && 
  supabaseAnonKey && 
  (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) &&
  !supabaseUrl.includes('your-supabase-project')
);

// Gracefully export client or null if not yet defined
export const supabase = hasSupabase ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (hasSupabase) {
  console.log('Classics Scrabble connected successfully to Supabase instance:', supabaseUrl);
} else {
  console.log('No valid Supabase variables found; running locally only.');
}

/**
 * Returns a persistent user identifier to represent the player across sessions.
 * Guarantees zero-friction matchmaking without requiring Supabase Auth providers
 * to be actively enabled in the console dashboard.
 */
export const getOrCreateUserUid = (): string => {
  const localKey = 'scrabble_user_uid';
  let uid = localStorage.getItem(localKey);
  if (!uid) {
    uid = 'user_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem(localKey, uid);
  }
  return uid;
};

/**
 * Inserts a new game session into the 'games' table.
 */
export const createGameRoom = async (newGame: any) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('games')
    .insert({
      id: newGame.id,
      state: newGame,
      status: newGame.status,
      updated_at: newGame.updatedAt
    });
  if (error) {
    console.error('Supabase createGameRoom error:', error);
    throw error;
  }
};

/**
 * Updates an existing game session in the 'games' table.
 */
export const updateGameRoom = async (gameId: string, gameState: any) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('games')
    .update({
      state: gameState,
      status: gameState.status,
      updated_at: gameState.updatedAt
    })
    .eq('id', gameId);
  if (error) {
    console.error('Supabase updateGameRoom error:', error);
    throw error;
  }
};

/**
 * Fetches standard room state once.
 */
export const fetchGameRoom = async (gameId: string) => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('games')
    .select('state')
    .eq('id', gameId)
    .maybeSingle();
  if (error) {
    console.error('Supabase fetchGameRoom error:', error);
    throw error;
  }
  return data?.state || null;
};

/**
 * Subscribes live to all matches expecting players ('waiting' status).
 */
export const subscribeToLobby = (callback: (rooms: any[]) => void) => {
  if (!supabase) return () => {};

  const queryLobby = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('state')
      .eq('status', 'waiting')
      .order('updated_at', { ascending: false });
    if (!error && data) {
      callback(data.map(item => item.state));
    }
  };

  // Run immediately
  queryLobby();

  // Create real-time listener subscription
  const channel = supabase
    .channel('lobby-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games' },
      () => {
        queryLobby();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

/**
 * Subscribes live to updates of a single specific game session.
 */
export const subscribeToGame = (gameId: string, callback: (game: any) => void) => {
  if (!supabase) return () => {};

  const queryGame = async () => {
    const { data, error } = await supabase
      .from('games')
      .select('state')
      .eq('id', gameId)
      .maybeSingle();
    if (!error && data && data.state) {
      callback(data.state);
    }
  };

  // Run immediately
  queryGame();

  const channel = supabase
    .channel(`game-room-${gameId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'games'
      },
      (payload) => {
        const newId = (payload.new as any)?.id;
        const oldId = (payload.old as any)?.id;
        if (newId === gameId || oldId === gameId) {
          queryGame();
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
