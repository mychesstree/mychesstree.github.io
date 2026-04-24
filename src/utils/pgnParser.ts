import { Chess } from 'chess.js';
import type { TreeNode } from '../types/tree';


export interface PgnGame {
  headers: Record<string, string>;
  moves: PgnMove[];
  result?: string;
}

export interface PgnMove {
  san: string;
  fen: string;
  comment?: string;
  annotations?: string[];
  variations?: PgnMove[][];
  shapes?: Array<{
    from: string;
    to: string;
    color: string;
    brush: string;
  }>;
}

export interface LichessStudyChapter {
  id: string;
  name: string;
  fen?: string;
  orientation: 'white' | 'black';
  analysis?: Record<string, unknown>;
  practice?: Record<string, unknown>;
  game?: Record<string, unknown>;
  pgn?: string;
}

export interface LichessStudy {
  id: string;
  name: string;
  chapters: LichessStudyChapter[];
  createdAt: number;
  updatedAt: number;
  likes: number;
  private: boolean;
}

/**
 * Enhanced PGN parser that preserves variations, comments, and annotations
 */
export function parsePgn(pgn: string): PgnGame[] {
  const games: PgnGame[] = [];
  
  // Split into individual games
  const gameSections = pgn.split(/\n\s*\n/).filter(section => section.trim());
  
  for (const section of gameSections) {
    const game = parseSingleGame(section);
    if (game) {
      games.push(game);
    }
  }
  
  return games;
}

function parseSingleGame(pgn: string): PgnGame | null {
  const lines = pgn.split('\n');
  const headers: Record<string, string> = {};
  let moveText = '';
  
  // Parse headers
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const match = trimmed.match(/^\[(\w+)\s+"([^"]*)"\]$/);
      if (match) {
        headers[match[1]] = match[2];
      }
    } else if (trimmed) {
      moveText += trimmed + ' ';
    }
  }
  
  if (!moveText.trim()) return null;
  
  // Parse moves with variations and comments
  const moves = parseMoveText(moveText, headers.FEN);
  
  return {
    headers,
    moves,
    result: headers.Result
  };
}

function parseMoveText(moveText: string, fen?: string): PgnMove[] {
  const game = fen ? new Chess(fen) : new Chess();
  const moves: PgnMove[] = [];
  
  // Tokenize the move text, preserving parentheses for variations
  const tokens = tokenizeMoveText(moveText);
  
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    
    if (token === '(') {
      // Start of variation - parse it and attach to previous move
      if (moves.length > 0) {
        const { variation, consumed } = parseVariation(tokens.slice(i + 1), game.fen());
        if (variation.length > 0) {
          const lastMove = moves[moves.length - 1];
          if (!lastMove.variations) lastMove.variations = [];
          lastMove.variations.push(variation);
        }
        i += consumed + 1; // +1 for the opening parenthesis
      } else {
        i++;
      }
    } else if (token === ')') {
      // End of variation - should not happen here
      i++;
    } else if (isMoveToken(token)) {
      // Regular move
      const result = game.move(token);
      if (result) {
        const move: PgnMove = {
          san: result.san,
          fen: game.fen()
        };
        
        // Check for inline comment after the move
        if (i + 1 < tokens.length && tokens[i + 1].startsWith('{') && tokens[i + 1].endsWith('}')) {
          move.comment = tokens[i + 1].slice(1, -1).trim();
          i++;
        }
        
        // Check for annotations (NAGs)
        if (i + 1 < tokens.length && tokens[i + 1].match(/^[?!+]+$/)) {
          move.annotations = [tokens[i + 1]];
          i++;
        }
        
        moves.push(move);
      }
      i++;
    } else {
      // Skip move numbers, results, etc.
      i++;
    }
  }
  
  return moves;
}

