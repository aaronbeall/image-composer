
import { useEffect, useRef, useState } from 'react';
import { Upload, ClipboardPaste, ImagePlus, Trash2, X, StickyNote } from 'lucide-react';
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
  const [spacing, setSpacing] = useState(3); // 0-9, default 3
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
      } catch { }
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

  // Responsive layout: column on small, row on large screens
  // Use CSS flexbox for layout
  return (
    <div className="app-container">
      <header className="app-header-bar">
        <span className="app-header-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ImagePlus size={24} style={{ color: '#8f94fb', marginRight: 2, marginBottom: 2 }} />
          Image Composer
        </span>
      </header>
      <div className="main-content-row" style={{ display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', gap: 24 }}>
        <div className="controls-col" style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
          <div
            ref={dropAreaRef}
            className="drop-area"
            tabIndex={0}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            style={{
              border: '2px dashed #888',
              borderRadius: 12,
              padding: 0,
              marginBottom: 8,
              background: '#181818',
              outline: 'none',
              position: 'relative',
              minHeight: 180,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
            }}
            aria-label="Image drop and preview area"
          >
            {/* Row 1: Instructions (hide if images exist) */}
            {images.length === 0 && (
              <div
                style={{
                  padding: '32px 16px 16px 16px',
                  textAlign: 'center',
                  opacity: 1,
                  color: '#fff',
                  borderBottom: '1px solid #333',
                  transition: 'opacity 0.2s, color 0.2s',
                  fontSize: 16,
                  background: 'none',
                  pointerEvents: 'auto',
                }}
              >
                <Upload size={32} style={{ color: '#888', marginBottom: 6 }} />
                <div style={{ fontWeight: 500, fontSize: 18, marginBottom: 4 }}>
                  Drag & drop images here
                </div>
                <div style={{ color: '#aaa', fontSize: 15 }}>
                  or <button type="button" onClick={handleBrowse} style={{ background: 'none', border: 'none', color: '#646cff', cursor: 'pointer', fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center' }}><ImagePlus size={18} style={{ marginRight: 4 }} />Browse</button>
                  <span style={{ margin: '0 8px' }}>|</span>
                  <button type="button" onClick={handlePasteButton} style={{ background: 'none', border: 'none', color: '#646cff', cursor: 'pointer', fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center' }}><ClipboardPaste size={18} style={{ marginRight: 4 }} />Paste</button>
                </div>
                <div style={{ color: '#aaa', fontSize: 14, marginTop: 4 }}>
                  (You can also use <kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd> to paste images)
                </div>
              </div>
            )}
            {/* Always render the file input so any browse button can trigger it */}
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {/* Row 2: Tile preview list, only if images exist */}
            {images.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid #333', margin: '0 0 4px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 0 16px' }}>
                  <div style={{ color: '#aaa', fontWeight: 500, fontSize: 15, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>{images.length} image{images.length > 1 ? 's' : ''}</span>
                    {/* Inline, simplified instructions */}
                    <span style={{ color: '#aaa', fontWeight: 400, fontSize: 14, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Drag,
                      <button
                        type="button"
                        onClick={handlePasteButton}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6c63ff',
                          cursor: 'pointer',
                          fontWeight: 500,
                          fontSize: 14,
                          textDecoration: 'underline',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: 0,
                          transition: 'color 0.15s',
                        }}
                        title="Paste images (Ctrl+V/Cmd+V)"
                        onMouseOver={e => (e.currentTarget.style.color = '#8f94fb')}
                        onMouseOut={e => (e.currentTarget.style.color = '#6c63ff')}
                      >
                        Paste
                      </button>
                      or
                      <button
                        type="button"
                        onClick={handleBrowse}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6c63ff',
                          cursor: 'pointer',
                          fontWeight: 500,
                          fontSize: 14,
                          textDecoration: 'underline',
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: 0,
                          transition: 'color 0.15s',
                        }}
                        title="Browse for more images"
                        onMouseOver={e => (e.currentTarget.style.color = '#8f94fb')}
                        onMouseOut={e => (e.currentTarget.style.color = '#6c63ff')}
                      >
                        add more
                      </button>
                    </span>
                  </div>
                  <button
                    onClick={handleClear}
                    disabled={images.length === 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#e44',
                      cursor: images.length === 0 ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      fontSize: 15,
                      display: 'inline-flex',
                      alignItems: 'center',
                      margin: 0,
                      padding: '4px 12px',
                      height: 32,
                      backgroundColor: '#181818',
                      boxShadow: '0 2px 8px #0002',
                    }}
                  >
                    <Trash2 size={18} style={{ marginRight: 4 }} />Clear
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 8, overflowX: 'auto', padding: '8px 16px 8px 16px', minHeight: 100 }}>
                  {images.map((img, idx) => {
                    const hasNotes = !!img.label || !!img.description;
                    return (
                      <div key={img.id} className="image-item" style={{ position: 'relative', marginBottom: 4, minWidth: 110, maxWidth: 140, flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#222', borderRadius: 8, boxShadow: '0 1px 4px #0004', padding: 8 }}>
                        <img src={img.src} alt={img.label || `Image ${idx + 1}`} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, marginBottom: 4, background: '#111' }} />
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'center' }}>
                          <button
                            className="image-delete-btn"
                            title="Delete image"
                            onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#e44',
                              cursor: 'pointer',
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
                          <button
                            className="image-notes-btn"
                            title="Show/hide notes"
                            onClick={() => setNotesOpen(prev => ({ ...prev, [img.id]: !prev[img.id] }))}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#aaa',
                              cursor: 'pointer',
                              padding: 2,
                              borderRadius: 4,
                              lineHeight: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                            }}
                          >
                            <StickyNote size={18} />
                            {hasNotes && <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, background: '#e44', borderRadius: '50%' }} />}
                          </button>
                        </div>
                        {/* Notes fields, toggled */}
                        {notesOpen[img.id] && (
                          <div style={{ marginTop: 6, width: '100%' }}>
                            <input
                              type="text"
                              placeholder="Label"
                              value={img.label || ''}
                              onChange={e => {
                                const newLabel = e.target.value;
                                setImages(prev => prev.map((im, i) => i === idx ? { ...im, label: newLabel } : im));
                              }}
                              className="image-label-input"
                              style={{ width: '100%', marginBottom: 4 }}
                            />
                            <textarea
                              placeholder="Description"
                              value={img.description || ''}
                              onChange={e => {
                                const newDesc = e.target.value;
                                setImages(prev => prev.map((im, i) => i === idx ? { ...im, description: newDesc } : im));
                              }}
                              className="image-desc-input"
                              style={{ width: '100%', resize: 'vertical', minHeight: 32 }}
                            />
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

        <div className="preview-col" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', gap: 16 }}>
          <div className="options-toolbox" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
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
            <span>
              Spacing:
              <select value={spacing} onChange={e => setSpacing(Number(e.target.value))} style={{ marginLeft: 8 }}>
                {[...Array(10)].map((_, i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </span>
          </div>
          <div className="composer-preview-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', margin: '0 auto', maxWidth: '100%' }}>
            <ImageComposer
              images={images.map(({ src, label, description }) => ({ src, label, description }))}
              normalizeSize={normalizeSize}
              layout={layout}
              spacing={spacing}
              style={{ margin: '0 auto 0 auto', width: '100%', maxWidth: 900 }}
            />
          </div>
        </div>
      </div>
      {/* Responsive CSS for row/column layout */}
      {/* CSS moved to App.css for layout */}
    </div>
  );
}

export default App;
