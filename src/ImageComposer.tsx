import React, { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';

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
  spacing?: number; // 0-9, relative to avg image size
  fit?: boolean; // new fit option for grid/masonry
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

type NormalizeMode = 'both' | 'width' | 'height';
function getNormalizedSize(imgs: HTMLImageElement[], mode: NormalizeMode = 'both'): { width: number, height: number } {
  // Find the median width and/or height
  const ws = imgs.map(i => i.naturalWidth);
  const hs = imgs.map(i => i.naturalHeight);
  ws.sort((a, b) => a - b);
  hs.sort((a, b) => a - b);
  const mid = Math.floor(imgs.length / 2);
  return {
    width: mode === 'height' ? 0 : ws[mid],
    height: mode === 'width' ? 0 : hs[mid],
  };
}

export const ImageComposer: React.FC<ImageComposerProps> = ({ images, normalizeSize, layout, spacing = 0, fit = false, onExport, style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (!images.length) return;
      const loadedImgs = await loadImages(images);
      if (!isMounted) return;
      let norm = { width: 0, height: 0 };
      if (normalizeSize) {
        // Choose normalization mode based on layout
        let mode: NormalizeMode = 'both';
        if (layout === 'single-row') mode = 'height';
        else if (layout === 'single-column' || layout === 'masonry') mode = 'width';
        norm = getNormalizedSize(loadedImgs, mode);
      }
      const sizes = loadedImgs.map(img => {
        let w = img.naturalWidth, h = img.naturalHeight;
        if (normalizeSize) {
          if (layout === 'single-row' && norm.height) {
            // Only normalize height
            w = Math.round(norm.height * (w / h));
            h = norm.height;
          } else if ((layout === 'single-column' || layout === 'masonry') && norm.width) {
            // Only normalize width
            h = Math.round(norm.width * (h / w));
            w = norm.width;
          } else if (norm.width && norm.height) {
            // Both
            const aspect = w / h;
            if (aspect > norm.width / norm.height) {
              w = norm.width;
              h = Math.round(norm.width / aspect);
            } else {
              h = norm.height;
              w = Math.round(norm.height * aspect);
            }
          }
        }
        return { w, h };
      });
      // Calculate spacing size relative to average image size
      const avgW = sizes.reduce((a, s) => a + s.w, 0) / sizes.length;
      const avgH = sizes.reduce((a, s) => a + s.h, 0) / sizes.length;
      // Spacing is 0-9, mapped to 0 to 0.2 * avg (0, 0.025, ..., 0.2)
      const spacingFrac = spacing / 9 * 0.2; // 0 to 0.2
      const spacingPx = Math.round(spacingFrac * ((avgW + avgH) / 2));
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      switch (layout) {
        case 'single-row':
          layoutSingleRow(images, ctx, loadedImgs, sizes, spacingPx, fit);
          break;
        case 'single-column':
          layoutSingleColumn(images, ctx, loadedImgs, sizes, spacingPx, fit);
          break;
        case 'grid':
          layoutGrid(images, ctx, loadedImgs, sizes, spacingPx, fit);
          break;
        case 'masonry':
          layoutMasonry(images, ctx, loadedImgs, sizes, spacingPx, fit);
          break;
        case 'packed':
          layoutPacked(images, ctx, loadedImgs, sizes, spacingPx);
          break;
        case 'collage':
          layoutCollage(images, ctx, loadedImgs, sizes, spacingPx);
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
  }, [images, normalizeSize, layout, spacing, fit]);

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
        <button
          onClick={handleExport}
          style={{
            background: 'linear-gradient(90deg, #4e54c8 0%, #8f94fb 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '8px 20px',
            fontWeight: 600,
            fontSize: 16,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            margin: '8px 0',
            transition: 'background 0.2s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Download size={20} style={{ marginRight: 6 }} />
          Export as Image
        </button>
      </div>
    </div>
  );
};


// --- Layout functions ---
function layoutSingleRow(
  images: ComposeImageItem[],
  ctx: CanvasRenderingContext2D,
  loadedImgs: HTMLImageElement[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
) {
  const maxHeight = Math.max(...sizes.map(s => s.h)) + 2 * spacing;
  let totalWidth;
  let scaledWidths: number[] = [];
  if (fit) {
    // All images get height = maxHeight - 2*spacing, width by aspect ratio
    const rowH = maxHeight - 2 * spacing;
    scaledWidths = loadedImgs.map(img => Math.round(rowH * (img.naturalWidth / img.naturalHeight)));
    totalWidth = scaledWidths.reduce((sum, w, i) => sum + w + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  } else {
    totalWidth = sizes.reduce((sum, s, i) => sum + s.w + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  }
  ctx.canvas.width = totalWidth;
  ctx.canvas.height = maxHeight;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  let x = spacing;
  loadedImgs.forEach((img, i) => {
    if (fit) {
      const rowH = maxHeight - 2 * spacing;
      const w = scaledWidths[i];
      ctx.drawImage(img, x, spacing, w, rowH);
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, x + 4, spacing + 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, x + 4, spacing + rowH - 6);
      }
      x += w + spacing;
    } else {
      ctx.drawImage(img, x, spacing, sizes[i].w, sizes[i].h);
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
      x += sizes[i].w + spacing;
    }
  });
}

function layoutSingleColumn(
  images: ComposeImageItem[],
  ctx: CanvasRenderingContext2D,
  loadedImgs: HTMLImageElement[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
) {
  const maxWidth = Math.max(...sizes.map(s => s.w)) + 2 * spacing;
  let totalHeight;
  let scaledHeights: number[] = [];
  if (fit) {
    // All images get width = maxWidth - 2*spacing, height by aspect ratio
    const colW = maxWidth - 2 * spacing;
    scaledHeights = loadedImgs.map(img => Math.round(colW * (img.naturalHeight / img.naturalWidth)));
    totalHeight = scaledHeights.reduce((sum, h, i) => sum + h + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  } else {
    totalHeight = sizes.reduce((sum, s, i) => sum + s.h + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  }
  ctx.canvas.width = maxWidth;
  ctx.canvas.height = totalHeight;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  let y = spacing;
  loadedImgs.forEach((img, i) => {
    if (fit) {
      const colW = maxWidth - 2 * spacing;
      const h = scaledHeights[i];
      ctx.drawImage(img, (maxWidth - colW) / 2, y, colW, h);
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, (maxWidth - colW) / 2 + 4, y + 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, (maxWidth - colW) / 2 + 4, y + h - 6);
      }
      y += h + spacing;
    } else {
      ctx.drawImage(img, (maxWidth - 2 * spacing - sizes[i].w) / 2 + spacing, y, sizes[i].w, sizes[i].h);
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
      y += sizes[i].h + spacing;
    }
  });
}

function layoutGrid(
  images: ComposeImageItem[],
  ctx: CanvasRenderingContext2D,
  loadedImgs: HTMLImageElement[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
) {
  // Make a square-ish grid
  const n = loadedImgs.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(...sizes.map(s => s.w));
  const cellH = Math.max(...sizes.map(s => s.h));
  ctx.canvas.width = cols * cellW + (cols - 1) * spacing + 2 * spacing;
  ctx.canvas.height = rows * cellH + (rows - 1) * spacing + 2 * spacing;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 0; i < n; ++i) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (cellW + spacing) + spacing;
    const y = row * (cellH + spacing) + spacing;
    if (fit) {
      // Scale and center to fill the cell, cropping overflow
      const img = loadedImgs[i];
      const aspectImg = img.naturalWidth / img.naturalHeight;
      const aspectCell = cellW / cellH;
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (aspectImg > aspectCell) {
        // Image is wider, crop horizontally
        sh = img.naturalHeight;
        sw = sh * aspectCell;
        sx = (img.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        // Image is taller, crop vertically
        sw = img.naturalWidth;
        sh = sw / aspectCell;
        sx = 0;
        sy = (img.naturalHeight - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
      // Draw label/desc at fixed positions
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, x + 4, y + 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, x + 4, y + cellH - 6);
      }
    } else {
      // Center image in cell, no cropping
      const imgW = sizes[i].w;
      const imgH = sizes[i].h;
      const cx = x + (cellW - imgW) / 2;
      const cy = y + (cellH - imgH) / 2;
      ctx.drawImage(loadedImgs[i], cx, cy, imgW, imgH);
      if (images[i].label) {
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].label!, cx + 4, cy + 16);
      }
      if (images[i].description) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(images[i].description!, cx + 4, cy + imgH - 6);
      }
    }
  }
}

function layoutMasonry(
  images: ComposeImageItem[],
  ctx: CanvasRenderingContext2D,
  loadedImgs: HTMLImageElement[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
) {
  // Simple masonry: assign each image to the shortest column
  const n = loadedImgs.length;
  const cols = Math.ceil(Math.sqrt(n));
  // Compute colWidths as in non-fit mode
  const colWidths = Array(cols).fill(0).map((_, i) => Math.max(...sizes.filter((_, idx) => idx % cols === i).map(s => s.w), 0));
  // Add spacing to colWidths except last col
  for (let i = 0; i < cols - 1; ++i) colWidths[i] += spacing;
  const colHeights = Array(cols).fill(0);
  const positions: { x: number, y: number, w: number, h: number, imgIdx: number, col: number }[] = [];
  for (let i = 0; i < n; ++i) {
    // Find shortest column
    let minCol = 0;
    for (let c = 1; c < cols; ++c) if (colHeights[c] < colHeights[minCol]) minCol = c;
    const x = colWidths.slice(0, minCol).reduce((a, b) => a + b, 0);
    const w = colWidths[minCol] - (minCol < cols - 1 ? spacing : 0);
    const y = colHeights[minCol] + (colHeights[minCol] > 0 ? spacing : 0);
    // For fit: scale image to fill column width, height by aspect ratio
    // For non-fit: use original size
    let drawW = sizes[i].w, drawH = sizes[i].h;
    if (fit) {
      drawW = w;
      drawH = Math.round(drawW * (loadedImgs[i].naturalHeight / loadedImgs[i].naturalWidth));
    }
    positions.push({ x, y, w: drawW, h: drawH, imgIdx: i, col: minCol });
    colHeights[minCol] += drawH + (colHeights[minCol] > 0 ? spacing : 0);
  }
  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + 2 * spacing;
  const totalHeight = Math.max(...colHeights) + 2 * spacing;
  ctx.canvas.width = totalWidth;
  ctx.canvas.height = totalHeight;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 0; i < n; ++i) {
    const { x, y, w, h, imgIdx } = positions[i];
    ctx.drawImage(loadedImgs[imgIdx], x + spacing, y + spacing, w, h);
    if (images[imgIdx].label) {
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(images[imgIdx].label!, x + spacing + 4, y + spacing + 16);
    }
    if (images[imgIdx].description) {
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(images[imgIdx].description!, x + spacing + 4, y + spacing + h - 6);
    }
  }
}


// Maximal rectangles bin-packing: place images in any available gap, splitting gaps as needed
function layoutPacked(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[], spacing: number = 0) {
  // Estimate bin width as the max of sqrt(total area) and max image width
  const totalArea = sizes.reduce((a, s) => a + s.w * s.h, 0);
  const maxW = Math.max(...sizes.map(s => s.w));
  // Add spacing to binWidth estimate
  const binWidth = Math.max(Math.ceil(Math.sqrt(totalArea)), maxW) + spacing * (sizes.length - 1);
  // Start with one big free rectangle
  const freeRects = [{ x: 0, y: 0, w: binWidth, h: 100000 }]; // h is "infinite" for now
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
      freeRects.push({ x: 0, y: minY + spacing, w: binWidth, h: 100000 });
      i--; // retry this image
      continue;
    }
    const spot = freeRects[bestIdx];
    placements[i] = { x: spot.x, y: spot.y };
    maxY = Math.max(maxY, spot.y + h);
    // Split the free rect into up to 2 new rects (right and below)
    const newRects = [];
    if (spot.w > w + spacing) newRects.push({ x: spot.x + w + spacing, y: spot.y, w: spot.w - w - spacing, h: h });
    if (spot.h > h + spacing) newRects.push({ x: spot.x, y: spot.y + h + spacing, w: spot.w, h: spot.h - h - spacing });
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
  ctx.canvas.width = binWidth + 2 * spacing;
  ctx.canvas.height = maxY + 2 * spacing;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 0; i < sizes.length; ++i) {
    const { x, y } = placements[i];
    ctx.drawImage(loadedImgs[i], x + spacing, y + spacing, sizes[i].w, sizes[i].h);
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
function layoutCollage(images: ComposeImageItem[], ctx: CanvasRenderingContext2D, loadedImgs: HTMLImageElement[], sizes: { w: number, h: number }[], spacing: number = 0) {
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
      // Snap to each edge (left, right, top, bottom), add spacing on both sides
      candidates.push({ x: p.x + p.w + spacing, y: p.y, align: 'left', anchorIdx }); // right edge, align top
      candidates.push({ x: p.x - spacing, y: p.y, align: 'right', anchorIdx }); // left edge, align top
      candidates.push({ x: p.x, y: p.y - spacing, align: 'bottom', anchorIdx }); // top edge, align left
      candidates.push({ x: p.x, y: p.y + p.h + spacing, align: 'top', anchorIdx }); // bottom edge, align left
      // Add corners for diagonal growth
      candidates.push({ x: p.x - spacing, y: p.y - spacing, align: 'corner-topleft', anchorIdx });
      candidates.push({ x: p.x + p.w + spacing, y: p.y - spacing, align: 'corner-topright', anchorIdx });
      candidates.push({ x: p.x - spacing, y: p.y + p.h + spacing, align: 'corner-bottomleft', anchorIdx });
      candidates.push({ x: p.x + p.w + spacing, y: p.y + p.h + spacing, align: 'corner-bottomright', anchorIdx });
    });
    return candidates;
  }

  // Helper: scoring function for placements
  // Center is the center of the first (largest) image
  const centerX = placements[0].x + placements[0].w / 2;
  const centerY = placements[0].y + placements[0].h / 2;
  function scorePlacement(pos: { x: number; y: number }, w: number, h: number) {
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
      // All alignments must include spacing between images
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
          // Enforce spacing between all images (not just overlap)
          if (
            pos.x < p.x + p.w + spacing &&
            pos.x + w + spacing > p.x &&
            pos.y < p.y + p.h + spacing &&
            pos.y + h + spacing > p.y
          ) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;
        // Must touch at least one edge (with spacing)
        let flush = false;
        for (const p of placements) {
          if (
            (Math.abs(pos.x + w + spacing - p.x) < 1e-6 && pos.y < p.y + p.h + spacing && pos.y + h > p.y) || // right edge
            (Math.abs(pos.x - (p.x + p.w + spacing)) < 1e-6 && pos.y < p.y + p.h + spacing && pos.y + h > p.y) || // left edge
            (Math.abs(pos.y + h + spacing - p.y) < 1e-6 && pos.x < p.x + p.w + spacing && pos.x + w > p.x) || // bottom edge
            (Math.abs(pos.y - (p.y + p.h + spacing)) < 1e-6 && pos.x < p.x + p.w + spacing && pos.x + w > p.x) // top edge
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
      bestPos = { x: minX, y: maxY + spacing };
    }
    placements.push({ x: bestPos.x, y: bestPos.y, w, h, i });
    minX = Math.min(minX, bestPos.x);
    minY = Math.min(minY, bestPos.y);
    maxX = Math.max(maxX, bestPos.x + w);
    maxY = Math.max(maxY, bestPos.y + h);
  }
  // Normalize all positions so minX/minY is at 0,0
  const offsetX = -minX, offsetY = -minY;
  // Add spacing to all edges by offsetting placements and increasing canvas size
  ctx.canvas.width = maxX - minX + 2 * spacing;
  ctx.canvas.height = maxY - minY + 2 * spacing;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (const p of placements) {
    const x = p.x + offsetX + spacing;
    const y = p.y + offsetY + spacing;
    const i = p.i;
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