function tokenizeMoveText(moveText: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  
  while (i < moveText.length) {
    const char = moveText[i];
    
    if (char === '(' || char === ')') {
      tokens.push(char);
      i++;
    } else if (char === '{') {
      // Parse comment
      let comment = '';
      i++;
      while (i < moveText.length && moveText[i] !== '}') {
        comment += moveText[i];
        i++;
      }
      if (i < moveText.length) {
        comment += '}';
        i++;
      }
      tokens.push(comment);
    } else if (char === '$') {
      // Parse NAG (Numeric Annotation Glyph)
      let nag = '$';
      i++;
      while (i < moveText.length && /\d/.test(moveText[i])) {
        nag += moveText[i];
        i++;
      }
      tokens.push(nag);
    } else if (/\s/.test(char)) {
      // Skip whitespace
      i++;
    } else {
      // Parse token (move number, move, result, etc.)
      let token = '';
      while (i < moveText.length && !/\s/.test(moveText[i]) && moveText[i] !== '(' && moveText[i] !== ')' && moveText[i] !== '{') {
        token += moveText[i];
        i++;
      }
      if (token) {
        tokens.push(token);
      }
    }
  }
  
  return tokens;
}

function parseVariation(tokens: string[], fen: string): { variation: PgnMove[]; consumed: number } {
  const game = new Chess(fen);
  const variation: PgnMove[] = [];
  let consumed = 0;
  
  while (consumed < tokens.length && tokens[consumed] !== ')') {
    const token = tokens[consumed];
    
    if (token === '(') {
      // Nested variation - parse recursively
      const { variation: nested, consumed: nestedConsumed } = parseVariation(tokens.slice(consumed + 1), game.fen());
      if (nested.length > 0 && variation.length > 0) {
        const lastMove = variation[variation.length - 1];
        if (!lastMove.variations) lastMove.variations = [];
        lastMove.variations.push(nested);
      }
      consumed += nestedConsumed + 1;
    } else if (isMoveToken(token)) {
      const result = game.move(token);
      if (result) {
        const move: PgnMove = {
          san: result.san,
          fen: game.fen()
        };
        
        // Check for inline comment
        if (consumed + 1 < tokens.length && tokens[consumed + 1].startsWith('{') && tokens[consumed + 1].endsWith('}')) {
          move.comment = tokens[consumed + 1].slice(1, -1).trim();
          consumed++;
        }
        
        variation.push(move);
      }
      consumed++;
    } else {
      consumed++;
    }
  }
  
  return { variation, consumed };
}

function isMoveToken(token: string): boolean {
  // Skip move numbers like "1.", "2..."
  if (/^\d+\./.test(token)) return false;
  
  // Skip results
  if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) return false;
  
  // Check if it looks like a chess move
  return /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?[?!+]*$/.test(token) || 
         /^O-O(-O)?[+#]?[?!+]*$/.test(token);
}

/**
 * Convert PGN moves to TreeNode structure with variations
 */
export function pgnToTree(moves: PgnMove[]): TreeNode {
  const root: TreeNode = { fen: new Chess().fen(), children: [] };
  
  if (moves.length === 0) return root;
  
  let currentNode = root;
  const game = new Chess();
  
  for (const pgnMove of moves) {
    const result = game.move(pgnMove.san);
    if (!result) continue;
    
    const node: TreeNode = {
      fen: game.fen(),
      move: pgnMove.san,
      children: []
    };
    
    // Add comment if present
    if (pgnMove.comment) {
      node.comment = pgnMove.comment;
    }
    
    // Add annotations if present
    if (pgnMove.annotations && pgnMove.annotations.length > 0) {
      node.annotation = pgnMove.annotations.join(' ');
    }
    
    // Add shapes if present
    if (pgnMove.shapes) {
      node.shapes = pgnMove.shapes;
    }
    
    // Add variations if present
    if (pgnMove.variations) {
      for (const variation of pgnMove.variations) {
        const variationNode = pgnToTree(variation);
        if (variationNode.children.length > 0) {
          node.children.push(...variationNode.children);
        }
      }
    }
    
    currentNode.children.push(node);
    currentNode = node;
  }
  
  return root;
}

/**
 * Fetch Lichess study data by ID using Supabase proxy to avoid CORS
 */
