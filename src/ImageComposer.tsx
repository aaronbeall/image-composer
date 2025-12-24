import React, { useRef } from 'react';

export type LayoutType = 'grid' | 'packed' | 'masonry' | 'single-column' | 'single-row';

export interface ComposeImageItem {
  src: string;
  label?: string;
  description?: string;
  width?: number;
  height?: number;
}

interface ImageComposerProps {
  images: ComposeImageItem[];
  normalizeSize: boolean;
  layout: LayoutType;
  onExport?: (dataUrl: string) => void;
  style?: React.CSSProperties;
}

// Utility to load all images and get their natural sizes
async function loadImages(images: ComposeImageItem[]) {
  return Promise.all(images.map(img => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = img.src;
    });
  }));
}

function getNormalizedSize(imgs: HTMLImageElement[]): { width: number, height: number } {
  // Find the median width and height
  const ws = imgs.map(i => i.naturalWidth);
  const hs = imgs.map(i => i.naturalHeight);
  ws.sort((a, b) => a - b);
  hs.sort((a, b) => a - b);
  const mid = Math.floor(imgs.length / 2);
  return {
    width: ws[mid],
    height: hs[mid],
  };
}

export const ImageComposer: React.FC<ImageComposerProps> = ({ images, normalizeSize, layout, onExport, style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (!images.length) return;
      const loadedImgs = await loadImages(images);
      if (!isMounted) return;
      let norm = { width: 0, height: 0 };
      if (normalizeSize) {
        norm = getNormalizedSize(loadedImgs);
      }
      const sizes = loadedImgs.map(img => {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (normalizeSize && norm.width && norm.height) {
          const aspect = w / h;
          if (aspect > norm.width / norm.height) {
            w = norm.width;
            h = Math.round(norm.width / aspect);
          } else {
            h = norm.height;
            w = Math.round(norm.height * aspect);
          }
        }
        return { w, h };
      });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      switch (layout) {
        case 'single-row':
          layoutSingleRow(images, ctx, loadedImgs, sizes);
          break;
        case 'single-column':
          layoutSingleColumn(images, ctx, loadedImgs, sizes);
          break;
        case 'grid':
          layoutGrid(images, ctx, loadedImgs, sizes);
          break;
        case 'masonry':
          layoutMasonry(images, ctx, loadedImgs, sizes);
          break;
        case 'packed':
          layoutPacked(images, ctx, loadedImgs, sizes);
          break;
        default:
          ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.fillStyle = '#222';
          ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
          ctx.font = '16px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText('Layout not implemented', 10, 30);
      }
    };
    run();
    return () => { isMounted = false; };
  }, [images, normalizeSize, layout]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    if (onExport) onExport(dataUrl);
  };

  return (
    <div style={{ textAlign: 'center', ...style }}>
      <canvas ref={canvasRef} style={{ maxWidth: '100%', border: '1px solid #444', background: '#222', marginBottom: 8 }} />
      <div>
        <button onClick={handleExport}>Export as Image</button>
      </div>
    </div>
  );
};


  // --- Layout functions ---
  function layoutSingleRow(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[]) {
    let totalWidth = sizes.reduce((sum, s) => sum + s.w, 0);
    let maxHeight = Math.max(...sizes.map(s => s.h));
    ctx.canvas.width = totalWidth;
    ctx.canvas.height = maxHeight;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    let x = 0;
    loadedImgs.forEach((img, i) => {
      ctx.drawImage(img, x, 0, sizes[i].w, sizes[i].h);
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, x + 4, 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, x + 4, sizes[i].h - 6);
      }
      x += sizes[i].w;
    });
  }

  function layoutSingleColumn(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[]) {
    let maxWidth = Math.max(...sizes.map(s => s.w));
    let totalHeight = sizes.reduce((sum, s) => sum + s.h, 0);
    ctx.canvas.width = maxWidth;
    ctx.canvas.height = totalHeight;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    let y = 0;
    loadedImgs.forEach((img, i) => {
      ctx.drawImage(img, (maxWidth - sizes[i].w) / 2, y, sizes[i].w, sizes[i].h);
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, (maxWidth - sizes[i].w) / 2 + 4, y + 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, (maxWidth - sizes[i].w) / 2 + 4, y + sizes[i].h - 6);
      }
      y += sizes[i].h;
    });
  }

  function layoutGrid(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[]) {
    // Make a square-ish grid
    const n = loadedImgs.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = Math.max(...sizes.map(s => s.w));
    const cellH = Math.max(...sizes.map(s => s.h));
    ctx.canvas.width = cols * cellW;
    ctx.canvas.height = rows * cellH;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let i = 0; i < n; ++i) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      ctx.drawImage(loadedImgs[i], col * cellW + (cellW - sizes[i].w) / 2, row * cellH + (cellH - sizes[i].h) / 2, sizes[i].w, sizes[i].h);
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, col * cellW + 4, row * cellH + 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, col * cellW + 4, (row + 1) * cellH - 6);
      }
    }
  }

  function layoutMasonry(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[]) {
    // Simple masonry: assign each image to the shortest column
    const n = loadedImgs.length;
    const cols = Math.ceil(Math.sqrt(n));
    const colWidths = Array(cols).fill(0).map((_, i) => Math.max(...sizes.filter((_, idx) => idx % cols === i).map(s => s.w), 0));
    const colHeights = Array(cols).fill(0);
    const positions: { x: number, y: number }[] = [];
    for (let i = 0; i < n; ++i) {
      // Find shortest column
      let minCol = 0;
      for (let c = 1; c < cols; ++c) if (colHeights[c] < colHeights[minCol]) minCol = c;
      const x = colWidths.slice(0, minCol).reduce((a, b) => a + b, 0);
      const y = colHeights[minCol];
      positions.push({ x, y });
      colHeights[minCol] += sizes[i].h;
    }
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const totalHeight = Math.max(...colHeights);
    ctx.canvas.width = totalWidth;
    ctx.canvas.height = totalHeight;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let i = 0; i < n; ++i) {
      ctx.drawImage(loadedImgs[i], positions[i].x, positions[i].y, sizes[i].w, sizes[i].h);
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, positions[i].x + 4, positions[i].y + 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, positions[i].x + 4, positions[i].y + sizes[i].h - 6);
      }
    }
  }

  function layoutPacked(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[]) {
    // Simple greedy packing: place images in rows, each row as wide as the widest image, try to keep square-ish
    const n = loadedImgs.length;
    const maxW = Math.max(...sizes.map(s => s.w));
    const totalArea = sizes.reduce((a, s) => a + s.w * s.h, 0);
    const targetSide = Math.ceil(Math.sqrt(totalArea));
    let rows: { imgs: number[], height: number }[] = [];
    let currentRow: number[] = [], rowW = 0, rowH = 0;
    for (let i = 0; i < n; ++i) {
      if (rowW + sizes[i].w > targetSide && currentRow.length > 0) {
        rows.push({ imgs: currentRow, height: rowH });
        currentRow = [];
        rowW = 0;
        rowH = 0;
      }
      currentRow.push(i);
      rowW += sizes[i].w;
      rowH = Math.max(rowH, sizes[i].h);
    }
    if (currentRow.length) rows.push({ imgs: currentRow, height: rowH });
    const totalWidth = Math.max(...rows.map(r => r.imgs.reduce((w, idx) => w + sizes[idx].w, 0)));
    const totalHeight = rows.reduce((h, r) => h + r.height, 0);
    ctx.canvas.width = totalWidth;
    ctx.canvas.height = totalHeight;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    let y = 0;
    for (const row of rows) {
      let x = 0;
      for (const idx of row.imgs) {
        ctx.drawImage(loadedImgs[idx], x, y, sizes[idx].w, sizes[idx].h);
        if (images[idx].label) {
          ctx.font = 'bold 14px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText(images[idx].label!, x + 4, y + 16);
        }
        if (images[idx].description) {
          ctx.font = '12px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText(images[idx].description!, x + 4, y + sizes[idx].h - 6);
        }
        x += sizes[idx].w;
      }
      y += row.height;
    }
  }