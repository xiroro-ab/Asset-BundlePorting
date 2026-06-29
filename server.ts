import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { execFile, execSync, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

// --- Setup Persistent Temp Dir (Avoid tmpfs RAM exhaustion) ---
const TMP_DIR = path.join(process.cwd(), 'node_modules', '.tmp_uploads');
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// --- Cleanup Routines ---
const cleanupTmpDir = () => {
  try {
    const files = fs.readdirSync(TMP_DIR);
    const now = Date.now();
    for (const file of files) {
      if (file.startsWith('upload_') || file.startsWith('output_') || file.match(/^[0-9a-f]+$/)) {
        const filePath = path.join(TMP_DIR, file);
        try {
          const stats = fs.statSync(filePath);
          // Delete files older than 30 minutes
          if (now - stats.mtimeMs > 30 * 60 * 1000) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {}
      }
    }
  } catch (err) {}
};

// Run cleanup on boot (clean everything old)
try {
  const files = fs.readdirSync(TMP_DIR);
  for (const file of files) {
    if (file.startsWith('upload_') || file.startsWith('output_') || file.match(/^[0-9a-f]+$/)) {
      try { fs.unlinkSync(path.join(TMP_DIR, file)); } catch (e) {}
    }
  }
} catch (e) {}

// Run cleanup periodically
setInterval(cleanupTmpDir, 10 * 60 * 1000);
// -----------------------

// Ensure Python environment is setup for UnityPy
let isPythonSetup = false;
let pythonSetupError = '';

async function setupPythonEnvironment() {
  try {
    console.log("Setting up Python environment...");
    try {
      await new Promise<void>((resolve, reject) => {
        exec('./.venv/bin/python3 -c "import UnityPy"', (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      console.log("UnityPy is already installed.");
      isPythonSetup = true;
    } catch (e) {
      console.log("Installing UnityPy...");
      
      const runCommand = (cmd: string): Promise<void> => {
        return new Promise((resolve, reject) => {
          exec(cmd, (error, stdout, stderr) => {
            if (error) {
              console.error(`Command failed: ${cmd}`, stderr);
              reject(error);
            } else {
              resolve();
            }
          });
        });
      };

      await runCommand('python3 -m venv .venv');
      await runCommand('curl -sS https://bootstrap.pypa.io/get-pip.py | ./.venv/bin/python3');
      await runCommand('./.venv/bin/python3 -m pip install unitypy pillow');
      console.log("UnityPy installed successfully.");
      isPythonSetup = true;
    }
  } catch (e: any) {
    console.error("Failed to setup Python environment:", e.message);
    pythonSetupError = e.message;
  }
}

// Start setup asynchronously, don't block boot
setupPythonEnvironment();

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Configure multer for file uploads (used for chunks)
const upload = multer({ 
  dest: TMP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit per chunk
});

// @ts-expect-error archiver has no default export in types but works at runtime
import archiver from 'archiver';

// --- Job Queue for Long-Running Tasks ---
interface Job {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  total: number;
  resultPath?: string;
  resultName?: string;
  error?: string;
}
const jobs = new Map<string, Job>();

// API Routes
app.post('/api/process-batch', upload.array('files'), async (req, res) => {
  if (!isPythonSetup) {
    return res.status(503).json({ detail: 'Server is still initializing the Python environment. Please try again in a few seconds.' + (pythonSetupError ? ' Error: ' + pythonSetupError : '') });
  }

  const { watermark, configs, useCompression } = req.body;
  const files = req.files as Express.Multer.File[];

  if (!watermark || !configs || !files || files.length === 0) {
    files?.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(400).json({ detail: 'Missing parameters or files.' });
  }

  let parsedConfigs;
  try {
    parsedConfigs = JSON.parse(configs);
  } catch (e) {
    files.forEach(f => fs.unlink(f.path, () => {}));
    return res.status(400).json({ detail: 'Invalid configs format.' });
  }

  const jobId = Date.now().toString() + '_' + Math.random().toString(36).substring(7);
  jobs.set(jobId, { id: jobId, status: 'pending', progress: 0, total: parsedConfigs.length });
  
  // Start background processing
  processJob(jobId, parsedConfigs, files, watermark, useCompression).catch(e => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = e.message;
    }
  });

  res.json({ jobId });
});

app.get('/api/job-status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ detail: 'Job not found' });
  res.json(job);
});

app.get('/api/job-download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.status !== 'completed' || !job.resultPath) {
    return res.status(400).json({ detail: 'Not ready' });
  }
  res.download(job.resultPath, job.resultName || 'processed.zip', () => {
    // We could clean up here, but the global cleanupTmpDir will catch it eventually
  });
});

async function processJob(jobId: string, parsedConfigs: any[], files: Express.Multer.File[], watermark: string, useCompression: string) {
  const job = jobs.get(jobId)!;
  job.status = 'processing';
  
  const pythonScript = path.join(process.cwd(), 'src', 'process_bundle.py');
  const outputFiles: string[] = [];
  const errors: string[] = [];

  const processOneFile = (file: Express.Multer.File, config: any): Promise<{ outputPath?: string, targetName?: string }> => {
    return new Promise((resolve) => {
      const inputPath = file.path;
      const fileId = Date.now().toString() + '_' + Math.random().toString(36).substring(7);
      const outputPath = path.join(TMP_DIR, `output_${fileId}.unity3d`);
      
      const args = [
        pythonScript,
        inputPath,
        outputPath,
        config.originalStr || '',
        config.targetStr || '',
        watermark || '',
        config.mode || 'all',
        useCompression === 'true' ? '1' : '0',
        config.targetScale || ''
      ];

      execFile('./.venv/bin/python3', args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error || !fs.existsSync(outputPath)) {
          errors.push(`Error processing ${file.originalname}: ${stderr || error?.message || 'Output missing'}`);
          resolve({});
          return;
        }

        let newName = file.originalname;
        if (config.mode === 'modifyEffect') {
            newName = file.originalname;
        } else {
            const escapedOriginal = config.originalStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(escapedOriginal, 'gi');
            if (newName.match(re)) {
                newName = newName.replace(re, config.targetStr.replace(/\$/g, '$$$$'));
            } else {
                newName = `${config.targetStr}_${newName}`;
            }
        }

        outputFiles.push(outputPath);
        resolve({ outputPath, targetName: newName });
      });
    });
  };

  try {
    if (parsedConfigs.length === 1) {
      const file = files.find(f => f.originalname === parsedConfigs[0].originalname) || files[0];
      const { outputPath, targetName } = await processOneFile(file, parsedConfigs[0]);
      if (outputPath) {
        job.resultPath = outputPath;
        job.resultName = targetName || file.originalname;
        job.status = 'completed';
        job.progress = 1;
      } else {
        job.status = 'error';
        job.error = 'Failed to process file. ' + errors.join('; ');
      }
      return;
    }

    // Multiple files - build ZIP
    const zipPath = path.join(TMP_DIR, `output_${jobId}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise<void>(async (resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', (err: any) => reject(err));
      archive.pipe(output);

      for (let i = 0; i < parsedConfigs.length; i++) {
        const config = parsedConfigs[i];
        const file = files.find((f: any) => f.originalname === config.originalname);
        if (!file) {
           job.progress++;
           continue;
        }

        const { outputPath, targetName } = await processOneFile(file, config);
        if (outputPath) {
          archive.file(outputPath, { name: targetName });
        }
        job.progress++;
      }

      if (errors.length > 0) {
        archive.append(errors.join('\n'), { name: 'errors.txt' });
      }

      archive.finalize();
    });

    job.resultPath = zipPath;
    job.resultName = 'processed_bundles.zip';
    job.status = 'completed';
  } catch (err: any) {
    job.status = 'error';
    job.error = err.message || 'Unknown error during archiving';
  } finally {
    // Cleanup input files
    files.forEach(f => fs.unlink(f.path, () => {}));
    // We intentionally don't cleanup outputFiles immediately because they are inside the ZIP or returned directly.
    // The periodic tmp cleaner will delete them after 30 minutes.
  }
}

async function startServer() {
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