export async function fetchLichessStudy(studyId: string): Promise<LichessStudy | null> {
  try {
    // Use our Supabase Edge Function as a proxy
    // @ts-ignore - Vite environment variables
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    // @ts-ignore - Vite environment variables
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase credentials');
      return null;
    }
    
    // Get the Supabase function URL
    const functionUrl = `${supabaseUrl}/functions/v1/lichess-proxy/study/${studyId}.pgn`;
    
    const response = await fetch(functionUrl, {
      headers: {
        'Accept': 'application/x-ndjson',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      }
    });
    
    if (!response.ok) {
      console.error('Proxy request failed:', response.status, response.statusText);
      return null;
    }
    
    const pgn = await response.text();
    return parsePgnToStudy(pgn, studyId);
  } catch (error) {
    console.error('Failed to fetch Lichess study:', error);
    return null;
  }
}



// Game archive interfaces
export interface GameArchive {
  platform: 'chesscom' | 'lichess';
  username: string;
  games: ArchivedGame[];
}

export interface ArchivedGame {
  id: string;
  white?: {
    username: string;
    rating?: number;
  };
  black?: {
    username: string;
    rating?: number;
  };
  pgn: string;
  url?: string;
  date?: string;
  result?: string;
  color?: 'white' | 'black' | 'both'; // User's color in the game
}

export interface ArchiveFilters {
  color?: 'white' | 'black' | 'both';
  maxMoves?: number;
  batchSize?: number;
  month?: string; // YYYY-MM format for Chess.com archive filtering
}

/**
 * Fetch games from Lichess.org user archive
 */
export async function fetchLichessGames(username: string, filters: ArchiveFilters = {}): Promise<ArchivedGame[]> {
  try {
    // Use our Supabase Edge Function as a proxy
    // @ts-ignore - Vite environment variables
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    // @ts-ignore - Vite environment variables
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase credentials');
      return [];
    }
    
    // Build query parameters
    const params = new URLSearchParams();
    if (filters.color && filters.color !== 'both') {
      params.append('color', filters.color);
    }
    if (filters.batchSize) {
      params.append('count', filters.batchSize.toString());
    }
    
    // Get the Supabase function URL
    const functionUrl = `${supabaseUrl}/functions/v1/lichess-proxy/games/user/${username}?${params.toString()}`;
    
    const response = await fetch(functionUrl, {
      headers: {
        'Accept': 'application/x-ndjson',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      }
    });
    
    if (!response.ok) {
      console.error('Proxy request failed:', response.status, response.statusText);
      return [];
    }
    
    const ndjsonText = await response.text();
    
    // Handle empty or invalid responses
    if (!ndjsonText || ndjsonText.trim() === '') {
      console.warn('Empty response from Lichess API');
      return [];
    }
    
    const games = parseLichessGames(ndjsonText, username);
    
    // Filter out games without PGN data
    const validGames = games.filter(game => {
      const hasPgn = game.pgn && game.pgn.trim().length > 0;
      if (!hasPgn) {
        console.warn(`Game ${game.id} has no PGN data, skipping`);
      }
      return hasPgn;
    });
    
    console.log(`Fetched ${games.length} games, ${validGames.length} have valid PGN data`);
    return validGames;
  } catch (error) {
    console.error('Failed to fetch Lichess games:', error);
    return [];
  }
}

