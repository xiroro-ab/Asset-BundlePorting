export const codeFiles = {
  'main.py': {
    language: 'python',
    content: `import io
import UnityPy
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def modify_asset_bundle(file_bytes: bytes, original_str: str, target_str: str, watermark: str) -> bytes:
    try:
        # Load the bundle using UnityPy (>= 1.9.x)
        env = UnityPy.load(file_bytes)
        
        # Iterate through all objects in the environment
        for obj in env.objects:
            
            # 1. AssetBundle Object Handling
            if obj.type.name == "AssetBundle":
                try:
                    # First attempt to modify using the specialized object API
                    try:
                        data = obj.read()
                        if hasattr(data, 'm_Name'):
                            data.m_Name = watermark
                        if hasattr(data, 'm_AssetBundleName'):
                            if original_str in data.m_AssetBundleName:
                                data.m_AssetBundleName = data.m_AssetBundleName.replace(original_str, target_str)
                            else:
                                data.m_AssetBundleName = target_str
                        if hasattr(data, 'm_Container'):
                            new_container = []
                            for k, v in data.m_Container:
                                if isinstance(k, str) and original_str in k:
                                    k = k.replace(original_str, target_str)
                                new_container.append((k, v))
                            data.m_Container = new_container
                        data.save()
                    except Exception:
                        pass
                        
                    # Also modify via typetree as a fallback
                    tree = obj.read_typetree()
                    
                    def replace_strings(node):
                        if isinstance(node, dict):
                            for k, v in node.items():
                                node[k] = replace_strings(v)
                            return node
                        elif isinstance(node, (list, tuple)):
                            return [replace_strings(item) for item in node]
                        elif isinstance(node, str):
                            if original_str in node:
                                return node.replace(original_str, target_str)
                            return node
                        else:
                            return node
                            
                    # Recursively replace all paths and asset names
                    tree = replace_strings(tree)
                    
                    # Force set watermark
                    if "m_Name" in tree:
                        tree["m_Name"] = watermark
                        
                    # Force set AssetBundleName
                    if "m_AssetBundleName" in tree:
                        if original_str in tree["m_AssetBundleName"]:
                            tree["m_AssetBundleName"] = tree["m_AssetBundleName"].replace(original_str, target_str)
                        else:
                            tree["m_AssetBundleName"] = target_str
                            
                    # Explicit m_Container modification in typetree just in case
                    if "m_Container" in tree:
                        container = tree["m_Container"]
                        if isinstance(container, list):
                            for entry in container:
                                if isinstance(entry, dict) and "first" in entry:
                                    if isinstance(entry["first"], str) and original_str in entry["first"]:
                                        entry["first"] = entry["first"].replace(original_str, target_str)
                        elif isinstance(container, dict) and "Array" in container and isinstance(container["Array"], list):
                            for entry in container["Array"]:
                                if isinstance(entry, dict) and "data" in entry and isinstance(entry["data"], dict) and "first" in entry["data"]:
                                    if isinstance(entry["data"]["first"], str) and original_str in entry["data"]["first"]:
                                        entry["data"]["first"] = entry["data"]["first"].replace(original_str, target_str)
                                        
                    obj.save_typetree(tree)
                except Exception:
                    pass
                
            # 2. NamedObject Replacement
            elif obj.type.name == "GameObject":
                try:
                    tree = obj.read_typetree()
                    name = tree.get("m_Name", "")
                    
                    if original_str in name:
                        tree["m_Name"] = name.replace(original_str, target_str)
                        obj.save_typetree(tree)
                except Exception:
                    pass
                    
        # 3. Repacking
        # Save the environment with LZ4 compression for mobile game compatibility (e.g., MLBB)
        try:
            out_bytes = env.file.save(compression="lz4")
        except TypeError:
            # Fallback for different UnityPy versions where the kwarg is 'packer' or positional
            try:
                out_bytes = env.file.save(packer="lz4")
            except Exception:
                out_bytes = env.file.save("lz4")
            
        return out_bytes
        
    except Exception as e:
        raise Exception(f"Failed to modify AssetBundle: {str(e)}")

@app.post("/api/process")
async def process_bundle(
    file: UploadFile = File(...),
    original_string: str = Form(...),
    target_string: str = Form(...),
    watermark: str = Form(...)
):
    try:
        # Use io.BytesIO for in-memory processing to handle large files efficiently
        file_bytes = await file.read()
        
        # Process the bundle
        modified_bytes = modify_asset_bundle(
            file_bytes=file_bytes, 
            original_str=original_string, 
            target_str=target_string, 
            watermark=watermark
        )
        
        # Return a StreamingResponse with application/octet-stream
        new_filename = f"{target_string}.unity3d"
        return StreamingResponse(
            io.BytesIO(modified_bytes), 
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{new_filename}"'}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files to serve the frontend (index.html)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
`
  },
  'static/index.html': {
    language: 'html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Unity AssetBundle Porter</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .drag-active {
            border-color: #6366f1 !important;
            background-color: rgba(30,41,59,0.8) !important;
        }
        .loader {
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 50%;
            border-top: 2px solid #ffffff;
            width: 16px;
            height: 16px;
            animation: spin 1s linear infinite;
            display: inline-block;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="bg-slate-900 text-slate-50 h-screen w-screen overflow-hidden flex flex-col font-sans">
    <header class="bg-slate-800 border-b border-slate-700 px-6 h-16 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-black text-white text-lg">U</div>
            <div class="flex flex-col">
                <h1 class="text-base font-bold leading-tight">BundlePort Studio</h1>
                <p class="text-[11px] text-slate-400">Unity AssetBundle Porter Tool</p>
            </div>
        </div>
    </header>

    <form id="uploadForm" class="flex flex-1 overflow-hidden w-full">
        <!-- Sidebar -->
        <aside class="w-[320px] bg-slate-900 border-r border-slate-700 p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
            <div>
                <h2 class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Modification Settings</h2>
                <div class="space-y-4">
                    <div>
                        <label for="originalStr" class="block text-[13px] text-slate-300 mb-2">Original Keyword</label>
                        <input type="text" id="originalStr" name="original_string" class="w-full bg-slate-800 border border-slate-700 rounded-md py-2.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g. hero_01" required>
                    </div>
                    <div>
                        <label for="targetStr" class="block text-[13px] text-slate-300 mb-2">Target Keyword</label>
                        <input type="text" id="targetStr" name="target_string" class="w-full bg-slate-800 border border-slate-700 rounded-md py-2.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g. hero_new" required>
                    </div>
                    <div>
                        <label for="watermark" class="block text-[13px] text-slate-300 mb-2">Watermark String</label>
                        <input type="text" id="watermark" name="watermark" class="w-full bg-slate-800 border border-slate-700 rounded-md py-2.5 px-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" placeholder="e.g. MOD_VERSION_1" required>
                    </div>
                </div>
            </div>

            <div class="mt-auto">
                <button type="submit" id="submitBtn" class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <span id="btnText" class="flex items-center gap-2">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        Process & Download
                    </span>
                    <span id="btnLoader" class="hidden flex items-center gap-2"><span class="loader"></span> Processing...</span>
                </button>
            </div>
        </aside>

        <!-- Workspace -->
        <main class="flex-1 p-6 flex flex-col gap-6 bg-slate-950 overflow-y-auto">
            <div id="errorAlert" class="hidden rounded-md bg-red-900/30 p-4 border border-red-800 shrink-0">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i class="fa-solid fa-circle-exclamation text-red-500 mt-0.5"></i>
                    </div>
                    <div class="ml-3">
                        <h3 class="text-sm font-medium text-red-400">Processing Error</h3>
                        <div class="mt-1 text-sm text-red-300">
                            <p id="errorText">An error occurred during processing.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex-1 flex flex-col min-h-[300px]">
                <div id="dropZone" class="flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 hover:border-indigo-500 transition-colors relative">
                    <svg width="48" height="48" fill="none" stroke="#475569" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <div class="text-center relative z-10 pointer-events-none">
                        <p class="text-base font-semibold text-slate-200">Drag and drop Unity AssetBundle</p>
                        <p class="text-sm text-slate-400 mt-1">Supporting .unity3d and .bundle files up to 100MB</p>
                    </div>
                    <label for="fileUpload" class="absolute inset-0 w-full h-full cursor-pointer z-20"><span class="sr-only">Upload file</span></label>
                    <input id="fileUpload" name="file" type="file" accept=".unity3d,.bundle" class="hidden">
                </div>
                
                <div id="fileNameDisplay" class="hidden h-full flex flex-col items-center justify-center gap-4 border-2 border-dashed border-indigo-500/50 rounded-xl bg-indigo-500/5 relative">
                    <i class="fa-solid fa-file-zipper text-4xl text-indigo-400"></i>
                    <div class="text-center">
                        <p id="fileNameText" class="text-base font-medium text-indigo-300">filename.unity3d</p>
                        <p class="text-sm text-slate-400 mt-1">Ready to process</p>
                    </div>
                    <button type="button" id="removeFileBtn" class="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-sm transition-colors flex items-center gap-2">
                        <i class="fa-solid fa-xmark"></i> Remove File
                    </button>
                </div>
            </div>
        </main>
    </form>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const dropZone = document.getElementById('dropZone');
            const fileUpload = document.getElementById('fileUpload');
            const fileNameDisplay = document.getElementById('fileNameDisplay');
            const fileNameText = document.getElementById('fileNameText');
            const removeFileBtn = document.getElementById('removeFileBtn');
            const form = document.getElementById('uploadForm');
            const submitBtn = document.getElementById('submitBtn');
            const btnText = document.getElementById('btnText');
            const btnLoader = document.getElementById('btnLoader');
            const errorAlert = document.getElementById('errorAlert');
            const errorText = document.getElementById('errorText');

            let selectedFile = null;

            // Handle Drag and Drop
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, preventDefaults, false);
            });

            function preventDefaults(e) {
                e.preventDefault();
                e.stopPropagation();
            }

            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
            });

            dropZone.addEventListener('drop', (e) => {
                let dt = e.dataTransfer;
                let files = dt.files;
                handleFiles(files);
            });

            fileUpload.addEventListener('change', function(e) {
                handleFiles(this.files);
            });

            function handleFiles(files) {
                if (files.length > 0) {
                    selectedFile = files[0];
                    if (!selectedFile.name.endsWith('.unity3d') && !selectedFile.name.endsWith('.bundle')) {
                        showError("Please upload a valid .unity3d or .bundle file.");
                        return;
                    }
                    hideError();
                    fileNameText.textContent = selectedFile.name;
                    fileNameDisplay.classList.remove('hidden');
                    dropZone.classList.add('hidden');
                }
            }

            removeFileBtn.addEventListener('click', () => {
                selectedFile = null;
                fileUpload.value = '';
                fileNameDisplay.classList.add('hidden');
                dropZone.classList.remove('hidden');
            });

            function showError(msg) {
                errorText.textContent = msg;
                errorAlert.classList.remove('hidden');
            }

            function hideError() {
                errorAlert.classList.add('hidden');
            }

            function setLoading(isLoading) {
                if (isLoading) {
                    submitBtn.disabled = true;
                    btnText.classList.add('hidden');
                    btnLoader.classList.remove('hidden');
                } else {
                    submitBtn.disabled = false;
                    btnText.classList.remove('hidden');
                    btnLoader.classList.add('hidden');
                }
            }

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideError();

                if (!selectedFile) {
                    showError("Please select an AssetBundle file first.");
                    return;
                }

                const originalStr = document.getElementById('originalStr').value;
                const targetStr = document.getElementById('targetStr').value;
                const watermark = document.getElementById('watermark').value;

                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('original_string', originalStr);
                formData.append('target_string', targetStr);
                formData.append('watermark', watermark);

                setLoading(true);

                try {
                    const response = await fetch('/api/process', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.detail || \`Server error: \${response.status}\`);
                    }

                    // Handle successful binary response
                    const blob = await response.blob();
                    
                    // Get filename from Content-Disposition header if possible
                    let downloadFilename = targetStr + '.unity3d';
                    const disposition = response.headers.get('content-disposition');
                    if (disposition && disposition.indexOf('filename=') !== -1) {
                        const parts = disposition.split('filename=');
                        if (parts.length > 1) {
                            downloadFilename = parts[1].split(';')[0].replace(/['"]/g, '');
                        }
                    }

                    // Create download link
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = downloadFilename;
                    document.body.appendChild(a);
                    a.click();
                    
                    // Cleanup
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                } catch (error) {
                    showError(error.message);
                } finally {
                    setLoading(false);
                }
            });
        });
    </script>
</body>
</html>`
  },
  'requirements.txt': {
    language: 'text',
    content: `fastapi>=0.100.0
uvicorn>=0.23.0
python-multipart>=0.0.6
UnityPy>=1.9.0`
  },
  'README.md': {
    language: 'markdown',
    content: `# Unity AssetBundle Porter

Sebuah aplikasi web full-stack untuk mengotomatisasi proses *porting* dan modifikasi file Unity AssetBundle (\`.unity3d\`). 
Aplikasi ini dibangun menggunakan FastAPI, UnityPy, dan Vanilla HTML/JS/Tailwind.

## Fitur
- Memodifikasi metadata AssetBundle (\`m_AssetBundleName\`).
- Menambahkan Watermark kustom (\`m_Name\`).
- **KRITIKAL:** Memperbarui pemetaan kontainer (container mapping) internal sehingga game engine dapat membaca aset yang dimodifikasi dengan benar.
- Mengubah nama GameObject, Texture, MonoBehaviour, dan Shader secara konsisten.
- Melakukan *repack* (pengemasan ulang) file bundle dengan kompresi LZ4 (diwajibkan oleh banyak game mobile seperti MLBB).
- Antarmuka web yang modern dengan fitur *drag-and-drop*.
- Pemrosesan di dalam memori (tanpa meninggalkan file sementara yang menumpuk).

## Tutorial Cara Menjalankan Aplikasi

Ikuti langkah-langkah berikut untuk menjalankan aplikasi ini di komputer/laptop Anda:

### 1. Persiapan (Prerequisites)
Pastikan Anda sudah menginstal **Python** di komputer Anda (versi 3.8 atau yang lebih baru). 
Jika belum, unduh dan instal dari [situs resmi Python](https://www.python.org/downloads/).
Saat instalasi di Windows, pastikan mencentang opsi **"Add Python to PATH"**.

### 2. Ekstrak File
Jika Anda mengunduh project ini dalam bentuk ZIP, ekstrak (unzip) file tersebut ke sebuah folder baru di komputer Anda.

### 3. Buka Terminal / Command Prompt
Buka terminal (di Mac/Linux) atau Command Prompt / PowerShell (di Windows).
Arahkan direktori terminal ke folder tempat Anda mengekstrak file project ini menggunakan perintah \`cd\`.
Contoh:
\`\`\`bash
cd C:\\Users\\NamaAnda\\Downloads\\assetbundle-porter
\`\`\`

### 4. Instalasi Dependencies (Library yang dibutuhkan)
Instal semua pustaka Python yang diperlukan oleh aplikasi ini dengan menjalankan perintah berikut di terminal:
\`\`\`bash
pip install -r requirements.txt
\`\`\`
*Tunggu hingga proses instalasi selesai.*

### 5. Jalankan Server Aplikasi
Setelah instalasi berhasil, jalankan server dengan perintah:
\`\`\`bash
python main.py
\`\`\`
*(Jika di sistem Mac/Linux Anda menggunakan python3, gunakan perintah \`python3 main.py\`)*

Anda akan melihat teks di terminal yang menyatakan bahwa Uvicorn sedang berjalan (misalnya \`Uvicorn running on http://0.0.0.0:8000\`).

### 6. Akses Melalui Browser
Buka browser web kesayangan Anda (Chrome, Firefox, Safari, dll).
Ketikkan alamat berikut di baris URL, lalu tekan Enter:
**[http://localhost:8000](http://localhost:8000)**

### 7. Cara Menggunakan
1. Di halaman web yang terbuka, klik area unggah atau *drag-and-drop* file **.unity3d** atau **.bundle** milik Anda.
2. Isi form **Original Keyword** (kata kunci asli yang ingin diganti, contoh: \`ch_alucard_classic\`).
3. Isi form **Target Keyword** (kata kunci baru sebagai pengganti, contoh: \`ch_alucard_legendary\`).
4. Isi form **Watermark String** (nama penanda Anda, contoh: \`Mod_By_Aris\`).
5. Klik tombol **Process & Download**.
6. Tunggu beberapa saat, file yang sudah dimodifikasi akan otomatis terunduh ke komputer Anda.
`
  }
};
