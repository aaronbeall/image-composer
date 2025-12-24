import React, { useEffect, useRef } from 'react';

export type LayoutType = 'grid' | 'packed' | 'masonry' | 'single-column' | 'single-row' | 'collage';

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

  useEffect(() => {
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
        case 'collage':
          layoutCollage(images, ctx, loadedImgs, sizes);
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
  const totalWidth = sizes.reduce((sum, s) => sum + s.w, 0);
  const maxHeight = Math.max(...sizes.map(s => s.h));
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
  const maxWidth = Math.max(...sizes.map(s => s.w));
  const totalHeight = sizes.reduce((sum, s) => sum + s.h, 0);
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


// Maximal rectangles bin-packing: place images in any available gap, splitting gaps as needed
function layoutPacked(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[]) {
  // Estimate bin width as the max of sqrt(total area) and max image width
  const totalArea = sizes.reduce((a, s) => a + s.w * s.h, 0);
  const maxW = Math.max(...sizes.map(s => s.w));
  const binWidth = Math.max(Math.ceil(Math.sqrt(totalArea)), maxW);
  // Start with one big free rectangle
  let freeRects = [{ x: 0, y: 0, w: binWidth, h: 100000 }]; // h is "infinite" for now
  const placements: { x: number, y: number }[] = Array(sizes.length);
  let maxY = 0;
  for (let i = 0; i < sizes.length; ++i) {
    const { w, h } = sizes[i];
    // Find the first free rect that fits
    let bestIdx = -1, bestY = Infinity, bestX = Infinity;
    for (let j = 0; j < freeRects.length; ++j) {
      const r = freeRects[j];
      if (w <= r.w && h <= r.h) {
        // Prefer lowest y, then leftmost x
        if (r.y < bestY || (r.y === bestY && r.x < bestX)) {
          bestIdx = j; bestY = r.y; bestX = r.x;
        }
      }
    }
    if (bestIdx === -1) {
      // No fit found, extend canvas downward
      const minY = Math.min(...freeRects.map(r => r.y + r.h));
      freeRects.push({ x: 0, y: minY, w: binWidth, h: 100000 });
      i--; // retry this image
      continue;
    }
    const spot = freeRects[bestIdx];
    placements[i] = { x: spot.x, y: spot.y };
    maxY = Math.max(maxY, spot.y + h);
    // Split the free rect into up to 2 new rects (right and below)
    const newRects = [];
    if (spot.w > w) newRects.push({ x: spot.x + w, y: spot.y, w: spot.w - w, h: h });
    if (spot.h > h) newRects.push({ x: spot.x, y: spot.y + h, w: spot.w, h: spot.h - h });
    // Remove used rect, add new
    freeRects.splice(bestIdx, 1, ...newRects);
    // Merge free rects (simple pass, not optimal)
    for (let a = 0; a < freeRects.length; ++a) {
      for (let b = a + 1; b < freeRects.length; ++b) {
        const A = freeRects[a], B = freeRects[b];
        // Merge horizontally
        if (A.y === B.y && A.h === B.h && (A.x + A.w === B.x || B.x + B.w === A.x)) {
          const merged = { x: Math.min(A.x, B.x), y: A.y, w: A.w + B.w, h: A.h };
          freeRects.splice(b, 1);
          freeRects[a] = merged;
          a = -1; break;
        }
        // Merge vertically
        if (A.x === B.x && A.w === B.w && (A.y + A.h === B.y || B.y + B.h === A.y)) {
          const merged = { x: A.x, y: Math.min(A.y, B.y), w: A.w, h: A.h + B.h };
          freeRects.splice(b, 1);
          freeRects[a] = merged;
          a = -1; break;
        }
      }
    }
  }
  ctx.canvas.width = binWidth;
  ctx.canvas.height = maxY;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 0; i < sizes.length; ++i) {
    const { x, y } = placements[i];
    ctx.drawImage(loadedImgs[i], x, y, sizes[i].w, sizes[i].h);
    if (images[i].label) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(images[i].label!, x + 4, y + 16);
    }
    if (images[i].description) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(images[i].description!, x + 4, y + sizes[i].h - 6);
    }
  }
}