function parsePgnToStudy(pgn: string, studyId: string): LichessStudy {
  // Parse the PGN response
  const chapters: LichessStudyChapter[] = [];
  
  // Split by multiple consecutive newlines to separate chapters
  const chapterSections = pgn.split(/\n\s*\n\s*\n+/).filter(section => section.trim());
  let studyName = 'Imported Study';
  
  for (const section of chapterSections) {
    const lines = section.split('\n').filter(line => line.trim());
    const metadata: Record<string, string> = {};
    let moves = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const match = trimmed.match(/^\[([^\s]+)\s+"([^"]*)"\]$/);
        if (match) {
          metadata[match[1]] = match[2];
        }
      } else if (trimmed && !trimmed.startsWith('[')) {
        moves += trimmed + ' ';
      }
    }
    
    // Store study name from first valid chapter
    if (metadata.StudyName && studyName === 'Imported Study') {
      studyName = metadata.StudyName;
    }
    
    // Only create chapter if we have both a name and moves
    if (metadata.ChapterName && moves.trim()) {
      // Extract chapter ID from URL or use chapter name as fallback
      let chapterId = metadata.ChapterName;
      if (metadata.ChapterURL) {
        const urlParts = metadata.ChapterURL.split('/');
        chapterId = urlParts[urlParts.length - 1];
      }
      
      // Reconstruct PGN for this chapter
      const chapterPgn = [];
      if (metadata.Event) chapterPgn.push(`[Event "${metadata.Event}"]`);
      if (metadata.Date) chapterPgn.push(`[Date "${metadata.Date}"]`);
      if (metadata.Result) chapterPgn.push(`[Result "${metadata.Result}"]`);
      if (metadata.Variant) chapterPgn.push(`[Variant "${metadata.Variant}"]`);
      if (metadata.ECO) chapterPgn.push(`[ECO "${metadata.ECO}"]`);
      if (metadata.Opening) chapterPgn.push(`[Opening "${metadata.Opening}"]`);
      if (metadata.StudyName) chapterPgn.push(`[StudyName "${metadata.StudyName}"]`);
      if (metadata.ChapterName) chapterPgn.push(`[ChapterName "${metadata.ChapterName}"]`);
      if (metadata.ChapterURL) chapterPgn.push(`[ChapterURL "${metadata.ChapterURL}"]`);
      if (metadata.Annotator) chapterPgn.push(`[Annotator "${metadata.Annotator}"]`);
      if (metadata.UTCDate) chapterPgn.push(`[UTCDate "${metadata.UTCDate}"]`);
      if (metadata.UTCTime) chapterPgn.push(`[UTCTime "${metadata.UTCTime}"]`);
      
      chapterPgn.push(''); // Empty line between headers and moves
      chapterPgn.push(moves.trim());
      
      chapters.push({
        id: chapterId,
        name: metadata.ChapterName,
        pgn: chapterPgn.join('\n'),
        orientation: 'white'
      });
    }
  }
  
  return {
    id: studyId,
    name: studyName,
    chapters: chapters,
    likes: 0,
    private: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}



/**
 * Fetch games from Chess.com user archive
 */
export async function fetchChesscomGames(username: string, filters: ArchiveFilters = {}): Promise<ArchivedGame[]> {
  try {
    const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL as string) || '';
    const supabaseAnonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string) || '';
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase credentials');
      return [];
    }
    
    const { color = 'both', maxMoves = 10, batchSize = 10, month } = filters;
    let functionUrl = `${supabaseUrl}/functions/v1/lichess-proxy/chesscom/games/${username}?count=${batchSize}&maxMoves=${maxMoves}`;
    
    // Add month parameter if provided
    if (month) {
      functionUrl += `&month=${month}`;
    }
    
    console.log('Fetching Chess.com games from URL:', functionUrl);
    console.log('Request filters:', { username, color, maxMoves, batchSize, month });
    
    const response = await fetch(functionUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch Chess.com games:', response.status, response.statusText);
      console.error('Response text:', await response.text());
      return [];
    }
    
    const gamesData = await response.json();
    console.log('Raw response data:', gamesData);
    console.log('Response data type:', typeof gamesData);
    console.log('Response data length:', Array.isArray(gamesData) ? gamesData.length : 'not array');
    
    const games = parseChesscomGames(gamesData, username);
    
    // Filter by color if specified
    if (color !== 'both') {
      return games.filter(game => game.color === color);
    }
    
    return games;
  } catch (error) {
    console.error('Failed to fetch Chess.com games:', error);
    return [];
  }
}

/**
 * Convert Lichess moves string to PGN format
 */
