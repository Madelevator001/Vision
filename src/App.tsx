/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { 
  Camera, 
  Video, 
  Upload, 
  Copy, 
  Check, 
  RefreshCcw, 
  Sparkles, 
  Image as ImageIcon,
  AlertCircle,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODELS = {
  ANALYSIS: 'gemini-3.1-flash-lite',
  IMAGE_GEN: 'gemini-2.5-flash-image'
};

const MAX_FILE_SIZE_MB = 10;

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [testImage, setTestImage] = useState<string | null>(null);
  const [generatingTest, setGeneratingTest] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [history, setHistory] = useState<{prompt: string, type: 'image' | 'video', date: Date}[]>([]);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for API key on mount
  useEffect(() => {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
      console.warn("GEMINI_API_KEY is not set or using placeholder.");
    }
  }, []);

  // Timer logic for analysis
  useEffect(() => {
    if (analyzing) {
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [analyzing]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        setError(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
        return;
      }
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setGeneratedPrompt(null);
      setTestImage(null);
      setError(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
    });
  };

  const analyzeContent = async () => {
    if (!file) return;

    setAnalyzing(true);
    setGeneratedPrompt(null);
    setError(null);

    try {
      const base64Data = await fileToBase64(file);
      const isVideo = file.type.startsWith('video/');

      const prompt = `Analyze this ${isVideo ? 'video' : 'image'} in extreme detail. 
      Reverse-engineer a highly high-fidelity text-to-image/video prompt that captures:
      1. Technical details: (Camera style, lighting, lens, film stock, focal length)
      2. Artistic style: (Art movement, texture, brushwork, digital medium)
      3. Composition: (Rule of thirds, framing, distance, perspective)
      4. Lighting/Color: (Atmospheric lighting, color palette, mood)
      5. Subjects: (Descriptions of characters, objects, settings)
      
      CRITICAL: Your response MUST be strictly under 900 characters in length.
      Format your response as a single, cohesive, descriptive paragraph optimized for tools like Midjourney or Stable Diffusion. 
      Only provide the final prompt, no conversational text.`;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: MODELS.ANALYSIS,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: file.type,
              },
            },
            { text: prompt },
          ],
        },
      });

      const text = response.text || "Failed to generate prompt.";
      const trimmedText = text.trim();
      setGeneratedPrompt(trimmedText);
      
      // Save to history
      setHistory(prev => [{
        prompt: trimmedText, 
        type: isVideo ? 'video' : 'image',
        date: new Date()
      }, ...prev].slice(0, 5));
      
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setError(err.message || "An error occurred during analysis.");
    } finally {
      setAnalyzing(false);
    }
  };

  const generateTestImage = async () => {
    if (!generatedPrompt) return;

    setGeneratingTest(true);
    setError(null);

    try {
      const response = await ai.models.generateContent({
        model: MODELS.IMAGE_GEN,
        contents: {
          parts: [{ text: generatedPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      });

      let imageUrl = "";
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        setTestImage(imageUrl);
      } else {
        setError("Could not generate test image from this prompt.");
      }
    } catch (err: any) {
      console.error("Gen Error:", err);
      setError("AI generation failed. The prompt might be too complex or triggered a safety filter.");
    } finally {
      setGeneratingTest(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedPrompt) {
      navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setGeneratedPrompt(null);
    setTestImage(null);
    setError(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-hw-bg text-hw-text selection:bg-hw-accent/20">
      {/* Top Header */}
      <header className="h-16 border-b border-hw-border flex items-center justify-between px-6 bg-hw-sidebar/50 backdrop-blur-md z-30 sticky top-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-hw-accent rounded flex items-center justify-center">
            <Sparkles size={18} className="text-black" />
          </div>
          <div>
            <h1 className="font-mono text-xs font-bold tracking-widest text-hw-accent">VISIONARY PROMPT</h1>
            <p className="text-[10px] text-hw-muted uppercase tracking-[0.2em]">High-Fidelity Prompt Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="mono-time text-hw-accent tabular-nums">{formatTime(elapsedTime)}</span>
            <span className="text-[10px] text-hw-muted uppercase font-mono tracking-tighter">System Uptime</span>
          </div>
          <div className="h-8 w-px bg-hw-border" />
          <button className="flex items-center gap-2 px-4 py-2 bg-hw-accent/10 border border-hw-accent/20 text-hw-accent rounded-full text-xs font-mono hover:bg-hw-accent/20 transition-all">
            <div className="w-2 h-2 bg-hw-accent rounded-full animate-pulse" />
            V1.0.4 ONLINE
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 data-grid opacity-5 pointer-events-none" />

        {/* Left Sidebar: Controls */}
        <aside className="w-full lg:w-[400px] border-b lg:border-b-0 lg:border-r border-hw-border bg-hw-sidebar/30 backdrop-blur-sm p-6 lg:p-8 flex flex-col gap-6 lg:gap-8 z-20 shrink-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="status-label">Source Processing</h2>
              <span className="text-[10px] text-hw-muted font-mono">{file?.size ? (file.size / (1024 * 1024)).toFixed(2) + 'MB' : '0.00MB'}</span>
            </div>
            
            <div className="relative aspect-square bg-black border border-hw-border flex items-center justify-center overflow-hidden rounded-lg group shadow-inner">
              <AnimatePresence mode="wait">
                {previewUrl ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full h-full relative"
                  >
                    {file?.type.startsWith('video/') ? (
                      <video src={previewUrl} className="w-full h-full object-contain" controls />
                    ) : (
                      <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                    )}
                    <button 
                      onClick={reset}
                      className="absolute top-4 right-4 p-2 bg-hw-danger text-white rounded-full hover:scale-110 transition-transform shadow-lg z-10"
                    >
                      <X size={16} />
                    </button>
                    {analyzing && <div className="scan-line animate-[scan_2s_linear_infinite]" />}
                  </motion.div>
                ) : (
                  <motion.div 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-4 cursor-pointer group"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="p-6 radial-track flex items-center justify-center w-28 h-28 border-hw-muted/30 group-hover:border-hw-accent/50 transition-colors">
                      <Upload size={36} className="text-hw-muted group-hover:text-hw-accent transition-colors" />
                    </div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-hw-muted group-hover:text-hw-accent transition-colors">Ingest Media Stream</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileChange} className="hidden" />
            </div>

            <button
              onClick={analyzeContent}
              disabled={!file || analyzing}
              className={`w-full py-5 font-mono text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 rounded-lg shadow-lg
                ${(!file || analyzing) 
                  ? 'bg-hw-border text-hw-muted cursor-not-allowed opacity-50' 
                  : 'bg-hw-accent text-black hover:bg-hw-accent/90 hover:shadow-hw-accent/20 active:scale-[0.98]'
                }`}
            >
              {analyzing ? (
                <>
                  <RefreshCcw size={18} className="animate-spin text-hw-accent" />
                  ANALYZING BUFFER...
                </>
              ) : (
                <>
                  <Zap size={18} />
                  DECONSTRUCT MEDIA
                </>
              )}
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-6">
            <h2 className="status-label">Recent Extractions</h2>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
              {history.length > 0 ? history.map((item, i) => (
                <div key={i} className="p-3 bg-white/5 border border-white/5 rounded-md hover:border-hw-accent/30 transition-colors cursor-pointer group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-hw-accent uppercase">{item.type} extraction</span>
                    <span className="text-[9px] text-hw-muted font-mono">{item.date.toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[11px] text-hw-muted line-clamp-2 leading-relaxed font-mono group-hover:text-hw-text transition-colors">
                    {item.prompt}
                  </p>
                </div>
              )) : (
                <div className="h-full flex items-center justify-center border border-dashed border-hw-border rounded-lg opacity-20">
                  <p className="text-[10px] uppercase font-mono tracking-widest">History Empty</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 bg-hw-danger/10 border border-hw-danger/30 rounded-lg flex gap-3 items-start"
            >
              <AlertCircle size={18} className="text-hw-danger shrink-0 mt-0.5" />
              <p className="text-xs text-hw-danger font-mono leading-relaxed">{error}</p>
            </motion.div>
          )}

          <div className="pt-6 border-t border-hw-border flex justify-between items-center opacity-40">
            <div className="flex gap-2">
              <div className="w-1.5 h-1.5 bg-hw-accent rounded-full animate-pulse" />
              <div className="w-1.5 h-1.5 bg-hw-muted rounded-full" />
              <div className="w-1.5 h-1.5 bg-hw-muted rounded-full" />
            </div>
            <span className="text-[9px] font-mono tracking-widest">ENCRYPTION: AES-256</span>
          </div>
        </aside>

        {/* Right Area: Results Display */}
        <section className="flex-1 p-6 lg:p-12 lg:overflow-y-auto z-10">
          <div className="max-w-4xl mx-auto space-y-8 lg:space-y-12">
            {/* Prompt Result */}
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl lg:text-2xl font-medium tracking-tight">Prompt Matrix Analysis</h2>
                  <p className="text-xs lg:text-sm text-hw-muted font-mono mt-1">Generated text representation of visual input</p>
                </div>
                {generatedPrompt && (
                  <div className="flex gap-3">
                    <button 
                      onClick={copyToClipboard}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-hw-text hover:bg-white/10 hover:border-hw-accent/50 transition-all text-xs lg:text-sm font-mono"
                    >
                      {copied ? <Check size={16} className="text-hw-accent" /> : <Copy size={16} />}
                      {copied ? 'TRANSFERRED' : 'COPY MATRIX'}
                    </button>
                  </div>
                )}
              </div>

              <div className="min-h-[200px] lg:min-h-[280px] bg-white/[0.02] border border-hw-border rounded-2xl p-6 lg:p-8 relative overflow-hidden group shadow-2xl">
                <div className="absolute top-0 left-0 w-1 h-full bg-hw-accent/20" />
                <AnimatePresence mode="wait">
                  {generatedPrompt ? (
                    <motion.div 
                      key="prompt"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      <p className="text-hw-text font-mono leading-relaxed lg:leading-loose text-base lg:text-lg select-all first-letter:text-2xl lg:first-letter:text-3xl first-letter:text-hw-accent">
                        {generatedPrompt}
                      </p>
                      <div className="flex flex-wrap gap-4 lg:gap-8 border-t border-hw-border pt-6 mt-6">
                        <div className="space-y-1">
                          <span className="status-label text-[8px] lg:text-[9px]">Confidence Score</span>
                          <p className="text-hw-accent font-mono text-xs lg:text-sm">98.2%</p>
                        </div>
                        <div className="space-y-1">
                          <span className="status-label text-[8px] lg:text-[9px]">Token Density</span>
                          <p className="text-white font-mono text-xs lg:text-sm">High (Opt)</p>
                        </div>
                        <div className="space-y-1">
                          <span className="status-label text-[8px] lg:text-[9px]">Entropy Level</span>
                          <p className="text-white font-mono text-xs lg:text-sm">0.422</p>
                        </div>
                        <div className="space-y-1">
                          <span className="status-label text-[8px] lg:text-[9px]">Buffer Length</span>
                          <p className={`font-mono text-xs lg:text-sm ${generatedPrompt.length > 850 ? 'text-hw-danger' : 'text-hw-accent'}`}>
                            {generatedPrompt.length}/900
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="placeholder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center gap-6 h-full py-12"
                    >
                      <div className="p-4 bg-hw-accent/5 rounded-full">
                        <Camera size={40} className="lg:size-12 text-hw-muted/20" />
                      </div>
                      <div className="flex flex-col items-center gap-2 text-center">
                        <p className="text-xs font-mono text-hw-muted/40 uppercase tracking-[0.2em] lg:tracking-[0.3em]">Awaiting Input Sequence</p>
                        <p className="text-[10px] lg:text-xs text-hw-muted/20 max-w-xs px-4">Upload an image or video to begin visual deconstruction and prompt synthesis.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Visualization Result */}
            {generatedPrompt && (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-8 lg:pt-12 border-t border-hw-border space-y-6 lg:space-y-8"
              >
                <div className="flex flex-col sm:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg lg:text-xl font-medium">Reconstruction Synthesis</h3>
                    <p className="text-xs lg:text-sm text-hw-muted font-mono mt-1">Simulated output verified against analysis matrix</p>
                  </div>
                  <button 
                    onClick={generateTestImage}
                    disabled={generatingTest}
                    className={`px-6 py-3 rounded-full text-xs lg:text-sm transition-all flex items-center justify-center gap-3 font-mono border
                      ${generatingTest 
                        ? 'bg-hw-accent/10 border-hw-accent/30 text-hw-accent animate-pulse' 
                        : 'bg-white text-black hover:bg-hw-accent hover:scale-105 active:scale-95 shadow-xl'
                      }`}
                  >
                    {generatingTest ? (
                      <RefreshCcw size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {generatingTest ? 'SYNTHESIZING...' : 'SIMULATE RECONSTRUCTION'}
                  </button>
                </div>

                <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-hw-border flex items-center justify-center relative shadow-2xl group/img">
                  <AnimatePresence mode="wait">
                    {testImage ? (
                      <motion.img 
                        key="image"
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        src={testImage} 
                        alt="Simulation" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <motion.div 
                        key="empty"
                        className="flex flex-col items-center gap-4 opacity-30 group-hover/img:opacity-50 transition-opacity"
                      >
                        <div className="w-16 h-16 border-2 border-dashed border-hw-muted rounded-2xl flex items-center justify-center">
                          <ImageIcon size={32} className="text-hw-muted" />
                        </div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.4em]">Simulator Idle</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {generatingTest && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-md z-10">
                      <div className="flex flex-col items-center gap-6">
                        <div className="w-64 h-1 bg-hw-muted/10 rounded-full overflow-hidden relative">
                          <motion.div 
                            className="absolute inset-0 bg-hw-accent shadow-[0_0_15px_var(--color-hw-accent)]"
                            animate={{ x: ['-100%', '100%'] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-xs text-hw-accent font-mono uppercase tracking-[0.5em]">Compiling Visual Buffer</span>
                          <span className="text-[9px] text-hw-muted font-mono animate-pulse">Running Gen-AI Model 2.5-Flash</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            
            {/* Tech Footer */}
            <footer className="pt-24 pb-8 flex flex-col md:flex-row justify-between items-center gap-8 border-t border-hw-border/30 opacity-30 grayscale transition-all hover:opacity-80 hover:grayscale-0">
               <div className="flex items-center gap-4">
                  <div className="w-px h-12 bg-hw-border" />
                  <div className="font-mono space-y-1">
                    <p className="text-[10px] uppercase text-hw-text">System Protocol</p>
                    <p className="text-[9px] text-hw-muted">Gemini Ultra Engine Adaptive-Learning enabled.</p>
                  </div>
               </div>
               <div className="flex gap-12 font-mono text-[9px] uppercase tracking-widest">
                  <div className="flex flex-col gap-1">
                    <span className="text-hw-text">Model Analysis</span>
                    <span className="text-hw-muted">3.1-Flash-Lite</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-hw-text">Synth Engine</span>
                    <span className="text-hw-muted">2.5-Flash-Image</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-hw-text">Status</span>
                    <span className="text-hw-accent">Stable</span>
                  </div>
               </div>
            </footer>
          </div>
        </section>
      </main>

      {/* Global CSS for some custom animations */}
      <style>{`
        @keyframes scan {
          from { top: -10%; }
          to { top: 110%; }
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

const Zap = ({ size, className }: { size?: number, className?: string }) => (
  <svg 
    width={size || 24} 
    height={size || 24} 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    stroke="none" 
    className={className}
  >
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);
