import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileArchive, X, AlertCircle, Loader2, Code2, Youtube } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';

interface FileConfig {
  id: string;
  file: File;
  originalStr: string;
  targetStr: string;
  mode?: 'all' | 'card' | 'rename' | 'modifyEffect';
  targetScale?: string;
}

const TRAIN_FRAMES = [
`
   _________ ___O o 
  |O O O O| |o|__][_
  |_______|-|_______>
   o   o     O-O-O\\
`,
`
   _________ ___O   
  |O O O O| |o|__][_
  |_______|-|_______>
   o   o    O-O-O /
`
];

const CAT_IDLE_FRAMES = [
`
 /\\_/\\
( o.o )
 > ^ <
`,
`
 /\\_/\\
( -.- )
 > ^ <
`,
`
 /\\_/\\
( ^.^ )
 > ^ <
`,
`
 /\\_/\\
( o.o )
 > ^ <
`
];

const CAT_RUN_FRAMES = [
`
    |\\__/,|   (\`\\
  _.|o o  |_   ) )
 -(((---(((--------
`,
`
    |\\__/,|   (\`\\
  _.|- -  |_   ) )
 -(((---(((--------
`
];

const UFO_FRAMES = [
`
     .  *
   _.-" "-._
  (   o o   )
   '-------'
      .
`,
`
    *   .
   _.-" "-._
  (   O O   )
   '-------'
        *
`,
`
      .
   _.-" "-._
  (   - -   )
   '-------'
    *
`,
`
    .   *
   _.-" "-._
  (   ^ ^   )
   '-------'
      .
`
];

