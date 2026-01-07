import { mulberry32 } from './utils';

// --- Layout algorithms and types ---
export type LayoutType = 'grid' | 'packed' | 'masonry' | 'lanes' | 'single-column' | 'single-row' | 'cluster' | 'squarified' | 'bubble';

export type Sequence = 'random' | 'linear' | 'exponential' | 'bulge' | 'peak';

// Helper function to compute resize factor for an image based on sequence
function getResizeFactor(
  index: number,
  total: number,
  amount: number,
  sequence: Sequence
): number {
  // Convert percentage to scale factor: -100 => 0.0 (0%), 0 => 1.0 (100%), 200 => 3.0 (300%)
  const baseScale = 1;
  const targetScale = 1 + (amount / 100);

  if (sequence === 'random') {
    // Use seeded random based on index for deterministic results
    const seed = index * 12345 + 67890;
    const random = mulberry32(seed)();
    // Random between base (1.0) and target
    const min = Math.min(baseScale, targetScale);
    const max = Math.max(baseScale, targetScale);
    return min + random * (max - min);
  }

  const progress = total > 1 ? index / (total - 1) : 0;

  if (sequence === 'linear') {
    // Negative amount: descending (1.0 → targetScale)
    // Positive amount: ascending (1.0 → targetScale)
    return baseScale + progress * (targetScale - baseScale);
  }

  if (sequence === 'exponential') {
    const expProgress = progress * progress; // Quadratic ease
    return baseScale + expProgress * (targetScale - baseScale);
  }

  if (sequence === 'bulge') {
    // Bell curve: edges at base scale, middle at target scale
    const bellFactor = 1 - Math.pow(progress - 0.5, 2) * 4; // Parabola peaking at 0.5
    return baseScale + bellFactor * (targetScale - baseScale);
  }

  if (sequence === 'peak') {
    // Sharp peak: exponential distribution with maximum at middle
    const distanceFromCenter = Math.abs(progress - 0.5) * 2; // 0 at center, 1 at edges
    const peakFactor = Math.pow(1 - distanceFromCenter, 3); // Cubic falloff for sharp peak
    return baseScale + peakFactor * (targetScale - baseScale);
  }

  return 1;
}

export interface ComposeImageItem {
  id: string;
  src: string;
  file?: File;
  hidden?: boolean;
  label?: string;
  description?: string;
  width?: number;
  height?: number;
}

export interface LayoutOptions {
  // Core layout selection and normalization behavior
  layout: LayoutType;
  normalizeSize: boolean;

  // Controls
  spacing: number; // 0-100, relative to avg image size
  fit: boolean; // fit option for grid/masonry
  scale: number;
  jitterPosition: number;
  jitterSize: number;
  jitterRotation: number;
  justify: boolean;

  // Resize controls
  resizeEnabled: boolean;
  resizeAmount: number; // [-100, 200] where -100 = 0% size, 0 = 100%, 200 = 300%
  resizeSequence: Sequence;
}

type NormalizeMode = 'both' | 'width' | 'height';
function getNormalizedSize(imgs: ImageBitmap[], mode: NormalizeMode = 'both'): { width: number, height: number } {
  // Find the median width and/or height
  const ws = imgs.map(i => i.width);
  const hs = imgs.map(i => i.height);
  ws.sort((a, b) => a - b);
  hs.sort((a, b) => a - b);
  const mid = Math.floor(imgs.length / 2);
  return {
    width: mode === 'height' ? 0 : ws[mid],
    height: mode === 'width' ? 0 : hs[mid],
  };
}

// Layout result types
export interface LayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
  imageIndex: number;
}

export interface LayoutResult {
  canvasWidth: number;
  canvasHeight: number;
  items: LayoutItem[];
  fit?: boolean; // Override user fit option if needed
}

export const MAX_CANVAS_SIZE = 3200;

