import React, { useState, useEffect } from 'react';
import { Upload, BookOpen, RefreshCw, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export const DictionaryManager: React.FC = () => {
  const [stats, setStats] = useState<{ loaded: boolean; totalWords: number; hasFile: boolean } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/dictionary-stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load dictionary stats:', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.txt')) {
      setErrorMessage('Please upload a standard plain text file (.txt).');
      return;
    }

    setLoading(true);
    setUploadMessage('Reading text file contents...');
    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setErrorMessage('Failed to read text from file.');
        setLoading(false);
        return;
      }

      // Count preview words client-side
      const wordsCount = text.split(/\r?\n/)
        .map(w => w.trim())
        .filter(w => w.length > 0 && !w.startsWith('#')).length;

      setUploadMessage(`Processing and uploading ${wordsCount.toLocaleString()} words...`);

      try {
        const res = await fetch('/api/upload-dictionary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.success) {
          setUploadMessage(`Success! Loaded ${data.count.toLocaleString()} words.`);
          fetchStats();
        } else {
          setErrorMessage(data.error || 'Server error uploading file.');
        }
      } catch (err: any) {
        setErrorMessage(`Upload request failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setErrorMessage('Error reading file.');
      setLoading(false);
    };

    reader.readAsText(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const onFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleResetToDefault = async () => {
    setLoading(true);
    setErrorMessage(null);
    setUploadMessage('Resetting dictionary database...');
    try {
      // Create a nice small base word list text
      const res = await fetch('/api/upload-dictionary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: `# Reset to default seed\nAA\nAB\nAD\nAE\nAG\nAH\nAI\nAL\nAM\nAN\nAR\nAS\nAT\nAW\nAX\nAY\nBA\nBE\nBI\nBO\nBY\nDA\nDE\nDI\nDO\nED\nEF\nEH\nEL\nEM\nEN\nER\nES\nET\nEW\nFA\nFE\nGI\nGO\nH\nHE\nHI\nHM\nHO\nID\nIF\nIN\nIS\nIT\nJO\nKA\nKI\nLA\nLI\nLO\nMA\nME\nMI\nMM\nMO\nMU\nMY\nNA\nNE\nNO\nNU\nOD\nOE\nOF\nOH\nOI\nOK\nOM\nON\nOP\nOR\nOS\nOW\nOX\nOY\nPA\nPE\nPI\nPO\nQI\nRE\nSH\nSI\nSO\nTA\nTE\nTI\nTO\nUH\nUM\nUN\nUP\nUS\nUT\nWE\nWO\nXI\nXU\nYA\nYE\nYO\nZA` 
        })
      });
      const data = await res.json();
      if (data.success) {
        setUploadMessage('Reset to base word seed accomplished.');
        fetchStats();
      } else {
        setErrorMessage(data.error || 'Server error resetting list.');
      }
    } catch (err: any) {
      setErrorMessage(`Reset request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="dictionary-manager" className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Scrabble Dictionary
          </h2>
        </div>
        {stats && (
          <span className="text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full font-bold">
            {stats.totalWords.toLocaleString()} Words Active
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-slate-400">
        <p className="leading-relaxed">
          The Scrabble Board and Gemini AI always use the local wordlist. You can load 
          your own text file to instantly enforce custom lexicon restrictions offline!
        </p>
      </div>

      {/* Drag and Drop Zone */}
      <div
        id="dictionary-drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition ${
          isDragging 
            ? 'border-amber-500 bg-amber-500/5' 
            : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-950/60'
        }`}
      >
        <input
          id="dictionary-file-input"
          type="file"
          accept=".txt"
          onChange={onFileSelectChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={loading}
        />
        
        <div className="flex flex-col items-center gap-2.5">
          <Upload className={`w-8 h-8 ${isDragging ? 'text-amber-400' : 'text-slate-500'} ${loading ? 'animate-bounce' : ''}`} />
          <div>
            <span className="text-xs font-bold text-slate-200 block">
              Drag & drop your dictionary .txt file here
            </span>
            <span className="text-[10px] text-slate-500 block mt-1">
              Plain text list, one word per line (CSV or carriage-return syntax)
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Load Feedback Banner */}
      {(uploadMessage || errorMessage) && (
        <div className={`p-3 rounded-xl border flex items-start gap-2 text-xs leading-relaxed ${
          errorMessage 
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' 
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
        }`}>
          {errorMessage ? (
            <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          )}
          <span className="flex-1">{errorMessage || uploadMessage}</span>
        </div>
      )}

      {/* Bottom management controls */}
      <div className="flex justify-between items-center text-xs mt-1">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5 text-slate-600" />
          {stats?.hasFile ? (
            <span className="text-emerald-500 font-bold">dictionary.txt active</span>
          ) : (
            <span>No custom word list found</span>
          )}
        </div>

        <button
          onClick={handleResetToDefault}
          disabled={loading}
          className="text-[10px] sm:text-xs font-bold text-slate-500 hover:text-amber-400 transition flex items-center gap-1.5 border border-slate-800 rounded-lg px-2.5 py-1 hover:border-slate-700 disabled:opacity-40"
        >
          <RefreshCw className="w-3 h-3" /> Reset Seed
        </button>
      </div>
    </div>
  );
};