export default function App() {
  const [fileConfigs, setFileConfigs] = useState<FileConfig[]>([]);
  const [watermark, setWatermark] = useState('');
  const [useCompression, setUseCompression] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  
  useEffect(() => {
    if (!isLoading) {
      setLogs([]);
      return;
    }
    const interval = setInterval(() => {
      const msgs = [
        "Unpacking AssetBundle container...",
        "Scanning typetree and object definitions...",
        "Extracting CAB-* instances to memory...",
        "Patching target keywords...",
        "Validating internal block checksums...",
        "Applying LZ4 stream compression...",
        "Rebuilding CAB blocks...",
        "Writing chunk data...",
        "Finalizing processed bundle..."
      ];
      const randMsg = msgs[Math.floor(Math.random() * msgs.length)];
      const fileName = fileConfigs.length > 0 ? fileConfigs[Math.floor(Math.random() * fileConfigs.length)].file.name : 'asset.unity3d';
      const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.mmm
      setLogs(prev => [...prev, `[${timestamp}] INFO: ${randMsg} -> ${fileName}`].slice(-50));
    }, 250);
    return () => clearInterval(interval);
  }, [isLoading, fileConfigs]);

  const [modalState, setModalState] = useState<{ type: 'addSuffix' | 'removeSuffix' | 'replace' | 'replaceCard' | 'modifyEffect' | null }>({ type: null });
  const [modalInput1, setModalInput1] = useState('');
  const [modalInput2, setModalInput2] = useState('');

  const [notification, setNotification] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [asciiFrame, setAsciiFrame] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading || notification.show || isDragActive || fileConfigs.length === 0) {
      interval = setInterval(() => {
        setAsciiFrame(prev => prev + 1);
      }, 300);
    } else {
      setAsciiFrame(0);
    }
    return () => clearInterval(interval);
  }, [isLoading, notification.show, isDragActive, fileConfigs.length]);

  const showNotification = (msg: string) => {
    setNotification({ show: true, message: msg });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3500);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(Array.from(e.dataTransfer.files));
    }
  };

  const handleFilesSelect = (files: File[]) => {
    const validFiles = files.filter(f => f.name.endsWith('.unity3d') || f.name.endsWith('.bundle') || f.name.endsWith('.bnk'));
    if (validFiles.length === 0) {
      setError("Please upload valid .unity3d, .bundle, or .bnk files.");
      return;
    }
    setError(null);
    
    const newConfigs = validFiles.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      originalStr: file.name.replace(/\.(unity3d|bundle|bnk)$/i, ''),
      targetStr: ''
    }));
    
    setFileConfigs(prev => [...prev, ...newConfigs]);
  };

  const removeFile = (idToRemove: string) => {
    setFileConfigs(prev => prev.filter(c => c.id !== idToRemove));
  };

  const updateConfig = (id: string, field: 'originalStr' | 'targetStr', value: string) => {
    setFileConfigs(prev => prev.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fileConfigs.length === 0) {
      setError("Please select at least one AssetBundle file.");
      return;
    }
    
    const hasEmptyFields = fileConfigs.some(c => {
      if (c.mode === 'modifyEffect') {
        // For modifyEffect, either targetStr (color) or targetScale must be present
        return !c.originalStr || (!c.targetStr && !c.targetScale);
      }
      return !c.originalStr || !c.targetStr;
    });
    if (hasEmptyFields || !watermark) {
      setError("Harap isi semua kolom Keyword yang diperlukan.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgressText("Initializing...");

    try {
      const formData = new FormData();
      formData.append('watermark', watermark);
      formData.append('useCompression', useCompression ? 'true' : 'false');
      
      const configsPayload = fileConfigs.map(c => ({
        originalname: c.file.name,
        originalStr: c.originalStr,
        targetStr: c.targetStr,
        targetScale: c.targetScale,
        mode: c.mode || 'all'
      }));
      formData.append('configs', JSON.stringify(configsPayload));

      for (let i = 0; i < fileConfigs.length; i++) {
        formData.append('files', fileConfigs[i].file);
      }
      
      setProgressText(`Uploading ${fileConfigs.length} files to server...`);

      const processResponse = await fetch('/api/process-batch', {
        method: 'POST',
        body: formData,
      });

      if (!processResponse.ok) {
        let errorMsg = `Server error: ${processResponse.status}`;
        try {
          const contentType = processResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await processResponse.json();
            if (errorData.detail) errorMsg = errorData.detail;
          } else {
            errorMsg = `Server connection error (${processResponse.status}). Files might be too large or server is busy.`;
          }
        } catch (e) {}
        throw new Error(errorMsg);
      }

      const contentType = processResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
         throw new Error(`Invalid server response. Please try again or check file size. (Status: ${processResponse.status})`);
      }
      const { jobId } = await processResponse.json();
      
      // Poll for job status
      let jobStatus = 'pending';
      while (jobStatus === 'pending' || jobStatus === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const statusRes = await fetch(`/api/job-status/${jobId}`);
        if (!statusRes.ok) throw new Error(`Failed to fetch job status (${statusRes.status})`);
        
        const contentType = statusRes.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Invalid status response from server. Connection may have dropped.`);
        }
        
        const jobData = await statusRes.json();
        
        jobStatus = jobData.status;
        if (jobStatus === 'error') {
          throw new Error(jobData.error || 'Job failed during processing');
        }
        
        if (jobStatus === 'processing') {
          setProgressText(`Processing files on server... (${jobData.progress}/${jobData.total})`);
        }
      }

      setProgressText("Downloading processed files... (Starting)");
      const downloadResponse = await fetch(`/api/job-download/${jobId}`);
      if (!downloadResponse.ok) throw new Error('Failed to download file');
      
      const contentLength = downloadResponse.headers.get('content-length');
      const total = parseInt(contentLength || '0', 10);
      
      let loaded = 0;
      const reader = downloadResponse.body?.getReader();
      const chunks = [];
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loaded += value.length;
            if (total) {
              const percent = Math.round((loaded / total) * 100);
              setProgressText(`Downloading processed files... (${percent}%)`);
            } else {
              const mb = (loaded / (1024 * 1024)).toFixed(2);
              setProgressText(`Downloading processed files... (${mb} MB)`);
            }
          }
        }
      }
      
      const blob = new Blob(chunks);
      
      let targetName = fileConfigs.length > 1 ? "processed_bundles.zip" : fileConfigs[0].file.name;
      const disposition = downloadResponse.headers.get('content-disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const parts = disposition.split('filename=');
        if (parts.length > 1) {
          targetName = parts[1].split(';')[0].replace(/['"]/g, '');
        }
      }

      saveAs(blob, targetName);

      setProgressText(null);
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setError('Connection lost. The server might have timed out. Please try again with fewer files.');
      } else {
        setError(err.message || 'An error occurred during processing.');
      }
    } finally {
      setIsLoading(false);
      setProgressText(null);
    }
  };

  return (
    <div className="bg-slate-900 text-slate-50 h-screen w-screen overflow-hidden flex flex-col font-sans">
      <header className="bg-slate-800 border-b border-slate-700 px-6 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="https://raw.githubusercontent.com/xiroro-ab/Toko-Online-Script-Mlbb/refs/heads/main/logo-web.png" alt="Xiroro" className="w-8 h-8 rounded-lg object-cover" />
          <div className="flex flex-col">
            <h1 className="text-base font-bold leading-tight">BundlePort Studio</h1>
            <p className="text-[11px] text-slate-400">Unity AssetBundle Porter Tool By Xiroro</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://www.youtube.com/@Xiroro-3DMODEL" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 text-xs">
            <Youtube className="w-4 h-4" /> <span className="hidden sm:inline">Xiroro-3D</span>
          </a>
          <a href="https://www.youtube.com/@XiroroNew-3DMODEL" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 text-xs">
            <Youtube className="w-4 h-4" /> <span className="hidden sm:inline">XiroroNew</span>
          </a>
          <a href="https://www.youtube.com/@XiroroAkunKe-100" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 text-xs">
            <Youtube className="w-4 h-4" /> <span className="hidden sm:inline">Xiroro 100</span>
          </a>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden w-full">
        {/* Sidebar */}
        <aside className="w-full lg:w-[320px] bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-700 p-6 flex flex-col gap-6 shrink-0 lg:overflow-y-auto">
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Modification Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] text-slate-300 mb-2">Batch Operations</label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (fileConfigs.length === 0) {
                        showNotification("Silakan masukkan file asset bundle terlebih dahulu!");
                        return;
                      }
                      setModalState({ type: 'addSuffix' });
                      setModalInput1('');
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-indigo-400 py-2 px-3 rounded text-left transition-colors"
                  >
                    + Tambah Akhiran ke Semua (Add Suffix)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (fileConfigs.length === 0) {
                        showNotification("Silakan masukkan file asset bundle terlebih dahulu!");
                        return;
                      }
                      setModalState({ type: 'removeSuffix' });
                      setModalInput1('');
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-pink-400 py-2 px-3 rounded text-left transition-colors"
                  >
                    - Hapus Akhiran dari Semua (Remove Suffix)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (fileConfigs.length === 0) {
                        showNotification("Silakan masukkan file asset bundle terlebih dahulu!");
                        return;
                      }
                      setModalState({ type: 'replace' });
                      setModalInput1('');
                      setModalInput2('');
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 py-2 px-3 rounded text-left transition-colors"
                  >
                    ⇄ Ganti Akhiran / Skin Spesifik (Replace)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (fileConfigs.length === 0) {
                        showNotification("Silakan masukkan file asset bundle terlebih dahulu!");
                        return;
                      }
                      setModalState({ type: 'replaceCard' });
                      setModalInput1('');
                      setModalInput2('');
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-amber-400 py-2 px-3 rounded text-left transition-colors"
                  >
                    ⇄ Ganti Card Skin Spesifik (Card Only)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (fileConfigs.length === 0) {
                        showNotification("Silakan masukkan file asset bundle terlebih dahulu!");
                        return;
                      }
                      setModalState({ type: 'modifyEffect' });
                      setModalInput1('');
                      setModalInput2('');
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-purple-400 py-2 px-3 rounded text-left transition-colors"
                  >
                    🎨📏 Modifikasi Efek (Warna & Ukuran)
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      const bnkConfigs = fileConfigs.filter(c => c.file.name.toLowerCase().endsWith('.bnk'));
                      if (bnkConfigs.length === 0) {
                        showNotification("Tidak ada file .bnk yang diunggah!");
                        return;
                      }
                      
                      const newConfigs: typeof fileConfigs = [];
                      
                      fileConfigs.forEach(config => {
                        if (config.file.name.toLowerCase().endsWith('.bnk')) {
                          let baseStr = config.originalStr;
                          let extensionStr = "";
                          
                          // Cari titik untuk memisahkan tahun/versi (contoh: .2021)
                          const dotIndex = config.originalStr.lastIndexOf('.');
                          if (dotIndex !== -1) {
                            baseStr = config.originalStr.substring(0, dotIndex);
                            extensionStr = config.originalStr.substring(dotIndex);
                          }
                          
                          // Hapus _m_id atau _m_ja jika ada
                          baseStr = baseStr.replace(/_m_id$/, '').replace(/_m_ja$/, '');
                          
                          const englishStr = baseStr + extensionStr;
                          const indoStr = baseStr + '_m_id' + extensionStr;
                          const japanStr = baseStr + '_m_ja' + extensionStr;
                          
                          const targets = [];
                          if (config.originalStr !== englishStr) targets.push(englishStr);
                          if (config.originalStr !== indoStr) targets.push(indoStr);
                          if (config.originalStr !== japanStr) targets.push(japanStr);
                          
                          // Simpan original config jika ingin dipertahankan, tapi ini generate target baru
                          // Jika user upload 1 bnk, dia ingin mengubah ke bahasa lain (2 bahasa lain)
                          // Jadi kita ganti targetStr dari config asli ke target 1, dan buat duplikat untuk target 2
                          
                          if (targets.length > 0) {
                            newConfigs.push({
                              ...config,
                              targetStr: targets[0],
                              mode: 'rename'
                            });
                          }
                          if (targets.length > 1) {
                            newConfigs.push({
                              id: Math.random().toString(36).substring(2, 9),
                              file: config.file,
                              originalStr: config.originalStr,
                              targetStr: targets[1],
                              mode: 'rename'
                            });
                          }
                        } else {
                          newConfigs.push(config);
                        }
                      });
                      
                      setFileConfigs(newConfigs);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-fuchsia-400 py-2 px-3 rounded text-left transition-colors"
                  >
                    🎧 Generate Semua Bahasa Audio .bnk
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Gunakan tombol di atas untuk mengisi Target Keyword semua file secara otomatis.</p>
              </div>

              <div className="pt-4 border-t border-slate-800">
                <label htmlFor="watermark" className="block text-[13px] text-slate-300 mb-2">Watermark String</label>
                <input 
                  type="text" 
                  id="watermark" 
                  value={watermark}
                  onChange={e => setWatermark(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md py-2.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all mb-4" 
                  placeholder="e.g. MOD_VERSION_1" 
                  required 
                />

                <label className="flex items-center space-x-2 text-[13px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCompression}
                    onChange={(e) => setUseCompression(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-indigo-500 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500 focus:ring-offset-slate-900"
                  />
                  <span>Compress Output (LZ4)</span>
                </label>
                <p className="text-[10px] text-slate-500 mt-1 ml-6">
                  Uncheck to skip compression for faster processing, but larger file size.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <button 
              type="submit" 
              disabled={isLoading || fileConfigs.length === 0}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm line-clamp-1">{progressText || 'Processing...'}</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  {fileConfigs.length > 1 ? `Process ${fileConfigs.length} Files (ZIP)` : 'Process & Download'}
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Workspace */}
        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-6 bg-slate-950 lg:overflow-y-auto min-h-[500px]">
          {error && (
            <div className="rounded-md bg-red-900/30 p-4 border border-red-800 shrink-0">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-400">Processing Error</h3>
                  <div className="mt-1 text-sm text-red-300">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-[300px]">
            <div className="h-full flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
              <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                  </div>
                  <span className="text-xs font-mono text-slate-400 ml-2">bundle-processor-tty1</span>
                </div>
                <div className="flex items-center gap-2">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                      <span className="text-xs font-medium text-indigo-400">{progressText || 'Processing...'}</span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-slate-500">READY</span>
                  )}
                </div>
              </div>

              {!isLoading && fileConfigs.length > 0 && (
                <div className="bg-slate-900 border-b border-slate-800 px-4 py-2 flex justify-between items-center shrink-0">
                  <div className="text-xs text-slate-400">{fileConfigs.length} file(s) selected</div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors bg-slate-800 px-3 py-1.5 rounded-md"
                    >
                      + Add More
                    </button>
                    <button
                      type="button"
                      onClick={() => setFileConfigs([])}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors bg-slate-800 px-3 py-1.5 rounded-md"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}

              <input 
                ref={fileInputRef}
                type="file" 
                accept=".unity3d,.bundle,.bnk" 
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFilesSelect(Array.from(e.target.files));
                  }
                }}
                className="hidden" 
              />
              
              <div 
                className="flex-1 overflow-auto p-0 relative bg-black/40"
                onDragOver={!isLoading ? handleDragOver : undefined}
                onDragLeave={!isLoading ? handleDragLeave : undefined}
                onDrop={!isLoading ? handleDrop : undefined}
              >
                {fileConfigs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse"></div>
                        <pre className="font-mono text-indigo-400 text-sm leading-tight animate-pulse relative z-10 text-center font-bold">
{CAT_IDLE_FRAMES[asciiFrame % CAT_IDLE_FRAMES.length]}
                        </pre>
                      </div>
                      <div className="text-center">
                        <p className="text-slate-300 font-medium text-sm mt-2">Drag and drop files here</p>
                        <p className="text-slate-500 text-xs mt-1">Select multiple files at once. Max 50 files.</p>
                      </div>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-md border border-indigo-500/30 transition-colors font-mono text-xs">
                        [ BROWSE_FILES ]
                      </button>
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse font-mono text-xs min-w-[1000px]">
                    <thead className="bg-slate-900/80 backdrop-blur sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="py-3 px-4 text-slate-400 font-medium border-b border-slate-800 w-[20%]">File Name</th>
                        <th className="py-3 px-4 text-slate-400 font-medium border-b border-slate-800 w-[15%]">Action</th>
                        <th className="py-3 px-4 text-slate-400 font-medium border-b border-slate-800 w-[25%]">Original Keyword</th>
                        <th className="py-3 px-4 text-slate-400 font-medium border-b border-slate-800 w-[25%]">Target Keyword</th>
                        <th className="py-3 px-4 text-slate-400 font-medium border-b border-slate-800 w-[15%] text-right">{isLoading ? 'Status' : 'Manage'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {fileConfigs.map((config, idx) => {
                        let statusColor = "text-yellow-400";
                        let statusText = "PROCESSING";
                        let bgPulse = "animate-pulse";
                        
                        if (progressText?.includes("Downloading")) {
                          statusColor = "text-green-400";
                          statusText = "COMPLETED";
                          bgPulse = "";
                        } else if (progressText?.includes("Uploading") && idx > fileConfigs.length / 2) {
                          statusColor = "text-blue-400";
                          statusText = "UPLOADING";
                        }
                        
                        return (
                          <tr key={config.id} className="hover:bg-slate-800/20 transition-colors">
                            <td className="py-3 px-4 text-slate-300 font-medium truncate max-w-[150px]" title={config.file.name}>
                              {config.file.name}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 border border-slate-700
                                ${config.mode === 'rename' ? 'text-fuchsia-400' : config.mode === 'card' ? 'text-emerald-400' : config.mode === 'modifyEffect' ? 'text-purple-400' : 'text-indigo-400'}`}>
                                {config.mode === 'rename' ? 'RENAME_ONLY' : config.mode === 'card' ? 'CARD_ONLY' : config.mode === 'modifyEffect' ? 'MODIFY_EFFECT' : 'FULL_BUNDLE'}
                              </span>
                            </td>
                            <td className="py-2 px-4">
                              {isLoading ? (
                                <span className="text-slate-400 truncate max-w-[200px] block" title={config.originalStr}>{config.mode === 'modifyEffect' ? '[ SEMUA TARGET ]' : config.originalStr}</span>
                              ) : config.mode === 'modifyEffect' ? (
                                <span className="text-slate-500 text-xs italic">Auto-detect targets</span>
                              ) : (
                                <input 
                                  type="text" 
                                  value={config.originalStr}
                                  onChange={e => updateConfig(config.id, 'originalStr', e.target.value)}
                                  className="w-full min-w-[180px] bg-slate-900/50 border border-slate-700 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner placeholder-slate-600" 
                                  placeholder="Original keyword..."
                                />
                              )}
                            </td>
                            <td className="py-2 px-4">
                              {isLoading ? (
                                <span className="text-slate-400 flex items-center gap-2 truncate max-w-[200px]" title={config.targetStr}>
                                  <span className="text-slate-500 mr-1">→</span>
                                  {config.mode === 'colorChanger' && (
                                    <span className="w-3 h-3 rounded-full border border-slate-600" style={{ backgroundColor: config.targetStr }}></span>
                                  )}
                                  {config.targetStr}
                                </span>
                              ) : config.mode === 'modifyEffect' ? (
                                <div className="flex gap-2 w-full min-w-[250px]">
                                  {config.targetStr && (
                                    <div className="flex items-center gap-2 flex-1 bg-slate-900/50 border border-slate-700 rounded-md py-2 px-3 text-sm text-white">
                                      <span className="w-4 h-4 rounded border border-slate-600" style={{ backgroundColor: config.targetStr }}></span>
                                      {config.targetStr}
                                    </div>
                                  )}
                                  {config.targetScale && (
                                    <div className="flex items-center gap-2 flex-1 bg-slate-900/50 border border-slate-700 rounded-md py-2 px-3 text-sm text-white">
                                      <span className="text-cyan-400 font-mono">Scale: {config.targetScale}</span>
                                    </div>
                                  )}
                                  {!config.targetStr && !config.targetScale && (
                                    <span className="text-slate-500 text-xs italic">- No modifications set -</span>
                                  )}
                                </div>
                              ) : (
                                <input 
                                  type="text" 
                                  value={config.targetStr}
                                  onChange={e => updateConfig(config.id, 'targetStr', e.target.value)}
                                  className="w-full min-w-[180px] bg-slate-900/50 border border-slate-700 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner placeholder-slate-600"
                                  placeholder="Target keyword..." 
                                />
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isLoading ? (
                                <span className={`${statusColor} ${bgPulse} font-semibold tracking-wider`}>
                                  [{statusText}]
                                </span>
                              ) : (
                                <button 
                                  type="button" 
                                  onClick={() => removeFile(config.id)}
                                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-md transition-all shrink-0 inline-flex items-center justify-center"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                
                {isLoading && (
                  <div className="fixed inset-0 bg-transparent pointer-events-none z-[100] flex items-center justify-center">
                    <div className="bg-slate-900/90 border border-slate-700/50 rounded-2xl w-[90%] max-w-[400px] h-[180px] shadow-2xl relative overflow-hidden flex flex-col items-center justify-center">
                      <motion.div 
                        className="absolute flex flex-col items-center justify-center top-6 whitespace-nowrap min-w-max"
                        initial={{ left: '-50%' }}
                        animate={{ left: '150%' }}
                        transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                      >
                        <pre className="font-mono text-indigo-400 text-[10px] sm:text-xs leading-tight font-bold whitespace-pre drop-shadow-md w-max">
                          {TRAIN_FRAMES[asciiFrame % TRAIN_FRAMES.length]}
                        </pre>
                      </motion.div>
                      
                      <div className="absolute bottom-6 flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700/50 shadow-lg">
                        <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                        <span className="text-sm font-medium text-slate-200">
                          {progressText || 'Processing...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {isDragActive && !isLoading && (
                  <div className="absolute inset-0 bg-indigo-500/10 border-2 border-indigo-500/50 border-dashed z-20 backdrop-blur-sm flex items-center justify-center pointer-events-none overflow-hidden">
                    <motion.div 
                      className="bg-slate-900 px-8 py-6 rounded-xl shadow-2xl border border-indigo-500/30 flex flex-col items-center gap-4"
                      animate={{ x: [-20, 20, -20] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <div className="text-pink-400 font-mono whitespace-pre text-[10px] leading-tight font-bold -my-2">
                        {CAT_RUN_FRAMES[asciiFrame % CAT_RUN_FRAMES.length]}
                      </div>
                      <span className="text-lg font-medium text-slate-200 mt-2">Drop files to add</span>
                    </motion.div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Terminal / Progress Sidebar */}
        <aside className="w-full lg:w-[320px] xl:w-[400px] bg-black border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col shrink-0 lg:overflow-y-auto min-h-[300px]">
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
                <div className="w-3 h-3 rounded-full bg-slate-600/50"></div>
              </div>
              <span className="text-xs font-mono text-slate-400 ml-2">Terminal</span>
            </div>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <span className="text-[10px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded animate-pulse">RUNNING</span>
              ) : (
                <span className="text-[10px] font-medium text-slate-500 bg-slate-800 px-2 py-0.5 rounded">IDLE</span>
              )}
            </div>
          </div>
          <div className="flex-1 p-4 font-mono text-[10px] text-green-400 flex flex-col overflow-y-auto shadow-inner">
            <div className="mb-4 text-slate-500">
              BundlePort Studio CLI v1.0.0<br/>
              Ready for processing...
            </div>
            {logs.map((log, i) => (
              <div key={i} className="mb-0.5 opacity-90 hover:opacity-100">{log}</div>
            ))}
            {isLoading && <div className="animate-pulse text-indigo-500 mt-1">_</div>}
          </div>
        </aside>
      </form>

      {modalState.type && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
              <h3 className="font-semibold text-slate-200">
                {modalState.type === 'addSuffix' && 'Tambah Akhiran ke Semua File'}
                {modalState.type === 'removeSuffix' && 'Hapus Akhiran dari Semua File'}
                {modalState.type === 'replace' && 'Ganti Akhiran / Skin Spesifik'}
                {modalState.type === 'replaceCard' && 'Ganti Card Skin (Khusus AssetBundle & GameObject)'}
                {modalState.type === 'modifyEffect' && '🎨📏 Modifikasi Efek (Warna & Ukuran)'}
              </h3>
              <button 
                onClick={() => setModalState({ type: null })}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-4">
              {modalState.type === 'modifyEffect' ? (
                <>
                  <p className="text-xs text-slate-400 mb-2">
                    Fitur ini dapat mengubah warna efek (Texture/Particle/Material) dan juga mengubah ukuran/skala efek. Anda bisa mengisi salah satu saja, atau keduanya sekaligus.
                  </p>
                  
                  <div className="mb-4">
                    <label className="block text-sm text-slate-300 mb-1">1. Pilih Warna Target (Kosongkan jika tidak ingin ubah warna):</label>
                    <div className="flex gap-3 items-center">
                      <input 
                        type="color"
                        value={modalInput1.slice(0, 7) || '#000000'}
                        onChange={e => setModalInput1(e.target.value)}
                        className="w-12 h-10 bg-slate-800 border border-slate-700 rounded cursor-pointer"
                      />
                      <input 
                        autoFocus
                        type="text" 
                        value={modalInput1}
                        onChange={e => setModalInput1(e.target.value)}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded py-2 px-3 text-white font-mono focus:border-purple-500 outline-none"
                        placeholder="Contoh: #FF0000 atau kosongkan"
                      />
                      <button 
                        onClick={() => setModalInput1('')}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-2 rounded"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-slate-300 mb-1">2. Ukuran Skala Baru (Kosongkan jika tidak ingin ubah ukuran):</label>
                    <div className="flex gap-3 items-center">
                      <input 
                        type="number" 
                        step="0.1"
                        value={modalInput2}
                        onChange={e => setModalInput2(e.target.value)}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded py-2 px-3 text-white focus:border-cyan-500 outline-none"
                        placeholder="Contoh: 1.2 atau kosongkan"
                      />
                      <button 
                        onClick={() => setModalInput2('')}
                        className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-2 rounded"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </>
              ) : (modalState.type === 'replace' || modalState.type === 'replaceCard') ? (
                <>
                  <p className="text-xs text-slate-400 mb-2">
                    {modalState.type === 'replace' 
                      ? 'Fitur ini berguna untuk memindahkan antar skin secara massal dengan mengganti bagian teks tertentu pada Original Keyword. (Contoh: Find "_skin02_add", Replace "_skin04_add")'
                      : 'Fitur ini akan mengubah teks hanya pada file AssetBundle dan GameObject di dalam bundle (contoh untuk Card MLBB). Contoh: Find "Hero451_add", Replace "Hero452_add"'}
                  </p>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Kata/Akhiran lama yang ingin diganti (Find):</label>
                    <input 
                      autoFocus
                      type="text" 
                      value={modalInput1}
                      onChange={e => setModalInput1(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded py-2 px-3 text-white focus:border-indigo-500 outline-none"
                      placeholder="e.g. _skin02_add"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Menjadi (Replace):</label>
                    <input 
                      type="text" 
                      value={modalInput2}
                      onChange={e => setModalInput2(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded py-2 px-3 text-white focus:border-indigo-500 outline-none"
                      placeholder="e.g. _skin04_add"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    {modalState.type === 'addSuffix' ? 'Akhiran (Suffix) yang ditambahkan:' : 'Akhiran (Suffix) yang dihapus:'}
                  </label>
                  <input 
                    autoFocus
                    type="text" 
                    value={modalInput1}
                    onChange={e => setModalInput1(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded py-2 px-3 text-white focus:border-indigo-500 outline-none"
                    placeholder={modalState.type === 'addSuffix' ? 'e.g. _skin02' : 'e.g. _skin03_add'}
                  />
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-800/30 flex justify-end gap-3">
              <button
                onClick={() => setModalState({ type: null })}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  if (modalState.type === 'addSuffix' && modalInput1) {
                    setFileConfigs(prev => prev.map(c => ({
                      ...c,
                      targetStr: c.originalStr + modalInput1
                    })));
                  } else if (modalState.type === 'removeSuffix' && modalInput1) {
                    setFileConfigs(prev => prev.map(c => ({
                      ...c,
                      targetStr: c.originalStr.replace(modalInput1, '')
                    })));
                  } else if (modalState.type === 'replace' && modalInput1) {
                    const escaped = modalInput1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    setFileConfigs(prev => prev.map(c => ({
                      ...c,
                      targetStr: c.originalStr.replace(new RegExp(escaped, 'g'), modalInput2),
                      mode: 'all'
                    })));
                  } else if (modalState.type === 'replaceCard' && modalInput1) {
                    const escaped = modalInput1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    setFileConfigs(prev => prev.map(c => ({
                      ...c,
                      targetStr: c.originalStr.replace(new RegExp(escaped, 'g'), modalInput2),
                      mode: 'card'
                    })));
                  } else if (modalState.type === 'modifyEffect') {
                    if (!modalInput1 && !modalInput2) {
                      showNotification("Pilih minimal satu: Warna atau Ukuran!");
                      return;
                    }
                    setFileConfigs(prev => prev.map(c => ({
                      ...c,
                      targetStr: modalInput1,
                      targetScale: modalInput2,
                      mode: 'modifyEffect'
                    })));
                  }
                  setModalState({ type: null });
                }}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
              >
                Terapkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASCII Notification Popup */}
      <AnimatePresence>
        {notification.show && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9, x: '-50%' }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: -50, scale: 0.9, x: '-50%' }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed top-12 left-1/2 z-50 origin-top pointer-events-auto"
          >
            <div className="bg-slate-800 border-2 border-slate-600 rounded-lg shadow-2xl p-4 flex items-center gap-4 text-slate-200">
              <div className="text-emerald-400 font-mono whitespace-pre text-[10px] leading-tight font-bold -my-2">
                {UFO_FRAMES[asciiFrame % UFO_FRAMES.length]}
              </div>
              <div className="flex flex-col gap-1 min-w-[200px]">
                <span className="font-bold text-sm text-emerald-400">Pemberitahuan</span>
                <span className="text-xs text-slate-300">{notification.message}</span>
              </div>
              <button 
                onClick={() => setNotification(prev => ({ ...prev, show: false }))}
                className="ml-2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="bg-slate-900 border-t border-slate-800 py-3 flex flex-col items-center justify-center text-center shrink-0">
        <p className="text-slate-400 text-xs font-medium tracking-wide">Powered by XIRORO</p>
        <p className="text-slate-500 text-[10px] mt-0.5">&copy; 2026 Xiroro Script. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
