import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize server-side Gemini client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Clean and parse markdown code blocks if the local model leaves stray backticks
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  } else {
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
  }
  return cleaned.trim();
}

// Pre-approved list of all 107 official Scrabble 2-letter words for instant validation
const SCRABBLE_2_LETTER = new Set([
  'AA', 'AB', 'AD', 'AE', 'AG', 'AH', 'AI', 'AL', 'AM', 'AN', 'AR', 'AS', 'AT', 'AW', 'AX', 'AY',
  'BA', 'BE', 'BI', 'BO', 'BY', 'DA', 'DE', 'DI', 'DO', 'ED', 'EF', 'EH', 'EL', 'EM', 'EN', 'ER',
  'ES', 'ET', 'EW', 'FA', 'FE', 'GI', 'GO', 'HA', 'HE', 'HI', 'HM', 'HO', 'ID', 'IF', 'IN', 'IS',
  'IT', 'JO', 'KA', 'KI', 'LA', 'LI', 'LO', 'MA', 'ME', 'MI', 'MM', 'MO', 'MU', 'MY', 'NA', 'NE',
  'NO', 'NU', 'OD', 'OE', 'OF', 'OH', 'OI', 'OK', 'OM', 'ON', 'OP', 'OR', 'OS', 'OW', 'OX', 'OY',
  'PA', 'PE', 'PI', 'PO', 'QI', 'RE', 'SH', 'SI', 'SO', 'TA', 'TE', 'TI', 'TO', 'UH', 'UM', 'UN',
  'UP', 'US', 'UT', 'WE', 'WO', 'XI', 'XU', 'YA', 'YE', 'YO', 'ZA'
]);

let localDictionary: Set<string> | null = null;

function loadLocalDictionary() {
  const dictPath = path.join(process.cwd(), 'dictionary.txt');
  if (fs.existsSync(dictPath)) {
    try {
      const content = fs.readFileSync(dictPath, 'utf-8');
      const words = content.split(/\r?\n/)
        .map(w => w.trim().toUpperCase())
        .filter(w => w.length > 0 && !w.startsWith('#'));
      localDictionary = new Set(words);
      console.log(`Loaded ${localDictionary.size} words from dictionary.txt successfully!`);
    } catch (err) {
      console.error('Failed to read dictionary.txt:', err);
    }
  } else {
    console.log('No dictionary.txt found at root, using default 2-letter fallback and lenient heuristics.');
    localDictionary = null;
  }
}

// Initialize on boot
loadLocalDictionary();

// Checks whether a word is in the standard English Scrabble dictionary
async function isWordValid(word: string): Promise<boolean> {
  const clean = word.toUpperCase().trim();
  if (clean.length <= 1) return true; // Single letters are sometimes used in transitions or blank tiles

  // If local dictionary.txt is loaded, perform a strict offline check against it
  if (localDictionary) {
    return localDictionary.has(clean);
  }

  // Fallback if no dictionary file loaded yet:
  if (clean.length === 2) return SCRABBLE_2_LETTER.has(clean);

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean.toLowerCase())}`);
    if (res.status === 200) return true;
    if (res.status === 404) return false;
  } catch (err) {
    console.warn(`Dictionary API error or timeout checking word "${clean}". Skipping network validation:`, err);
  }

  // Fallback heuristic: Only letters, contains at least one English vowel
  const onlyLetters = /^[A-Z]+$/.test(clean);
  const hasVowels = /[AEIOUY]/.test(clean);
  return onlyLetters && hasVowels;
}

// GET Endpoint to validate user words
app.get('/api/validate-word', async (req, res): Promise<any> => {
  const word = String(req.query.word || '').toUpperCase().trim();
  try {
    const isValid = await isWordValid(word);
    return res.json({ word, isValid });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET Endpoint for dictionary status and total word count representation
app.get('/api/dictionary-stats', (req, res): any => {
  const dictPath = path.join(process.cwd(), 'dictionary.txt');
  return res.json({
    loaded: localDictionary !== null,
    totalWords: localDictionary ? localDictionary.size : 0,
    hasFile: fs.existsSync(dictPath)
  });
});

// POST Endpoint to receive dictionary.txt upload from the front-end
app.post('/api/upload-dictionary', (req, res): any => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing dictionary content text field.' });
  }

  try {
    const dictPath = path.join(process.cwd(), 'dictionary.txt');
    fs.writeFileSync(dictPath, text, 'utf-8');
    loadLocalDictionary();
    return res.json({
      success: true,
      count: localDictionary ? localDictionary.size : 0,
      message: 'Dictionary successfully uploaded, parsed, and hot-reloaded!'
    });
  } catch (err: any) {
    console.error('Failed to write uploaded dictionary:', err);
    return res.status(500).json({ error: `Failed to save dictionary: ${err.message}` });
  }
});

// REST route for AI Move Selection (Supports Google Gemini or local Ollama GPU server)
app.post('/api/ai-move', async (req, res): Promise<any> => {
  try {
    const { boardSlots, rackTiles } = req.body;
    
    // Choose active provider: env variable defaults to "gemini" unless set to "ollama"
    const activeProvider = process.env.AI_PROVIDER || 'gemini';

    if (!rackTiles || !Array.isArray(rackTiles)) {
      return res.status(400).json({ error: 'Rack tiles are required.' });
    }

    // Format board description
    const placedLetters = (boardSlots || []).filter((b: any) => b.letter);
    let boardDescription = 'Board is currently empty (First move!).';
    
    if (placedLetters.length > 0) {
      boardDescription = placedLetters
        .map((b: any) => `Row ${b.row}, Col ${b.col}: letter "${b.letter}"`)
        .join('\n');
    }

    const rackList = rackTiles.map((t: any) => t.letter).join(', ');

    let attempts = 0;
    let decision: any = null;
    let feedback = '';

    while (attempts < 3) {
      attempts++;
      const prompt = `You are a Scrabble Master playing as the AI player on a standard 15x15 board.
