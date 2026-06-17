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

// Clean and parse markdown code blocks if the local model leaves stray backticks
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

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

Task: Propose your optimal word to play. Return the list of absolute row/col coordinates and uppercase letters.
`;

    // A. OLLAMA LOCAL GPU ENGINE ROUTER
    if (activeProvider === 'ollama') {
      const ollamaUrl = (process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
      const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';

      console.log(`Querying local Ollama instance at ${ollamaUrl} using model: ${ollamaModel}...`);
      
      try {
        const response = await fetch(`${ollamaUrl}/api/chat`, {
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
                content: prompt + '\nIMPORTANT: Your response MUST be valid JSON matching this schema exactly: {"placements": [{"row": number, "col": number, "letter": "uppercase_letter"}], "word": "word", "explanation": "string"}. Return ONLY raw json without markdown wrap formatting backticks.'
              }
            ],
            format: 'json',
            stream: false
          })
        });

        if (!response.ok) {
          throw new Error(`Local Ollama service returned error status: ${response.status}`);
        }

        const data: any = await response.json();
        const rawContent = data.message?.content || '{}';
        const cleanedText = cleanJsonResponse(rawContent);
        const decision = JSON.parse(cleanedText);
        return res.json(decision);
      } catch (ollamaErr: any) {
        console.error('Ollama solver routine encountered an error:', ollamaErr);
        return res.status(500).json({ 
          error: `Ollama solver error: ${ollamaErr.message || 'Connecting to local host timed out.'}. Make sure Ollama is listening and running.` 
        });
      }
    }

    // B. GOOGLE GEMINI MASTER ENGINE ROUTER (DEFAULT)
    if (!ai) {
      return res.status(503).json({ 
        error: 'Gemini API not configured. Please add GEMINI_API_KEY in the Secrets panel, or switch AI_PROVIDER to "ollama".' 
      });
    }

    console.log('Querying Google Gemini solver...');
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