function convertMovesToPgn(moves: string): string {
  // Lichess moves format: "e4 c5 Nf3 Nc6 c3 e6 d4 cxd4 cxd4 Bb4+ Bd2 Bxd2+ Nbxd2..."
  // Convert to numbered PGN format
  const moveList = moves.split(' ');
  let pgn = '';
  let moveNumber = 1;
  
  for (let i = 0; i < moveList.length; i += 2) {
    const whiteMove = moveList[i];
    const blackMove = moveList[i + 1];
    
    if (whiteMove) {
      pgn += `${moveNumber}. ${whiteMove}`;
      if (blackMove) {
        pgn += ` ${blackMove}`;
      }
      pgn += ' ';
      moveNumber++;
    }
  }
  
  return pgn.trim();
}

/**
 * Parse Lichess games from API response
 */
export function parseLichessGames(gamesData: string, username: string): ArchivedGame[] {
  console.log('=== Lichess Games Parser ===');
  console.log('Input data length:', gamesData.length);
  console.log('Username:', username);
  console.log('First 500 chars:', gamesData.substring(0, 500));
  
  const games: ArchivedGame[] = [];
  const lines = gamesData.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const game = JSON.parse(line);
        console.log('Parsed game:', game.id, game.players?.white?.user?.name, 'vs', game.players?.black?.user?.name);
        
        // Check if game has move data (Lichess uses "moves" field, not "pgn")
        const hasMoves = game.moves && game.moves.trim().length > 0;
        if (!hasMoves) {
          console.warn(`Game ${game.id} has no move data, skipping`);
          continue;
        }
        
        // Convert moves to PGN format
        const pgnMoves = convertMovesToPgn(game.moves);
        
        games.push({
          id: game.id,
          white: { username: game.players?.white?.user?.name, rating: game.players?.white?.rating },
          black: { username: game.players?.black?.user?.name, rating: game.players?.black?.rating },
          pgn: pgnMoves,
          result: game.result || '',
          date: game.lastMoveAt ? new Date(game.lastMoveAt).toISOString().split('T')[0] : '',
          color: username.toLowerCase() === game.players?.white?.user?.name?.toLowerCase() ? 'white' : 'black'
        });
      } catch (error) {
        console.error('Failed to parse game JSON:', error);
      }
    }
  }
  
  console.log(`Parsed ${games.length} games, ${games.filter(g => g.pgn && g.pgn.trim().length > 0).length} have valid PGN data`);
  return games;
}

/**
 * Chess.com game data from API
 */
interface ChesscomGameData {
  id: string;
  white: {
    username: string;
    rating?: number;
  };
  black: {
    username: string;
    rating?: number;
  };
  pgn: string;
  result: string;
  date: string;
  color?: 'white' | 'black' | 'both';
  time_control?: string;
  end_time?: number;
}

/**
 * Parse Chess.com games from API response
 */
function parseChesscomGames(gamesData: ChesscomGameData[], username: string): ArchivedGame[] {
  console.log('=== Chess.com Games Parser ===');
  console.log('Input games count:', gamesData.length);
  console.log('Username:', username);
  
  const games: ArchivedGame[] = [];
  
  for (const gameData of gamesData) {
    try {
      console.log('Processing game:', gameData.id, gameData.white?.username, 'vs', gameData.black?.username);
      
      const game: ArchivedGame = {
        id: gameData.id || '',
        white: { username: gameData.white?.username || '', rating: gameData.white?.rating },
        black: { username: gameData.black?.username || '', rating: gameData.black?.rating },
        pgn: gameData.pgn || '',
        result: gameData.result || '',
        date: gameData.date || ''
      };
      
      // Determine user's color
      if (game.white?.username?.toLowerCase() === username.toLowerCase()) {
        game.color = 'white';
      } else if (game.black?.username?.toLowerCase() === username.toLowerCase()) {
        game.color = 'black';
      }
      
      // Check if PGN has actual move data (not just headers)
      const hasValidPgn = game.pgn && game.pgn.trim().length > 0 && /\d\./.test(game.pgn);
      if (!hasValidPgn) {
        console.warn(`Game ${gameData.id} has no valid PGN moves, skipping`);
        continue;
      }
      
      // Only add if we have essential data and valid PGN
      if (game.id && game.white?.username && game.black?.username && hasValidPgn) {
        games.push(game);
      } else {
        console.warn(`Game ${gameData.id} skipped - missing data:`, {
          hasId: !!game.id,
          hasWhite: !!game.white?.username,
          hasBlack: !!game.black?.username,
          hasPgn: hasValidPgn
        });
      }
    } catch (error) {
      console.error('Failed to parse Chess.com game:', error);
    }
  }
  
  console.log(`Parsed ${games.length} games from ${gamesData.length} input games`);
  
  // Log the dates of returned games for debugging
  games.forEach((game, index) => {
    console.log(`Game ${index + 1}: ID=${game.id}, Date=${game.date}, White=${game.white.username}, Black=${game.black.username}`);
  });
  
  return games;
}

