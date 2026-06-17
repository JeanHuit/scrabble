# Standalone Web Scrabble with Local Ollama GPU & Cloudflare Deploy Guide

This guide describes how to host this custom full-stack Classic Scrabble game on your local server, run the AI Scrabble solver locally on your GPU using **Ollama**, and expose the game securely to any internet-connected device (phones, tablets, laptops) via a free **Cloudflare Tunnel**.

---

## Technical Stack Architecture
* **Frontend**: React (Vite, TypeScript, Tailwind CSS v4, Lucide Icons, Framer Motion)
* **Backend**: Node/Express custom server routing `/api/ai-move`
* **Local LLM**: Ollama executing with 8GB GPU VRAM
* **Secure Access**: Cloudflare Tunnel (`https://`) forwarding requests to port `3000`

---

## 1. Local Server Environment Setup

Extract this repository onto your server space and initialize the packages:

```bash
# 1. Install dependencies
npm install

# 2. Set up your local environment file
cp .env.example .env
```

Open `.env` on your server and customize the values:

```properties
# Port bound by server.ts (Needs to match in reverse proxies/tunnels)
PORT=3000

# Set AI service provider (Use "ollama" for GPU-accelerated offline solver)
AI_PROVIDER="ollama"

# Set path of your local Ollama instance (by default localhost)
OLLAMA_API_URL="http://127.0.0.1:11434"

# Set the Ollama model name (Mistral or Qwen works extremely cleanly for puzzles)
OLLAMA_MODEL="mistral"

# Optional Google Gemini key if you want to swap back later
GEMINI_API_KEY=""
```

---

## 2. Booting Ollama & Optimizing for 8GB GPU VRAM

With **8GB of VRAM**, you can comfortably and extremely rapidly run quantized models up to **7B, 8B, or 9B parameters** at highly active rates (producing decisions in under 1 second).

### Recommended Models for Scrabble Puzzle Solving
* **`mistral` (7B)** - Excellent reasoning, precise formatting.
* **`llama3` (8B)** or **`llama3.1` (8B)** - Exceptional task execution.
* **`qwen2.5:7b`** - Strong logical compliance.
* **`gemma2:9b`** - High accuracy, fits nicely within 8GB VRAM limits.

```bash
# 1. Confirm your Ollama service is active
curl http://127.0.0.1:11434

# 2. Pull down your preferred model
ollama pull mistral
```

---

## 3. Creating a Free Cloudflare Tunnel (Secure HTTPS Exposure)

Because web browsers restrict raw requests, microphone/geolocation features, and cookie configurations over standard unencrypted HTTP web portals, exposing the application using an **HTTPS** tunnel from Cloudflare keeps your connection secure, stable, and easily shareable.

### Setup Guide (Zero-Configuration Cloudflare Quick Tunnels):
You do not need a domain name or Cloudflare dashboard account to test immediately:

```bash
# Install Cloudflare CLI locally (Ubuntu/Debian)
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb

# Launch the tunnel pointing directly to Express server port 3000
cloudflared tunnel --url http://localhost:3000
```

Cloudflare will instantly output a high-speed secure URL ending in `.trycloudflare.com`:
```text
+-------------------------------------------------------------------------+
| Your quick tunnel has been created!                                     |
| Go to URL: https://scrabble-game-example.trycloudflare.com              |
+-------------------------------------------------------------------------+
```

*Simply share that secure address with any friends or open it on your smartphone to start playing!*

---

## 4. Compile & Start the Application

Compile and launch the optimized production bundles:

```bash
# Build standalone server module (dist/server.cjs) and client artifacts (dist/*)
npm run build

# Start server node
npm run start
```

Your server will boot and display:
```text
Server running on http://localhost:3000
```
Open your custom `.trycloudflare.com` URL in your browser and you can instantly start playing against your local GPU-accelerated Ollama opponent!

---

## 5. Troubleshooting Local Build Errors

### Error: "Cannot find native binding" (`@tailwindcss/oxide`)
This is raised if the preloaded Tailwind v4 binary inside `node_modules` does not correspond to your server CPU/OS architecture:
```bash
# Force clear current node_modules and lockers
rm -rf node_modules package-lock.json

# Run fresh install to fetch clean compile matching your hardware
npm install
```

### Error: "TypeError [ERR_INVALID_URL_SCHEME]" in `tsx`
A path parser conflict when relative alias wildcards are declared inside TS configs under node runtimes during dev mode:
* **Fix implemented**: We have **fully purged** any unused aliases from both `/vite.config.ts` and `/tsconfig.json`. The application is fully optimized to run flawlessly out-of-the-box on your server!

---

## 6. Real-Time Supabase Database Setup

To power the online PvP match lobbies and sync live tile placements with friends, connect your own free **Supabase** instance!

### Step 1: Create the Database Table
In your Supabase project dashboard, navigate to the **SQL Editor**, paste the following schema, and click **Run**:

```sql
-- Create the main games storage table
create table games (
  id text primary key,
  state jsonb not null,
  status text not null,
  updated_at bigint not null
);

-- Enable Row Level Security (RLS) or add an bypass policy for rapid play
alter table games enable row level security;

create policy "Allow public anonymous access to games"
on games for all
using (true)
with check (true);
```

### Step 2: Enable Postgres Changes Realtime
By default, table-level replication is restricted in new Supabase schemas. You **MUST** enable Realtime for the `games` table:
1. In your Supabase left-hand navigation sidebar, click on **Database** (the database icon).
2. Click on **Replication**.
3. Under the **`supabase_realtime`** publication row, click **Edit** (or search for the table list).
4. Find the **`games`** table row, toggle the switch **ON** to enable Realtime replication, and click **Save**.

*Alternative SQL Command (if you prefer running SQL to enable Database Realtime):*
```sql
alter publication supabase_realtime add table games;
```

### Step 3: Update Your Environment variables
Finally, copy your credentials and place them in your `.env` or `.env.example` file:
```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key-from-api-settings"
```

The game lobby will dynamically notice these variables, disable Firebase modes, and automatically unlock the **Supabase Online PvP Mode**!