Your current letter rack contains these tiles: [ ${rackList} ]

Existing items already fixed on the board:
${boardDescription}

STRICT GAME LAWS:
1. Form a valid, standard English word using letters from your rack and matching/extending existing tiles on the board.
2. Coordinates MUST be 0-indexed! The grid rows-columns are from 0 to 14. Center tile is at Row 7, Col 7. DO NOT use index 15 as it is out-of-bounds!
3. If the board is completely empty, you MUST place one of your tiles on the center start tile at Row 7, Col 7.
4. Newly placed tiles MUST be aligned in a single horizontal row or a single vertical column, and they must touch/connect to adjacent tiles on the board (gaps are allowed ONLY when bridged by previous fixed tiles).
5. Do not reuse coordinates already filled.
6. If you cannot find any valid word with the current rack, return an empty array of placements. This represents passing.
${feedback}
Task: Propose your optimal word to play. Return the list of absolute row/col coordinates and uppercase letters.
`;

      try {
        if (activeProvider === 'ollama') {
          const ollamaUrl = (process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
          const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';

          console.log(`[Attempt ${attempts}] Querying local Ollama instance at ${ollamaUrl}...`);
          let response = await fetch(`${ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: ollamaModel,
              messages: [
                {
                  role: 'system',
                  content: 'You are ScrabblePlayAI, an expert Scrabble puzzle solver designed to return valid game movements in JSON format.'
                },
                {
                  role: 'user',
                  content: prompt + '\nIMPORTANT: Your response MUST be valid JSON matching this schema exactly: {"placements": [{"row": number, "col": number, "letter": "uppercase_letter"}], "word": "word", "explanation": "string"}. Return ONLY raw json.'
                }
              ],
              stream: false
            })
          });

          if (!response.ok) {
            response = await fetch(`${ollamaUrl}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                messages: [
                  {
                    role: 'user',
                    content: prompt + '\nIMPORTANT: Your response MUST be valid JSON matching this schema exactly: {"placements": [{"row": number, "col": number, "letter": "uppercase_letter"}], "word": "word", "explanation": "string"}. Return ONLY raw json.'
                  }
                ],
                stream: false
              })
            });
          }

          if (response.ok) {
            const data: any = await response.json();
            const rawContent = data.message?.content || '{}';
            const cleanedText = cleanJsonResponse(rawContent);
            decision = JSON.parse(cleanedText);
          }
        } else {
          // GEMINI
          if (!ai) {
            return res.status(503).json({ 
              error: 'Gemini API not configured. Please add GEMINI_API_KEY in the Secrets panel, or switch AI_PROVIDER to "ollama".' 
            });
          }

          console.log(`[Attempt ${attempts}] Querying Google Gemini solver...`);
          const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: prompt,
            config: {
              systemInstruction: 'You are ScrabblePlayAI, an expert Scrabble puzzle solver designed to return valid game movements in JSON format matching the schema.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  placements: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        row: { type: Type.INTEGER, description: 'Row index (0 to 14)' },
                        col: { type: Type.INTEGER, description: 'Column index (0 to 14)' },
                        letter: { type: Type.STRING, description: 'Single uppercase letter (e.g. "E")' }
                      },
                      required: ['row', 'col', 'letter']
                    }
                  },
                  word: { type: Type.STRING, description: 'The primary word you formed' },
                  explanation: { type: Type.STRING, description: 'Explain the word or meaning' }
                },
                required: ['placements', 'word']
              }
            }
          });

          const bodyText = response.text || '{}';
          decision = JSON.parse(bodyText.trim());
        }

        if (decision && decision.word) {
          const w = String(decision.word).toUpperCase().trim();
          // Check dictionary
          const isValidWord = await isWordValid(w);
          if (isValidWord) {
            console.log(`[Attempt ${attempts}] AI proposed word "${w}" is verified as standard English!`);
            break; 
          } else {
            console.warn(`[Attempt ${attempts}] AI proposed word "${w}", but it failed dictionary verification. Forcing retry...`);
            feedback = `\nCRITICAL ERROR: Your previous word suggestion "${w}" is NOT a valid word in the Scrabble/English dictionary. You MUST play a real, valid dictionary word. Choose an alternative play using your rack tiles: [ ${rackList} ].`;
          }
        } else {
          // Passed or empty placements
          break;
        }
      } catch (err: any) {
        console.error(`AI selection iteration failed (attempt ${attempts}):`, err);
        feedback = `\nERROR: Your previous configuration resulted in an error during parsing. Please choose a clean, valid set of placements and word description.`;
      }
    }

    if (!decision) {
      decision = { placements: [], word: '', explanation: 'No high scoring valid word available.' };
    }

    return res.json(decision);
  } catch (error: any) {
    console.error('AI solver error:', error);
    return res.status(500).json({ error: error.message || 'AI processing failure' });
  }
});

// Setup Vite Dev Middleware / Static Hosting
async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware attached in Development mode.');
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express application booted on port ${PORT}`);
  });
}

setupVite().catch(console.error);
