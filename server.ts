import express from 'express';
import path from 'path';
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

// REST route for AI Move Selection
app.post('/api/ai-move', async (req, res): Promise<any> => {
  try {
    const { boardSlots, rackTiles } = req.body;
    
    if (!ai) {
      return res.status(503).json({ 
        error: 'Gemini API not configured. Please add GEMINI_API_KEY in the Secrets panel.' 
      });
    }

    if (!rackTiles || !Array.isArray(rackTiles)) {
      return res.status(400).json({ error: 'Rack tiles are required.' });
    }

    // Format board for Gemini prompt
    const placedLetters = (boardSlots || []).filter((b: any) => b.letter);
    let boardDescription = 'Board is currently empty (First move!).';
    
    if (placedLetters.length > 0) {
      boardDescription = placedLetters
        .map((b: any) => `Row ${b.row}, Col ${b.col}: letter "${b.letter}"`)
        .join('\n');
    }

    const rackList = rackTiles.map((t: any) => t.letter).join(', ');

    const prompt = `You are a Scrabble Master playing as the AI player on a standard 15x15 board.
Your current letter rack contains these tiles: [ ${rackList} ]

Existing items already fixed on the board:
${boardDescription}

STRICT GAME LAWS:
1. Form a valid, standard English word using letters from your rack and matching/extending existing tiles on the board.
2. If the board is completely empty, you MUST place one of your tiles on the center start tile at Row 7, Col 7.
3. Newly placed tiles MUST be aligned in a single horizontal row or a single vertical column, and they must touch/connect to adjacent tiles on the board (gaps are allowed ONLY when bridged by previous fixed tiles).
4. Do not reuse coordinates already filled.
5. If you cannot find any valid word with the current rack, return an empty array of placements. This represents passing.

Task: Propose your optimal word to play. Return the list of absolute row/col coordinates and uppercase letters.
`;

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
    const decision = JSON.parse(bodyText.trim());
    return res.json(decision);
  } catch (error: any) {
    console.error('Gemini solver error:', error);
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