// Radial-masonry, constraint-driven greedy packing for organic collage
function layoutCollage(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[]) {
  // Sort by area descending
  const indexed = sizes.map((s, i) => ({ ...s, i, area: s.w * s.h }));
  indexed.sort((a, b) => b.area - a.area);
  const placements: { x: number, y: number, w: number, h: number, i: number }[] = [];
  // Place the largest image at (0,0)
  placements.push({ x: 0, y: 0, w: indexed[0].w, h: indexed[0].h, i: indexed[0].i });
  let minX = 0, minY = 0, maxX = indexed[0].w, maxY = indexed[0].h;

  // Helper: generate candidate positions (frontier) from all placed images
  function getCandidatePositions() {
    const candidates: { x: number, y: number, align: string, anchorIdx: number }[] = [];
    placements.forEach((p, anchorIdx) => {
      // Snap to each edge (left, right, top, bottom)
      candidates.push({ x: p.x + p.w, y: p.y, align: 'left', anchorIdx }); // right edge, align top
      candidates.push({ x: p.x - 0, y: p.y, align: 'right', anchorIdx }); // left edge, align top
      candidates.push({ x: p.x, y: p.y - 0, align: 'bottom', anchorIdx }); // top edge, align left
      candidates.push({ x: p.x, y: p.y + p.h, align: 'top', anchorIdx }); // bottom edge, align left
      // Add corners for diagonal growth
      candidates.push({ x: p.x - 0, y: p.y - 0, align: 'corner-topleft', anchorIdx });
      candidates.push({ x: p.x + p.w, y: p.y - 0, align: 'corner-topright', anchorIdx });
      candidates.push({ x: p.x - 0, y: p.y + p.h, align: 'corner-bottomleft', anchorIdx });
      candidates.push({ x: p.x + p.w, y: p.y + p.h, align: 'corner-bottomright', anchorIdx });
    });
    return candidates;
  }

  // Helper: scoring function for placements
  // Center is the center of the first (largest) image
  const centerX = placements[0].x + placements[0].w / 2;
  const centerY = placements[0].y + placements[0].h / 2;
  function scorePlacement(pos, w, h) {
    const cx = pos.x + w / 2, cy = pos.y + h / 2;
    return Math.sqrt((cx - centerX) * (cx - centerX) + (cy - centerY) * (cy - centerY));
  }

  // Place remaining images
  for (let k = 1; k < indexed.length; ++k) {
    const { w, h, i } = indexed[k];
    let bestScore = Infinity, bestPos = null;
    const candidates = getCandidatePositions();
    for (const cand of candidates) {
      // Try all four alignments for each candidate
      const alignments = [
        { x: cand.x, y: cand.y }, // top-left
        { x: cand.x - w, y: cand.y }, // top-right
        { x: cand.x, y: cand.y - h }, // bottom-left
        { x: cand.x - w, y: cand.y - h }, // bottom-right
      ];
      for (const pos of alignments) {
        // Check for overlap
        let overlap = false;
        for (const p of placements) {
          if (
            pos.x < p.x + p.w &&
            pos.x + w > p.x &&
            pos.y < p.y + p.h &&
            pos.y + h > p.y
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;
        // Must touch at least one edge
        let flush = false;
        for (const p of placements) {
          if (
            (Math.abs(pos.x + w - p.x) < 1e-6 && pos.y < p.y + p.h && pos.y + h > p.y) || // right edge
            (Math.abs(pos.x - (p.x + p.w)) < 1e-6 && pos.y < p.y + p.h && pos.y + h > p.y) || // left edge
            (Math.abs(pos.y + h - p.y) < 1e-6 && pos.x < p.x + p.w && pos.x + w > p.x) || // bottom edge
            (Math.abs(pos.y - (p.y + p.h)) < 1e-6 && pos.x < p.x + p.w && pos.x + w > p.x) // top edge
          ) {
            flush = true;
            break;
          }
        }
        if (!flush) continue;
        // Score
        const score = scorePlacement(pos, w, h);
        if (score < bestScore) {
          bestScore = score;
          bestPos = pos;
        }
      }
    }
    // If no valid position, expand downward
    if (!bestPos) {
      bestPos = { x: minX, y: maxY };
    }
    placements.push({ x: bestPos.x, y: bestPos.y, w, h, i });
    minX = Math.min(minX, bestPos.x);
    minY = Math.min(minY, bestPos.y);
    maxX = Math.max(maxX, bestPos.x + w);
    maxY = Math.max(maxY, bestPos.y + h);
  }
  // Normalize all positions so minX/minY is at 0,0
  const offsetX = -minX, offsetY = -minY;
  ctx.canvas.width = maxX - minX;
  ctx.canvas.height = maxY - minY;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const p of placements) {
    const x = p.x + offsetX, y = p.y + offsetY, i = p.i;
    ctx.drawImage(loadedImgs[i], x, y, sizes[i].w, sizes[i].h);
    if (images[i].label) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(images[i].label!, x + 4, y + 16);
    }
    if (images[i].description) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(images[i].description!, x + 4, y + sizes[i].h - 6);
    }
  }
}