
import { useEffect, useRef, useState } from 'react';
import { Upload, ClipboardPaste, ImagePlus, Trash2, X, StickyNote } from 'lucide-react';
import { ImageComposer } from './ImageComposer';

type LayoutType = 'grid' | 'packed' | 'masonry' | 'single-column' | 'single-row';

interface ImageItem {
  id: string;
  src: string;
  file?: File;
  label?: string;
  description?: string;
  width?: number;
  height?: number;
}


function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [normalizeSize, setNormalizeSize] = useState(true);
  const [layout, setLayout] = useState<LayoutType>('grid');
  const [spacing, setSpacing] = useState(20); // 0-100, default 20
  const [fit, setFit] = useState(false); // new fit option
  const [bgColor, setBgColor] = useState<string>('transparent');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);

  // Read files and add to state
  const handleFiles = (files: File[]) => {
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages(prev => [
          ...prev,
          {
            id: Math.random().toString(36).slice(2),
            src: e.target?.result as string,
            file,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    handleFiles(Array.from(files));
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // Trigger browser paste dialog if possible, else focus drop area
  const handlePasteButton = () => {
    // Try to use the async clipboard API if available
    if (navigator.clipboard && navigator.clipboard.read) {
      // This will prompt the browser's paste dialog
      navigator.clipboard.read().then(() => { }).catch(() => {
        // fallback: focus drop area
        dropAreaRef.current?.focus();
      });
    } else {
      // fallback: focus drop area
      dropAreaRef.current?.focus();
      // Optionally, try to execCommand (deprecated, but may work)
      try {
        document.execCommand('paste');
      } catch {
        alert('Paste command not supported');
      }
    }
  };

  // Remove all images
  const handleClear = () => setImages([]);

  // Trigger file input
  const handleBrowse = () => fileInputRef.current?.click();

  // Global paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Notes toggle state for each image
  const [notesOpen, setNotesOpen] = useState<{ [id: string]: boolean }>({});
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [scale, setScale] = useState(100);

  // Responsive layout: column on small, row on large screens
  // Use CSS flexbox for layout
  return (
    <div className="w-full min-h-screen pt-20 px-2 bg-neutral-900 text-white text-center">
      <header className="fixed top-0 left-0 w-full h-14 bg-neutral-900/95 text-white flex items-center z-50 border-b border-neutral-800 shadow-md px-8">
        <span className="flex items-center gap-2 font-bold text-xl select-none">
          <ImagePlus size={24} className="text-indigo-400 -mb-1" />
          Image Composer
        </span>
      </header>
      <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          <div
            ref={dropAreaRef}
            tabIndex={0}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            aria-label="Image drop and preview area"
            className={`transition-all border ${isDragOver ? 'border-2 border-indigo-400 outline outline-2 outline-indigo-300 shadow-lg bg-gradient-to-r from-indigo-950 to-indigo-900' : 'border-dashed border-neutral-700'} rounded-xl min-h-[180px] flex flex-col justify-start relative mb-2`}
          >
            {images.length === 0 && (
              <div className="py-10 px-4 text-center text-white border-b border-neutral-800 rounded-t-xl font-medium">
                <Upload size={32} className="text-neutral-400 mb-2 mx-auto" />
                <div className="font-semibold text-lg mb-1">Drag & drop images here</div>
                <div className="text-neutral-400 text-base mb-1">
                  or <button type="button" onClick={handleBrowse} className="text-indigo-400 font-semibold inline-flex items-center hover:underline"><ImagePlus size={18} className="mr-1" />Browse</button>
                  <span className="mx-2">|</span>
                  <button type="button" onClick={handlePasteButton} className="text-indigo-400 font-semibold inline-flex items-center hover:underline"><ClipboardPaste size={18} className="mr-1" />Paste</button>
                </div>
                <div className="text-neutral-400 text-sm mt-1">(You can also use <kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd> to paste images)</div>
              </div>
            )}
            <input type="file" accept="image/*" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            {images.length > 0 && (
              <>
                <div className="border-t border-neutral-800 mt-0" />
                <div className="flex flex-row items-center justify-between px-4 pt-2">
                  <div className="text-neutral-300 font-semibold text-base flex items-center gap-3">
                    <span>{images.length} image{images.length > 1 ? 's' : ''}</span>
                    <span className="text-neutral-400 font-normal text-sm ml-2 flex items-center gap-2">
                      Drag,
                      <button type="button" onClick={handlePasteButton} className="text-indigo-400 font-semibold underline hover:text-indigo-300 px-0" title="Paste images (Ctrl+V/Cmd+V)">Paste</button>
                      or
                      <button type="button" onClick={handleBrowse} className="text-indigo-400 font-semibold underline hover:text-indigo-300 px-0" title="Browse for more images">add more</button>
                    </span>
                  </div>
                  <button onClick={handleClear} disabled={images.length === 0} className="bg-neutral-900 text-red-500 font-semibold flex items-center px-3 py-1.5 rounded-md shadow-sm border border-neutral-800 hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"><Trash2 size={18} className="mr-1" />Clear</button>
                </div>
                <div className="flex flex-row items-end gap-2 overflow-x-auto px-4 py-2 min-h-[100px]">
                  {images.map((img, idx) => {
                    const hasNotes = !!img.label || !!img.description;
                    return (
                      <div key={img.id} className="relative mb-1 min-w-[110px] max-w-[140px] flex flex-col items-center bg-neutral-800 rounded-lg shadow-md p-2">
                        <img src={img.src} alt={img.label || `Image ${idx + 1}`} className="w-[90px] h-[90px] object-cover rounded-md mb-1 bg-neutral-900" />
                        <div className="flex flex-row items-center gap-1 w-full justify-center">
                          <button className="image-delete-btn" title="Delete image" onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}><X size={18} /></button>
                          <button className="ml-1 image-notes-btn text-neutral-400" title="Show/hide notes" onClick={() => setNotesOpen(prev => ({ ...prev, [img.id]: !prev[img.id] }))}><StickyNote size={18} />{hasNotes && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}</button>
                        </div>
                        {notesOpen[img.id] && (
                          <div className="mt-2 w-full">
                            <input type="text" placeholder="Label" value={img.label || ''} onChange={e => { const newLabel = e.target.value; setImages(prev => prev.map((im, i) => i === idx ? { ...im, label: newLabel } : im)); }} className="image-label-input w-full mb-1 rounded border border-neutral-700 bg-neutral-900 text-white px-2 py-1 text-sm" />
                            <textarea placeholder="Description" value={img.description || ''} onChange={e => { const newDesc = e.target.value; setImages(prev => prev.map((im, i) => i === idx ? { ...im, description: newDesc } : im)); }} className="image-desc-input w-full resize-y min-h-[32px] rounded border border-neutral-700 bg-neutral-900 text-white px-2 py-1 text-sm" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {images.length > 0 && (
          <div className="flex flex-col flex-1 min-w-0 max-w-full gap-4">
            <div className="options-toolbox flex flex-wrap items-center gap-4 bg-neutral-900 border border-neutral-800 rounded-lg shadow-md px-6 py-3 mx-auto max-w-2xl">
              <span className="font-semibold text-base">
                Layout:
                <select value={layout} onChange={e => setLayout(e.target.value as LayoutType)} className="ml-2 text-base rounded border border-neutral-700 bg-neutral-800 text-white px-2 py-1 font-medium">
                  <option value="grid">Grid</option>
                  <option value="packed">Packed</option>
                  <option value="collage">Collage</option>
                  <option value="masonry">Masonry</option>
                  <option value="single-column">Single Column</option>
                  <option value="single-row">Single Row</option>
                </select>
              </span>
              <label className="font-medium text-base flex items-center">
                <input type="checkbox" checked={normalizeSize} onChange={e => setNormalizeSize(e.target.checked)} className="mr-1" /> Normalize size
              </label>
              {(layout === 'grid' || layout === 'masonry' || layout === 'single-row' || layout === 'single-column') && (
                <label className="ml-2 font-medium text-base flex items-center">
                  <input type="checkbox" checked={fit} onChange={e => setFit(e.target.checked)} className="mr-1" /> Fit
                </label>
              )}
              <span className="flex items-center gap-2 font-medium text-base">
                Spacing:
                <input type="range" min={0} max={100} value={spacing} onChange={e => setSpacing(Number(e.target.value))} className="ml-2 w-32" />
                <span className="min-w-[24px] text-right text-neutral-400 text-sm">{spacing}</span>
              </span>
              <span className="flex items-center gap-2 font-medium text-base">
                Scale:
                <input type="range" min={1} max={100} value={scale} onChange={e => setScale(Number(e.target.value))} className="ml-2 w-32" />
                <span className="min-w-[24px] text-right text-neutral-400 text-sm">{scale}%</span>
                {imageSize && (
                  <span className="text-neutral-400 text-xs ml-2">({Math.round(imageSize.width * scale / 100)} × {Math.round(imageSize.height * scale / 100)} px)</span>
                )}
              </span>
              <span className="flex items-center gap-2 font-medium text-base">
                Background:
                {[
                  { name: 'Transparent', value: 'transparent' },
                  { name: 'White', value: '#fff' },
                  { name: 'Light Gray', value: '#eee' },
                  { name: 'Gray', value: '#888' },
                  { name: 'Black', value: '#222' },
                  { name: 'Blue', value: '#4e54c8' },
                  { name: 'Red', value: '#e44' },
                  { name: 'Yellow', value: '#ffe066' },
                  { name: 'Green', value: '#4caf50' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => { setBgColor(opt.value); setShowColorPicker(false); }} className={`w-6 h-6 rounded border ${bgColor === opt.value ? 'border-2 border-indigo-400 shadow' : 'border-neutral-700'} mx-0 cursor-pointer inline-block relative outline-none`} style={{ background: opt.value === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px' : opt.value }} title={opt.name}>
                    {opt.value === 'transparent' && (<span className="absolute left-1 top-2 text-xs text-neutral-400 pointer-events-none">⌀</span>)}
                  </button>
                ))}
                <button onClick={() => setShowColorPicker(v => !v)} className="w-6 h-6 rounded border border-neutral-700 mx-0 cursor-pointer relative outline-none inline-block" style={{ background: bgColor !== 'transparent' ? bgColor : 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px' }} title="Custom color">
                  <span className="absolute left-1.5 top-1.5 text-base text-neutral-700 pointer-events-none">🎨</span>
                  <input type="color" value={bgColor !== 'transparent' ? bgColor : '#ffffff'} onChange={e => { setBgColor(e.target.value); setShowColorPicker(false); }} className={`absolute left-0 top-0 w-6 h-6 opacity-${showColorPicker ? '100' : '0'} cursor-pointer border-none p-0`} tabIndex={-1} />
                </button>
              </span>
            </div>
            <div className="flex flex-col items-center w-full mx-auto max-w-full">
              <ImageComposer
                images={images.map(({ src, label, description }) => ({ src, label, description }))}
                normalizeSize={normalizeSize}
                layout={layout}
                spacing={spacing}
                fit={fit}
                backgroundColor={bgColor}
                style={{ margin: '0 auto 0 auto', width: '100%', maxWidth: 900 }}
                scale={scale / 100}
                onUpdate={setImageSize}
                onExport={(dataUrl) => {
                  const a = document.createElement('a');
                  a.href = dataUrl;
                  a.download = 'composed-image.png';
                  document.body.appendChild(a);
                  a.click();
                  setTimeout(() => document.body.removeChild(a), 100);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

}

export default App;
