
import { useEffect, useRef, useState } from 'react';
import { Upload, ClipboardPaste, ImagePlus, Trash2, X, Image as ImageIcon } from 'lucide-react';
import { ImageComposer } from './ImageComposer';
import './App.css';

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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Focus the main drop area to enable paste
  const handlePasteButton = () => {
    dropAreaRef.current?.focus();
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

  return (
    <div className="app-container">
      <h1>Image Composer</h1>
      <div
        ref={dropAreaRef}
        className="drop-area"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        style={{
          border: '2px dashed #888',
          borderRadius: 12,
          padding: 32,
          marginBottom: 20,
          background: '#181818',
          outline: 'none',
          position: 'relative',
        }}
        aria-label="Image drop and paste area"
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Upload size={36} style={{ color: '#888' }} />
          <div style={{ fontWeight: 500, fontSize: 18, marginBottom: 4 }}>
            Drag & drop images here
          </div>
          <div style={{ color: '#aaa', fontSize: 15 }}>
            or <button type="button" onClick={handleBrowse} style={{ background: 'none', border: 'none', color: '#646cff', cursor: 'pointer', fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center' }}><ImagePlus size={18} style={{ marginRight: 4 }} />Browse</button>
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <span style={{ margin: '0 8px' }}>|</span>
            <button type="button" onClick={handlePasteButton} style={{ background: 'none', border: 'none', color: '#646cff', cursor: 'pointer', fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center' }}><ClipboardPaste size={18} style={{ marginRight: 4 }} />Paste</button>
          </div>
          <div style={{ color: '#aaa', fontSize: 14, marginTop: 4 }}>
            (You can also use <kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd> to paste images)
          </div>
        </div>
      </div>

      <div className="image-list">
        {images.length === 0 && <div style={{ color: '#888' }}>Paste, drag, or select images to begin.</div>}
        {images.map((img, idx) => (
          <div key={img.id} className="image-item">
            <img src={img.src} alt={img.label || `Image ${idx + 1}`} />
            <div className="image-item-fields">
              <input
                type="text"
                placeholder="Label"
                value={img.label || ''}
                onChange={e => {
                  const newLabel = e.target.value;
                  setImages(prev => prev.map((im, i) => i === idx ? { ...im, label: newLabel } : im));
                }}
                className="image-label-input"
              />
              <textarea
                placeholder="Description"
                value={img.description || ''}
                onChange={e => {
                  const newDesc = e.target.value;
                  setImages(prev => prev.map((im, i) => i === idx ? { ...im, description: newDesc } : im));
                }}
                className="image-desc-input"
                style={{ resize: 'vertical' }}
              />
            </div>
            <button
              className="image-delete-btn"
              title="Delete image"
              onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
              style={{
                background: 'none',
                border: 'none',
                color: '#e44',
                cursor: 'pointer',
                marginLeft: 4,
                alignSelf: 'flex-start',
                padding: 2,
                borderRadius: 4,
                lineHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>

      <div className="options-toolbox">
        <label>
          <input type="checkbox" checked={normalizeSize} onChange={e => setNormalizeSize(e.target.checked)} /> Normalize size
        </label>
        <span>
          Layout:
          <select value={layout} onChange={e => setLayout(e.target.value as LayoutType)} style={{ marginLeft: 8 }}>
            <option value="grid">Grid</option>
            <option value="packed">Packed</option>
            <option value="collage">Collage</option>
            <option value="masonry">Masonry</option>
            <option value="single-column">Single Column</option>
            <option value="single-row">Single Row</option>
          </select>
        </span>
        <button onClick={handleClear} disabled={images.length === 0} style={{ background: 'none', border: 'none', color: '#e44', cursor: images.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center' }}><Trash2 size={18} style={{ marginRight: 4 }} />Clear</button>
        <button
          type="button"
          className="toolbox-save-btn"
          style={{ background: 'none', border: 'none', color: '#4ad', cursor: 'pointer', fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center', marginLeft: 8 }}
          title="Save composition as image"
          onClick={() => { }}
        >
          <ImageIcon size={18} style={{ marginRight: 4 }} />Save
        </button>
      </div>
      {/* Final composition preview */}
      <ImageComposer
        images={images.map(({ src, label, description }) => ({ src, label, description }))}
        normalizeSize={normalizeSize}
        layout={layout}
        style={{ margin: '32px auto 0 auto', maxWidth: 900 }}
      />
    </div>
  );
}

export default App;