/**
 * Convert Chess.com game format to PGN
 */
function convertChesscomToPgn(gameData: ArchivedGame): string {
  const headers = [];
  
  if (gameData.white?.username) {
    headers.push(`[White "${gameData.white.username}"]`);
    if (gameData.white.rating) {
      headers.push(`[WhiteElo "${gameData.white.rating}"]`);
    }
  }
  
  if (gameData.black?.username) {
    headers.push(`[Black "${gameData.black.username}"]`);
    if (gameData.black.rating) {
      headers.push(`[BlackElo "${gameData.black.rating}"]`);
    }
  }
  
  if (gameData.date) {
    headers.push(`[Date "${gameData.date}"]`);
  }
  
  if (gameData.result) {
    headers.push(`[Result "${gameData.result}"]`);
  }
  
  headers.push('');
  headers.push(gameData.pgn || '');
  
  return headers.join('\n');
}

/**
 * Parse a single archived game to tree structure
 */
export function parseGameToTree(game: ArchivedGame, maxMoves: number = 10): TreeNode {
  // Convert game to PGN format
  const pgn = convertChesscomToPgn(game);
  
  // Parse the PGN
  const parsedGames = parsePgn(pgn);
  
  if (parsedGames.length === 0) {
    return { fen: new Chess().fen(), children: [] };
  }
  
  // Convert to tree structure with move limit
  return pgnToTree(parsedGames[0].moves.slice(0, maxMoves));
}

/**
 * Filter out games that already exist in the tree
 */
export function filterDuplicateGames(games: ArchivedGame[], existingTree: TreeNode | null): ArchivedGame[] {
  if (!existingTree) return games;
  
  // Get all existing game IDs from the tree
  const existingGameIds = new Set<string>();
  
  function extractGameIds(node: TreeNode) {
    if (node.title && node.title.includes('Game ID:')) {
      const match = node.title.match(/Game ID: (\w+)/);
      if (match) {
        existingGameIds.add(match[1]);
      }
    }
    node.children.forEach(extractGameIds);
  }
  
  extractGameIds(existingTree);
  
  // Filter out games that already exist
  return games.filter(game => !existingGameIds.has(game.id));
}

/**
 * Process games into tree structure with move limits
 */
export function processGamesToTree(games: ArchivedGame[], maxMoves: number = 10, existingTree: TreeNode | null = null): TreeNode {
  const root: TreeNode = { fen: new Chess().fen(), children: [] };
  
  const filteredGames = filterDuplicateGames(games, existingTree);
  
  for (const game of filteredGames) {
    try {
      const gameTree = parseGameToTree(game, maxMoves);
      if (gameTree.children.length > 0) {
        // Add game metadata to the first move
        gameTree.children[0].title = `${game.white?.username} vs ${game.black?.username} (Game ID: ${game.id})`;
        gameTree.children[0].description = `${game.result} ? ${game.color} ? ${gameTree.children.length} moves`;
        
        // Add as separate branch to root
        root.children.push(...gameTree.children);
      }
    } catch (error) {
      console.error('Failed to process game:', error);
    }
  }
  
  return root;
}