// --- Main layout composition function ---
export function layoutComposition({
  loadedImages,
  images,
  normalizeSize,
  layout,
  spacing,
  fit,
  scale,
  justify,
  resizeEnabled,
  resizeAmount,
  resizeSequence,
}: {
  loadedImages: ImageBitmap[];
  images: ComposeImageItem[];
  normalizeSize: boolean;
  layout: LayoutType;
  spacing: number;
  fit: boolean;
  scale: number;
  justify: boolean;
  resizeEnabled: boolean;
  resizeAmount: number;
  resizeSequence: Sequence;
}) {
  if (!loadedImages || !loadedImages.length || loadedImages.length !== images.length) return { canvasWidth: 1, canvasHeight: 1, items: [] };

  // Determine normalized size if needed
  let norm = { width: 0, height: 0 };
  if (normalizeSize) {
    let mode: NormalizeMode = 'both';
    if (layout === 'single-row') mode = 'height';
    else if (layout === 'single-column' || layout === 'masonry') mode = 'width';
    norm = getNormalizedSize(loadedImages, mode);
  }

  // Compute sizes (after normalization if applicable)
  const sizes = loadedImages.map((img, i) => {
    let w = img.width, h = img.height;
    if (normalizeSize) {
      if (layout === 'single-row' && norm.height) {
        w = Math.round(norm.height * (w / h));
        h = norm.height;
      } else if ((layout === 'single-column' || layout === 'masonry') && norm.width) {
        h = Math.round(norm.width * (h / w));
        w = norm.width;
      } else if (norm.width && norm.height) {
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

    // Apply resize adjustments after normalization but before layout
    if (resizeEnabled) {
      const resizeFactor = getResizeFactor(i, loadedImages.length, resizeAmount, resizeSequence);
      w = Math.round(w * resizeFactor);
      h = Math.round(h * resizeFactor);
    }

    // Enforce minimum size to prevent layout issues with 0-sized images
    w = Math.max(1, w);
    h = Math.max(1, h);

    return { w, h };
  });

  // Compute spacing in pixels based on average image size
  const avgW = sizes.reduce((a, s) => a + s.w, 0) / sizes.length;
  const avgH = sizes.reduce((a, s) => a + s.h, 0) / sizes.length;
  const spacingFrac = spacing / 100 * 0.5;
  const spacingPx = Math.round(spacingFrac * ((avgW + avgH) / 2));

  // Compute layout based on selected algorithm
  const layoutResult = (() => {
    switch (layout) {
      case 'single-row':
        return layoutSingleRow(loadedImages, sizes, spacingPx, fit);
      case 'single-column':
        return layoutSingleColumn(loadedImages, sizes, spacingPx, fit);
      case 'grid':
        return layoutGrid(loadedImages, sizes, spacingPx, fit, justify);
      case 'masonry':
        return layoutMasonry(loadedImages, sizes, spacingPx, fit, justify);
      case 'packed':
        return layoutPacked(sizes, spacingPx, justify);
      case 'cluster':
        return layoutRadialMasonry(sizes, spacingPx);
      case 'squarified':
        return layoutSquarified(sizes, spacingPx);
      case 'lanes':
        return layoutLanes(loadedImages, sizes, spacingPx, fit, justify);
      case 'bubble':
        return layoutBubble(loadedImages, sizes, spacingPx);
      default:
        return { canvasWidth: 800, canvasHeight: 600, items: [] };
    }
  })();

  // Apply max size constraint (pre-scale)
  const maxScaleFactor = Math.min(MAX_CANVAS_SIZE / layoutResult.canvasWidth, MAX_CANVAS_SIZE / layoutResult.canvasHeight);
  const preScaledLayout = {
    canvasWidth: layoutResult.canvasWidth * maxScaleFactor,
    canvasHeight: layoutResult.canvasHeight * maxScaleFactor,
    items: layoutResult.items.map(item => ({
      ...item,
      x: item.x * maxScaleFactor,
      y: item.y * maxScaleFactor,
      w: item.w * maxScaleFactor,
      h: item.h * maxScaleFactor,
    })),
  };

  // Apply user scale uniformly after pre-scaling
  return {
    ...layoutResult,
    canvasWidth: preScaledLayout.canvasWidth * scale,
    canvasHeight: preScaledLayout.canvasHeight * scale,
    items: preScaledLayout.items.map(item => ({
      ...item,
      x: item.x * scale,
      y: item.y * scale,
      w: item.w * scale,
      h: item.h * scale,
    })),
  };
}


// --- Layout functions ---
export function layoutSingleRow(
  loadedImgs: ImageBitmap[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
): LayoutResult {
  const maxHeight = Math.max(...sizes.map(s => s.h)) + 2 * spacing;
  let totalWidth;
  let scaledWidths: number[] = [];

  if (fit) {
    // All images get height = maxHeight - 2*spacing, width by aspect ratio
    const rowH = maxHeight - 2 * spacing;
    scaledWidths = loadedImgs.map(img => Math.round(rowH * (img.width / img.height)));
    totalWidth = scaledWidths.reduce((sum, w, i) => sum + w + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  } else {
    totalWidth = sizes.reduce((sum, s, i) => sum + s.w + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  }

  const items: LayoutItem[] = [];
  let x = spacing;

  loadedImgs.forEach((_img, i) => {
    const w = fit ? scaledWidths[i] : sizes[i].w;
    const h = fit ? maxHeight - 2 * spacing : sizes[i].h;
    const y = fit ? spacing : spacing + (maxHeight - 2 * spacing - h) / 2;
    items.push({ x, y, w, h, imageIndex: i });
    x += w + spacing;
  });

  return {
    canvasWidth: totalWidth,
    canvasHeight: maxHeight,
    items
  };
}

export function layoutSingleColumn(
  loadedImgs: ImageBitmap[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
): LayoutResult {
  const maxWidth = Math.max(...sizes.map(s => s.w)) + 2 * spacing;
  let totalHeight;
  let scaledHeights: number[] = [];

  if (fit) {
    // All images get width = maxWidth - 2*spacing, height by aspect ratio
    const colW = maxWidth - 2 * spacing;
    scaledHeights = loadedImgs.map(img => Math.round(colW * (img.height / img.width)));
    totalHeight = scaledHeights.reduce((sum, h, i) => sum + h + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  } else {
    totalHeight = sizes.reduce((sum, s, i) => sum + s.h + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  }

  const items: LayoutItem[] = [];
  let y = spacing;

  loadedImgs.forEach((_img, i) => {
    if (fit) {
      const colW = maxWidth - 2 * spacing;
      const h = scaledHeights[i];
      items.push({ x: (maxWidth - colW) / 2, y, w: colW, h, imageIndex: i });
      y += h + spacing;
    } else {
      const x = (maxWidth - 2 * spacing - sizes[i].w) / 2 + spacing;
      items.push({ x, y, w: sizes[i].w, h: sizes[i].h, imageIndex: i });
      y += sizes[i].h + spacing;
    }
  });

  return {
    canvasWidth: maxWidth,
    canvasHeight: totalHeight,
    items
  };
}

export function layoutGrid(
  loadedImgs: ImageBitmap[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false,
  justify: boolean = false
): LayoutResult {
  // Make a square-ish grid
  const n = loadedImgs.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);

  const cellW = Math.max(...sizes.map(s => s.w));
  const cellH = Math.max(...sizes.map(s => s.h));

  const canvasWidth = cols * cellW + (cols - 1) * spacing + 2 * spacing;
  const canvasHeight = rows * cellH + (rows - 1) * spacing + 2 * spacing;

  const items: LayoutItem[] = [];

  // Check if last row is incomplete
  const lastRowItems = n % cols;
  const hasIncompleteLastRow = lastRowItems > 0 && lastRowItems < cols;

  for (let i = 0; i < n; ++i) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const isLastRow = row === rows - 1;

    // For justified layout with incomplete last row, stretch items to fill width
    if (justify && hasIncompleteLastRow && isLastRow) {
      const lastRowCount = lastRowItems;
      const availableWidth = canvasWidth - 2 * spacing;
      const totalSpacing = (lastRowCount - 1) * spacing;
      const itemWidth = (availableWidth - totalSpacing) / lastRowCount;

      const x = col * (itemWidth + spacing) + spacing;
      const y = row * (cellH + spacing) + spacing;

      if (fit) {
        items.push({ x, y, w: itemWidth, h: cellH, imageIndex: i });
      } else {
        // Center image in stretched cell
        const imgW = sizes[i].w;
        const imgH = sizes[i].h;
        const cx = x + (itemWidth - imgW) / 2;
        const cy = y + (cellH - imgH) / 2;
        items.push({ x: cx, y: cy, w: imgW, h: imgH, imageIndex: i });
      }
    } else {
      // Normal grid cell
      const x = col * (cellW + spacing) + spacing;
      const y = row * (cellH + spacing) + spacing;

      if (fit) {
        items.push({ x, y, w: cellW, h: cellH, imageIndex: i });
      } else {
        const imgW = sizes[i].w;
        const imgH = sizes[i].h;
        const cx = x + (cellW - imgW) / 2;
        const cy = y + (cellH - imgH) / 2;
        items.push({ x: cx, y: cy, w: imgW, h: imgH, imageIndex: i });
      }
    }
  }

  return {
    canvasWidth,
    canvasHeight,
    items
  };
}

export function layoutMasonry(
  loadedImgs: ImageBitmap[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false,
  justify: boolean = false
): LayoutResult {
  // Simple masonry: assign each image to the shortest column
  const n = loadedImgs.length;
  const cols = Math.ceil(Math.sqrt(n));
  // Compute colWidths as in non-fit mode
  const colWidths = Array(cols).fill(0).map((_, i) => Math.max(...sizes.filter((_, idx) => idx % cols === i).map(s => s.w), 0));
  // Add spacing to colWidths except last col
  for (let i = 0; i < cols - 1; ++i) colWidths[i] += spacing;
  const colHeights = Array(cols).fill(0);
  const items: LayoutItem[] = [];
  const itemCols: number[] = [];
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
      drawH = Math.round(drawW * (loadedImgs[i].height / loadedImgs[i].width));
    }
    items.push({ x: x + spacing, y: y + spacing, w: drawW, h: drawH, imageIndex: i });
    colHeights[minCol] += drawH + (colHeights[minCol] > 0 ? spacing : 0);
    itemCols[i] = minCol;
  }
  const baseCanvasWidth = colWidths.reduce((a, b) => a + b, 0) + 2 * spacing;
  const baseCanvasHeight = Math.max(...colHeights) + 2 * spacing;

  if (!justify || n === 0) {
    return { canvasWidth: baseCanvasWidth, canvasHeight: baseCanvasHeight, items };
  }

  const maxColHeight = Math.max(...colHeights, 0);
  const colItems: number[][] = Array.from({ length: cols }, () => []);
  items.forEach((_it, idx) => colItems[itemCols[idx]].push(idx));

  const colMaxW: number[] = Array(cols).fill(0);
  const newItems: Partial<LayoutItem>[] = Array(n);

  for (let c = 0; c < cols; c++) {
    const indices = colItems[c];
    if (indices.length === 0) continue;
    const gaps = Math.max(0, indices.length - 1) * spacing;
    const totalH = indices.reduce((sum, idx) => sum + items[idx].h, 0);
    const factor = totalH > 0 ? (maxColHeight - gaps) / totalH : 1;

    let yCursor = spacing;
    for (const idx of indices) {
      const src = items[idx];
      const w = src.w * factor;
      const h = src.h * factor;
      newItems[idx] = { w, h, y: yCursor };
      yCursor += h + spacing;
      colMaxW[c] = Math.max(colMaxW[c], w);
    }
  }

  const colOffsets: number[] = [];
  let xCursor = spacing;
  for (let c = 0; c < cols; c++) {
    colOffsets[c] = xCursor;
    xCursor += (colMaxW[c] || 0) + spacing;
  }

  const justifiedItems: LayoutItem[] = items.map((item, idx) => {
    const col = itemCols[idx];
    const ni = newItems[idx]!;
    const colWidth = colMaxW[col] || item.w;
    const x = colOffsets[col] + (colWidth - ni.w!) / 2;
    return {
      x,
      y: ni.y!,
      w: ni.w!,
      h: ni.h!,
      imageIndex: item.imageIndex,
    };
  });

  const canvasWidth = Math.max(xCursor, baseCanvasWidth);
  const canvasHeight = Math.max(maxColHeight + spacing, baseCanvasHeight);

  return { canvasWidth, canvasHeight, items: justifiedItems };
}

// Horizontal masonry: assigns images to the shortest row (lane)
export function layoutLanes(
  loadedImgs: ImageBitmap[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false,
  justify: boolean = false
): LayoutResult {
  const n = loadedImgs.length;
  if (n === 0) return { canvasWidth: 0, canvasHeight: 0, items: [] };

  const rows = Math.max(1, Math.ceil(Math.sqrt(n)));
  const assignments: { i: number; row: number }[] = [];
  const rowHeights = Array(rows).fill(0);
  const rowWidths = Array(rows).fill(0);
  const itemRows: number[] = Array(n);

  // First pass: assign items to rows with least current width; track row max heights
  for (let i = 0; i < n; i++) {
    let targetRow = 0;
    for (let r = 1; r < rows; r++) {
      if (rowWidths[r] < rowWidths[targetRow]) targetRow = r;
    }
    assignments.push({ i, row: targetRow });
    itemRows[i] = targetRow;
    const heightCandidate = sizes[i].h;
    rowHeights[targetRow] = Math.max(rowHeights[targetRow], heightCandidate);
    // optimistic width tracking for tie-breaking; precise widths handled in second pass
    rowWidths[targetRow] += sizes[i].w + (rowWidths[targetRow] > 0 ? spacing : 0);
  }

  // Compute row Y offsets using finalized row heights
  const rowOffsets: number[] = [];
  let yCursor = spacing;
  for (let r = 0; r < rows; r++) {
    rowOffsets[r] = yCursor;
    yCursor += rowHeights[r] + spacing;
  }

  // Second pass: place items with final row heights and recompute widths per lane
  const laneWidths = Array(rows).fill(0);
  const items: LayoutItem[] = Array(n);

  for (const { i, row } of assignments) {
    const aspect = loadedImgs[i].width / loadedImgs[i].height;
    const h = fit ? rowHeights[row] : sizes[i].h;
    const w = fit ? Math.round(h * aspect) : sizes[i].w;
    const x = spacing + laneWidths[row];
    const y = rowOffsets[row];
    items[i] = { x, y, w, h, imageIndex: i };
    laneWidths[row] += w + spacing;
  }

  const baseCanvasWidth = Math.max(...laneWidths, 0) + spacing;
  const baseCanvasHeight = yCursor;

  if (!justify) {
    return { canvasWidth: baseCanvasWidth, canvasHeight: baseCanvasHeight, items };
  }

  const maxRowWidth = Math.max(...laneWidths, 0);
  const rowItems: number[][] = Array.from({ length: rows }, () => []);
  items.forEach((_it, idx) => rowItems[itemRows[idx]].push(idx));

  const rowMaxH: number[] = Array(rows).fill(0);
  const newItems: Partial<LayoutItem>[] = Array(n);

  for (let r = 0; r < rows; r++) {
    const indices = rowItems[r];
    if (indices.length === 0) continue;
    const gaps = indices.length * spacing;
    const totalW = indices.reduce((sum, idx) => sum + items[idx].w, 0);
    const factor = totalW > 0 ? (maxRowWidth - gaps) / totalW : 1;

    let xCursor = spacing;
    for (const idx of indices) {
      const src = items[idx];
      const w = src.w * factor;
      const h = src.h * factor;
      newItems[idx] = { w, h, x: xCursor };
      xCursor += w + spacing;
      rowMaxH[r] = Math.max(rowMaxH[r], h);
    }
  }

  const rowOffsetsJustified: number[] = [];
  let yCursorJustified = spacing;
  for (let r = 0; r < rows; r++) {
    rowOffsetsJustified[r] = yCursorJustified;
    yCursorJustified += (rowMaxH[r] || 0) + spacing;
  }

  const justifiedItems: LayoutItem[] = items.map((item, idx) => {
    const row = itemRows[idx];
    const ni = newItems[idx]!;
    const rowHeight = rowMaxH[row] || item.h;
    const y = rowOffsetsJustified[row] + (rowHeight - ni.h!) / 2;
    return {
      x: ni.x!,
      y,
      w: ni.w!,
      h: ni.h!,
      imageIndex: item.imageIndex,
    };
  });

  const canvasWidth = Math.max(maxRowWidth + spacing, baseCanvasWidth);
  const canvasHeight = Math.max(yCursorJustified, baseCanvasHeight);

  return { canvasWidth, canvasHeight, items: justifiedItems };
}

// Bubble layout: squarify images, seed in a circle, then relax with separation + gentle clustering
export function layoutBubble(
  _loadedImgs: ImageBitmap[],
  sizes: { w: number, h: number }[],
  spacing: number = 0
): LayoutResult {
  const n = sizes.length;
  if (n === 0) return { canvasWidth: 0, canvasHeight: 0, items: [] };

  const bubbles = sizes.map((s, i) => {
    const side = Math.min(s.w, s.h);
    return { i, side, r: side / 2, x: 0, y: 0 };
  }).sort((a, b) => b.side - a.side);

  // Initial circular placement (slightly staggered radius to reduce perfect overlap)
  const angleStep = (Math.PI * 2) / n;
  const baseRadius = bubbles[0].r + spacing;
  bubbles.forEach((b, idx) => {
    const theta = idx * angleStep;
    const jitter = 1 + (idx % 3) * 0.05;
    const radius = baseRadius * jitter + idx * 0.15 * spacing;
    b.x = Math.cos(theta) * radius;
    b.y = Math.sin(theta) * radius;
  });

  // Relax positions: repel overlaps, gently pull toward center to keep a cluster
  const iterations = 220;
  const pad = spacing; // treat spacing as desired padding between circles
  for (let iter = 0; iter < iterations; iter++) {
    // Pairwise separation
    for (let a = 0; a < n; a++) {
      for (let bIdx = a + 1; bIdx < n; bIdx++) {
        const A = bubbles[a];
        const B = bubbles[bIdx];
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        let dist = Math.hypot(dx, dy);
        const minDist = A.r + B.r + pad;
        if (dist === 0) {
          dx = 0.01;
          dy = 0;
          dist = 0.01;
        }
        if (dist < minDist) {
          const overlap = minDist - dist;
          const push = overlap / dist * 0.5;
          const ox = dx * push;
          const oy = dy * push;
          A.x -= ox;
          A.y -= oy;
          B.x += ox;
          B.y += oy;
        }
      }
    }

    // Gentle attraction toward origin to keep cluster tight
    const pull = 0.02;
    for (const b of bubbles) {
      b.x *= (1 - pull);
      b.y *= (1 - pull);
    }
  }

  // Compute bounds and shift to positive space with padding
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of bubbles) {
    minX = Math.min(minX, b.x - b.r);
    minY = Math.min(minY, b.y - b.r);
    maxX = Math.max(maxX, b.x + b.r);
    maxY = Math.max(maxY, b.y + b.r);
  }

  const offsetX = -minX + spacing;
  const offsetY = -minY + spacing;
  const canvasWidth = (maxX - minX) + spacing * 2;
  const canvasHeight = (maxY - minY) + spacing * 2;

  const items: LayoutItem[] = bubbles.map(b => ({
    x: b.x - b.r + offsetX,
    y: b.y - b.r + offsetY,
    w: b.side,
    h: b.side,
    imageIndex: b.i,
  }));

  // Restore original order to preserve image sequence
  items.sort((a, b) => a.imageIndex - b.imageIndex);

  return { canvasWidth, canvasHeight, items, fit: true };
}

// Maximal rectangles bin-packing: place images in any available gap, splitting gaps as needed
// Blackpawn binary tree rectangle packing algorithm
export function layoutPacked(
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  justify: boolean = false
): LayoutResult {
  // Estimate bin width and height
  const totalArea = sizes.reduce((a, s) => a + s.w * s.h, 0);
  const maxW = Math.max(...sizes.map(s => s.w));
  const maxH = Math.max(...sizes.map(s => s.h));
  let binW = Math.max(Math.ceil(Math.sqrt(totalArea)), maxW);
  let binH = Math.max(Math.ceil(totalArea / binW), maxH);
  // Add spacing to bin size
  binW += spacing * 2;
  binH += spacing * 2;

  // Node structure for binary tree
  type Node = { x: number, y: number, w: number, h: number, used: boolean, down: Node | null, right: Node | null, imgIdx: number | null };
  function makeNode(x: number, y: number, w: number, h: number): Node {
    return { x, y, w, h, used: false, down: null, right: null, imgIdx: null };
  }

  // Insert function as per Blackpawn
  function insert(node: Node, w: number, h: number, idx: number): { x: number, y: number } | null {
    if (node.used) {
      // Try right then down
      return insert(node.right!, w, h, idx) || insert(node.down!, w, h, idx);
    } else if (w <= node.w && h <= node.h) {
      // Fits, split node
      node.used = true;
      node.imgIdx = idx;
      node.down = makeNode(node.x, node.y + h + spacing, node.w, node.h - h - spacing);
      node.right = makeNode(node.x + w + spacing, node.y, node.w - w - spacing, h);
      return { x: node.x, y: node.y };
    } else {
      return null;
    }
  }

  // Pack images largest-first to reduce fragmentation
  const order = sizes.map((s, i) => ({ i, w: s.w, h: s.h, key: Math.max(s.w, s.h), area: s.w * s.h }))
    .sort((a, b) => b.key - a.key || b.area - a.area);

  // Try to pack all images, grow bin if needed
  const placements = Array(sizes.length);
  let success = false;
  let growTries = 0;
  let root: Node | null = null;
  while (!success && growTries < 10) {
    // Reset tree
    root = makeNode(spacing, spacing, binW - 2 * spacing, binH - 2 * spacing);
    let failed = false;
    for (let k = 0; k < order.length; ++k) {
      const { w, h, i } = order[k];
      const pos = insert(root, w, h, i);
      if (!pos) {
        failed = true;
        break;
      }
      placements[i] = pos;
    }
    if (failed) {
      // Grow bin: try to grow width or height
      if (binW <= binH) binW = Math.round(binW * 1.2);
      else binH = Math.round(binH * 1.2);
      growTries++;
    } else {
      success = true;
    }
  }
  // Build items array
  const items: LayoutItem[] = sizes.map((size, i) => ({
    x: placements[i].x,
    y: placements[i].y,
    w: size.w,
    h: size.h,
    imageIndex: i
  }));
  if (!justify || !root) return { canvasWidth: binW, canvasHeight: binH, items };

  // Recursively scale each occupied node subtree to fill its region while preserving spacing boundaries
  function justifyNode(node: Node): { minX: number, maxX: number, minY: number, maxY: number } | null {
    // Post-order: collect child boxes and indices
    const childBBoxes: Array<{ minX: number, maxX: number, minY: number, maxY: number }> = [];
    const childIndices: number[] = [];
    const rightBox = node.right ? justifyNode(node.right) : null;
    const downBox = node.down ? justifyNode(node.down) : null;
    if (rightBox) childBBoxes.push(rightBox);
    if (downBox) childBBoxes.push(downBox);
    if (node.right && node.right.imgIdx !== null) childIndices.push(node.right.imgIdx);
    if (node.down && node.down.imgIdx !== null) childIndices.push(node.down.imgIdx);

    if (node.imgIdx !== null) childIndices.push(node.imgIdx);

    const selfBox = node.imgIdx !== null ? (() => {
      const it = items[node.imgIdx];
      return { minX: it.x, maxX: it.x + it.w, minY: it.y, maxY: it.y + it.h };
    })() : null;

    const bbox = [...childBBoxes, ...(selfBox ? [selfBox] : [])].reduce<{ minX: number, maxX: number, minY: number, maxY: number } | null>((acc, b) => {
      if (!acc) return { ...b };
      return {
        minX: Math.min(acc.minX, b.minX),
        maxX: Math.max(acc.maxX, b.maxX),
        minY: Math.min(acc.minY, b.minY),
        maxY: Math.max(acc.maxY, b.maxY),
      };
    }, null);

    if (!bbox) return null;

    // If this subtree has exactly one image, stretch it to fill the node region
    const totalImages = childIndices.length;
    if (totalImages === 1 && node.imgIdx !== null) {
      const idx = node.imgIdx;
      items[idx] = {
        ...items[idx],
        x: node.x,
        y: node.y,
        w: node.w,
        h: node.h,
      };
      return { minX: node.x, maxX: node.x + node.w, minY: node.y, maxY: node.y + node.h };
    }

    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    const scaleX = width > 0 ? node.w / width : 1;
    const scaleY = height > 0 ? node.h / height : 1;

    function applyScale(n: Node) {
      if (n.imgIdx !== null) {
        const it = items[n.imgIdx];
        items[n.imgIdx] = {
          ...it,
          x: node.x + (it.x - bbox!.minX) * scaleX,
          y: node.y + (it.y - bbox!.minY) * scaleY,
          w: it.w * scaleX,
          h: it.h * scaleY,
        };
      }
      if (n.right) applyScale(n.right);
      if (n.down) applyScale(n.down);
    }

    applyScale(node);
    // Return the actual occupied bbox after scaling, not the full node, so ancestors can expand if needed
    const scaledMinX = node.x + (bbox.minX - bbox.minX) * scaleX;
    const scaledMaxX = node.x + (bbox.maxX - bbox.minX) * scaleX;
    const scaledMinY = node.y + (bbox.minY - bbox.minY) * scaleY;
    const scaledMaxY = node.y + (bbox.maxY - bbox.minY) * scaleY;
    return { minX: scaledMinX, maxX: scaledMaxX, minY: scaledMinY, maxY: scaledMaxY };
  }

  // First pass: recursively fill each node region
  justifyNode(root);

  // Second pass: ensure the whole occupied bbox fills the interior of the bin (preserve outer spacing)
  const occMinX = Math.min(...items.map(it => it.x), spacing);
  const occMaxX = Math.max(...items.map(it => it.x + it.w), spacing);
  const occMinY = Math.min(...items.map(it => it.y), spacing);
  const occMaxY = Math.max(...items.map(it => it.y + it.h), spacing);
  const occW = occMaxX - occMinX;
  const occH = occMaxY - occMinY;
  const targetW = binW - spacing * 2;
  const targetH = binH - spacing * 2;
  const scaleX = occW > 0 ? targetW / occW : 1;
  const scaleY = occH > 0 ? targetH / occH : 1;

  const globallyScaled = items.map(it => ({
    x: spacing + (it.x - occMinX) * scaleX,
    y: spacing + (it.y - occMinY) * scaleY,
    w: it.w * scaleX,
    h: it.h * scaleY,
    imageIndex: it.imageIndex,
  }));

  return { canvasWidth: binW, canvasHeight: binH, items: globallyScaled };
}

// Radial-masonry, constraint-driven greedy packing for organic collage
export function layoutRadialMasonry(
  sizes: { w: number, h: number }[],
  spacing: number = 0
): LayoutResult {
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
  const canvasWidth = maxX - minX + 2 * spacing;
  const canvasHeight = maxY - minY + 2 * spacing;
  const items: LayoutItem[] = placements.map(p => ({
    x: p.x + offsetX + spacing,
    y: p.y + offsetY + spacing,
    w: sizes[p.i].w,
    h: sizes[p.i].h,
    imageIndex: p.i
  }));
  return { canvasWidth, canvasHeight, items };
}

// Produces a layout like the attached image: a grid of rectangles, some spanning multiple rows/columns, filling the canvas.
// Squarified Treemap: arranges rectangles to be as square as possible
// Sorts by size and arranges in rows, minimizing aspect ratios
export function layoutSquarified(
  sizes: { w: number, h: number }[],
  spacing: number = 0
): LayoutResult {
  // Compute total area and estimate canvas size
  const totalArea = sizes.reduce((sum, s) => sum + s.w * s.h, 0);
  const avgAspect = sizes.reduce((sum, s) => sum + (s.w / s.h), 0) / sizes.length;
  let canvasH = Math.sqrt(totalArea / avgAspect);
  let canvasW = avgAspect * canvasH;
  canvasW = Math.round(canvasW);
  canvasH = Math.round(canvasH);

  // Sort images by area (descending)
  const indexed = sizes.map((s, i) => ({ ...s, i, area: s.w * s.h, x: 0, y: 0, rw: 0, rh: 0 }));
  indexed.sort((a, b) => b.area - a.area);

  // Helper: calculate worst aspect ratio in a row given the width
  function worst(row: typeof indexed, width: number): number {
    if (row.length === 0 || width === 0) return Infinity;
    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    const rowHeight = rowArea / width;
    let maxAspect = 0;
    for (const item of row) {
      const itemW = item.area / rowHeight;
      const aspect = Math.max(itemW / rowHeight, rowHeight / itemW);
      maxAspect = Math.max(maxAspect, aspect);
    }
    return maxAspect;
  }

  // Squarify recursive algorithm with proper remaining space tracking
  function squarify(items: typeof indexed, x: number, y: number, w: number, h: number) {
    if (items.length === 0) return;

    // Base case: single item fills the space
    if (items.length === 1) {
      items[0].x = x;
      items[0].y = y;
      items[0].rw = w;
      items[0].rh = h;
      return;
    }

    // Determine if we should layout horizontally or vertically
    const useVertical = w > h;

    // Find best row/column
    let bestRow: typeof indexed = [];
    let bestIdx = 0;

    if (useVertical) {
      // Layout as a vertical strip (row)
      const stripWidth = w;
      for (let i = 1; i <= items.length; i++) {
        const row = items.slice(0, i);
        const rowWorst = worst(row, stripWidth);

        if (i === 1) {
          bestRow = row;
          bestIdx = i;
        } else {
          const prevWorst = worst(items.slice(0, i - 1), stripWidth);
          if (rowWorst < prevWorst) {
            bestRow = row;
            bestIdx = i;
          } else {
            break; // Aspect ratio got worse, use previous
          }
        }
      }

      // Layout the row
      const rowArea = bestRow.reduce((sum, item) => sum + item.area, 0);
      const rowHeight = rowArea / stripWidth;
      let currentX = x;
      for (const item of bestRow) {
        const itemW = item.area / rowHeight;
        item.x = currentX;
        item.y = y;
        item.rw = itemW - spacing;
        item.rh = rowHeight - spacing;
        currentX += itemW;
      }

      // Recurse on remaining items
      const remaining = items.slice(bestIdx);
      if (remaining.length > 0) {
        squarify(remaining, x, y + rowHeight, w, h - rowHeight);
      }
    } else {
      // Layout as a horizontal strip (column)
      const stripHeight = h;
      for (let i = 1; i <= items.length; i++) {
        const col = items.slice(0, i);
        const colArea = col.reduce((sum, item) => sum + item.area, 0);
        const colWidth = colArea / stripHeight;

        // Calculate worst aspect for this column
        let colWorst = 0;
        for (const item of col) {
          const itemH = item.area / colWidth;
          const aspect = Math.max(colWidth / itemH, itemH / colWidth);
          colWorst = Math.max(colWorst, aspect);
        }

        if (i === 1) {
          bestRow = col;
          bestIdx = i;
        } else {
          const prevCol = items.slice(0, i - 1);
          const prevColArea = prevCol.reduce((sum, item) => sum + item.area, 0);
          const prevColWidth = prevColArea / stripHeight;
          let prevWorst = 0;
          for (const item of prevCol) {
            const itemH = item.area / prevColWidth;
            const aspect = Math.max(prevColWidth / itemH, itemH / prevColWidth);
            prevWorst = Math.max(prevWorst, aspect);
          }

          if (colWorst < prevWorst) {
            bestRow = col;
            bestIdx = i;
          } else {
            break;
          }
        }
      }

      // Layout the column
      const colArea = bestRow.reduce((sum, item) => sum + item.area, 0);
      const colWidth = colArea / stripHeight;
      let currentY = y;
      for (const item of bestRow) {
        const itemH = item.area / colWidth;
        item.x = x;
        item.y = currentY;
        item.rw = colWidth - spacing;
        item.rh = itemH - spacing;
        currentY += itemH;
      }

      // Recurse on remaining items
      const remaining = items.slice(bestIdx);
      if (remaining.length > 0) {
        squarify(remaining, x + colWidth, y, w - colWidth, h);
      }
    }
  }

  // Run the squarify algorithm
  const availWidth = canvasW - 2 * spacing;
  const availHeight = canvasH - 2 * spacing;
  squarify(indexed, spacing, spacing, availWidth, availHeight);

  // Adjust canvas size to actual content
  let maxX = 0, maxY = 0;
  for (const item of indexed) {
    maxX = Math.max(maxX, item.x + item.rw);
    maxY = Math.max(maxY, item.y + item.rh);
  }
  canvasW = Math.round(maxX + spacing);
  canvasH = Math.round(maxY + spacing);

  // Build items array with fit/contain calculations
  const items: LayoutItem[] = indexed.map(item => {
    const tileX = item.x;
    const tileY = item.y;
    const tileW = item.rw;
    const tileH = item.rh;

    // For squarified, we apply fit/contain logic in the drawImage function
    // Here we just store the tile bounds
    return {
      x: tileX,
      y: tileY,
      w: tileW,
      h: tileH,
      imageIndex: item.i
    };
  });

  return { canvasWidth: canvasW, canvasHeight: canvasH, items };
}