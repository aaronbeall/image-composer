import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Effect, EffectType } from './App';

export type LayoutType = 'grid' | 'packed' | 'masonry' | 'single-column' | 'single-row' | 'cluster' | 'squarified';

export interface ComposeImageItem {
  src: string;
  label?: string;
  description?: string;
  width?: number;
  height?: number;
}

export interface LayoutOptions {
  spacing?: number; // 0-100, relative to avg image size
  fit?: boolean; // fit option for grid/masonry
  scale?: number;
}

export interface StyleOptions {
  backgroundColor?: string;
  cornerRadius?: number;
  borderEnabled?: boolean;
  borderWidth?: number;
  borderColor?: string;
  shadowEnabled?: boolean;
  shadowAngle?: number;
  shadowDistance?: number;
  shadowBlur?: number;
  shadowColor?: string;
  effects?: Effect[];
}

interface ImageComposerProps extends LayoutOptions, StyleOptions {
  images: ComposeImageItem[];
  normalizeSize: boolean;
  layout: LayoutType;
  onUpdate(info: { width: number; height: number; getImageData: () => string; getImageBlob: () => Promise<Blob | null>; }): void;
  style?: React.CSSProperties;
}

// Utility to load a single image (used with caching below)
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
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

// Layout result types
interface LayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
  imageIndex: number;
}

interface LayoutResult {
  canvasWidth: number;
  canvasHeight: number;
  items: LayoutItem[];
}

export const ImageComposer: React.FC<ImageComposerProps> = ({ images, normalizeSize, layout, spacing = 0, fit = false, scale = 1, backgroundColor = 'transparent', cornerRadius = 0, borderEnabled = false, borderWidth = 0, borderColor = '#ffffff', shadowEnabled = false, shadowAngle = 0, shadowDistance = 0, shadowBlur = 0, shadowColor = '#000000', effects = [], style, onUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[] | null>(null);
  // Phase 1: load images (with caching)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!images.length) {
        setLoadedImages([]);
        return;
      }
      const cache = imageCacheRef.current;
      const loadedImgs = await Promise.all(images.map(async img => {
        const cached = cache.get(img.src);
        if (cached) return cached;
        const loaded = await loadImage(img.src);
        cache.set(img.src, loaded);
        return loaded;
      }));
      if (cancelled) return;
      setLoadedImages(loadedImgs);
    };
    load();
    return () => { cancelled = true; };
  }, [images]);

  // Phase 2: compute layout (memoized) when images or layout inputs change
  const layoutResult = useMemo(() => {
    if (!loadedImages || !loadedImages.length || loadedImages.length !== images.length) return null;

    let norm = { width: 0, height: 0 };
    if (normalizeSize) {
      let mode: NormalizeMode = 'both';
      if (layout === 'single-row') mode = 'height';
      else if (layout === 'single-column' || layout === 'masonry') mode = 'width';
      norm = getNormalizedSize(loadedImages, mode);
    }

    const sizes = loadedImages.map(img => {
      let w = img.naturalWidth, h = img.naturalHeight;
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
      return { w: w * scale, h: h * scale };
    });

    const avgW = sizes.reduce((a, s) => a + s.w, 0) / sizes.length;
    const avgH = sizes.reduce((a, s) => a + s.h, 0) / sizes.length;
    const spacingFrac = spacing / 100 * 0.2;
    const spacingPx = Math.round(spacingFrac * ((avgW + avgH) / 2));

    switch (layout) {
      case 'single-row':
        return layoutSingleRow(loadedImages, sizes, spacingPx, fit);
      case 'single-column':
        return layoutSingleColumn(loadedImages, sizes, spacingPx, fit);
      case 'grid':
        return layoutGrid(loadedImages, sizes, spacingPx, fit);
      case 'masonry':
        return layoutMasonry(loadedImages, sizes, spacingPx, fit);
      case 'packed':
        return layoutPacked(sizes, spacingPx);
      case 'cluster':
        return layoutRadialMasonry(sizes, spacingPx);
      case 'squarified':
        return layoutSquarified(sizes, spacingPx);
      default:
        return { canvasWidth: 800, canvasHeight: 600, items: [] } as LayoutResult;
    }
  }, [loadedImages, images, normalizeSize, layout, spacing, fit, scale]);

  // Phase 3: draw composition when layout or style changes
  useEffect(() => {
    if (!layoutResult || !loadedImages || loadedImages.length !== images.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawComposition(ctx, layoutResult, images, loadedImages, fit, backgroundColor, cornerRadius, borderEnabled, borderWidth, borderColor, shadowEnabled, shadowAngle, shadowDistance, shadowBlur, shadowColor, effects);

    onUpdate({
      width: canvas.width,
      height: canvas.height,
      getImageData: () => canvas.toDataURL('image/png'),
      getImageBlob: () => new Promise(resolve => canvas.toBlob(resolve, 'image/png')),
    });
  }, [layoutResult, loadedImages, images, fit, backgroundColor, cornerRadius, borderEnabled, borderWidth, borderColor, shadowEnabled, shadowAngle, shadowDistance, shadowBlur, shadowColor, effects, onUpdate]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        border: '1px solid #444',
        background: '#222',
        display: 'block',
        objectFit: 'contain',
        ...style,
      }}
    />
  );
};


// --- Drawing functions ---
function drawComposition(
  ctx: CanvasRenderingContext2D,
  layout: LayoutResult,
  images: ComposeImageItem[],
  loadedImgs: HTMLImageElement[],
  fit: boolean,
  backgroundColor: string,
  cornerRadius: number = 0,
  borderEnabled: boolean = false,
  borderWidth: number = 0,
  borderColor: string = '#ffffff',
  shadowEnabled: boolean = false,
  shadowAngle: number = 0,
  shadowDistance: number = 0,
  shadowBlur: number = 0,
  shadowColor: string = '#000000',
  effects: Effect[] = []
) {
  // Set canvas size
  ctx.canvas.width = layout.canvasWidth;
  ctx.canvas.height = layout.canvasHeight;

  // Fill background
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (backgroundColor && backgroundColor !== 'transparent') {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  const minItemSize = layout.items.length ? Math.min(...layout.items.map(i => Math.min(i.w, i.h))) : 0;
  const cornerRadiusPx = cornerRadius > 0 && minItemSize > 0 ? (cornerRadius / 100) * (minItemSize / 2) : 0;

  const avgItemSize = layout.items.length ? (layout.items.reduce((sum, i) => sum + Math.min(i.w, i.h), 0) / layout.items.length) : 0;

  // Build style objects for drawing
  const border = borderEnabled && borderWidth > 0 && avgItemSize > 0
    ? {
      color: borderColor,
      width: (borderWidth / 100) * (avgItemSize * 0.1)
    }
    : undefined;

  const dropShadow = shadowEnabled && (shadowDistance > 0 || shadowBlur > 0) && avgItemSize > 0
    ? (() => {
      const shadowDistancePx = (shadowDistance / 100) * (avgItemSize * 0.2);
      const shadowBlurPx = (shadowBlur / 100) * (avgItemSize * 0.2);
      const angleRad = (shadowAngle * Math.PI) / 180;
      return {
        color: shadowColor,
        offsetX: shadowDistancePx * Math.cos(angleRad),
        offsetY: shadowDistancePx * Math.sin(angleRad),
        blur: shadowBlurPx
      };
    })()
    : undefined;

  // Draw each image
  for (const item of layout.items) {
    drawImage(ctx, item, images[item.imageIndex], loadedImgs[item.imageIndex], fit, cornerRadiusPx, border, dropShadow, effects);
  }
}

// Helper to draw shape path (rounded rectangle or simple rectangle)
function drawShapePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadiusPx: number
) {
  if (cornerRadiusPx > 0) {
    const maxRadius = Math.min(w, h) / 2;
    const radiusPx = Math.min(cornerRadiusPx, maxRadius);

    ctx.moveTo(x + radiusPx, y);
    ctx.lineTo(x + w - radiusPx, y);
    ctx.arcTo(x + w, y, x + w, y + radiusPx, radiusPx);
    ctx.lineTo(x + w, y + h - radiusPx);
    ctx.arcTo(x + w, y + h, x + w - radiusPx, y + h, radiusPx);
    ctx.lineTo(x + radiusPx, y + h);
    ctx.arcTo(x, y + h, x, y + h - radiusPx, radiusPx);
    ctx.lineTo(x, y + radiusPx);
    ctx.arcTo(x, y, x + radiusPx, y, radiusPx);
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
}

// Pixel processor functions
function applyGrain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  intensity: number,
  blendMode: string = 'overlay'
) {
  const noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = Math.max(1, Math.floor(w));
  noiseCanvas.height = Math.max(1, Math.floor(h));
  const nctx = noiseCanvas.getContext('2d');
  if (!nctx) return;

  const imageData = nctx.createImageData(noiseCanvas.width, noiseCanvas.height);
  const data = imageData.data;
  const alpha = Math.max(0, Math.min(100, intensity)) / 100 * 64; // up to ~25% opacity

  for (let i = 0; i < data.length; i += 4) {
    const value = Math.random() < 0.5 ? 0 : 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = alpha;
  }

  nctx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
  ctx.drawImage(noiseCanvas, x, y, w, h);
  ctx.restore();
}

function applyVignette(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, intensity: number, blendMode: string = 'overlay') {
  ctx.save();

  const centerX = x + w / 2;
  const centerY = y + h / 2;
  const maxDist = Math.sqrt(w * w + h * h) / 2;

  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxDist);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity / 100})`);

  ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();

  ctx.restore();
}

function applySharpen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, intensity: number) {
  const strength = intensity / 100;
  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;
  const width = w;
  const height = h;

  // Sharpen kernel
  const kernel = [
    0, -strength, 0,
    -strength, 1 + 4 * strength, -strength,
    0, -strength, 0
  ];

  const output = new Uint8ClampedArray(data);

  for (let py = 1; py < height - 1; py++) {
    for (let px = 1; px < width - 1; px++) {
      let r = 0, g = 0, b = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((py + ky) * width + (px + kx)) * 4;
          const k = kernel[(ky + 1) * 3 + (kx + 1)];
          r += data[idx] * k;
          g += data[idx + 1] * k;
          b += data[idx + 2] * k;
        }
      }

      const outIdx = (py * width + px) * 4;
      output[outIdx] = Math.max(0, Math.min(255, r));
      output[outIdx + 1] = Math.max(0, Math.min(255, g));
      output[outIdx + 2] = Math.max(0, Math.min(255, b));
    }
  }

  ctx.putImageData(new ImageData(output, width, height), x, y);
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  item: LayoutItem,
  imageData: ComposeImageItem,
  img: HTMLImageElement,
  fit: boolean,
  cornerRadiusPx: number = 0,
  border?: { color: string, width: number },
  dropShadow?: { color: string, offsetX: number, offsetY: number, blur: number },
  effects: Effect[] = []
) {
  const { x, y, w, h } = item;

  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  let dx = x, dy = y, dw = w, dh = h;

  if (fit) {
    // Cover: scale and crop to fill tile
    const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
    sw = dw / scale;
    sh = dh / scale;
    sx = (img.naturalWidth - sw) / 2;
    sy = (img.naturalHeight - sh) / 2;
  } else {
    // Contain: scale to fit inside tile and center
    const scale = Math.min(dw / img.naturalWidth, dh / img.naturalHeight);
    dw = img.naturalWidth * scale;
    dh = img.naturalHeight * scale;
    dx = x + (w - dw) / 2;
    dy = y + (h - dh) / 2;
  }

  // Draw shadow first if needed (before clipping)
  if (dropShadow) {
    ctx.save();
    ctx.shadowColor = dropShadow.color;
    ctx.shadowBlur = dropShadow.blur;
    ctx.shadowOffsetX = dropShadow.offsetX;
    ctx.shadowOffsetY = dropShadow.offsetY;

    ctx.beginPath();
    drawShapePath(ctx, x, y, w, h, cornerRadiusPx);
    ctx.fillStyle = 'black'; // Color doesn't matter, shadow will show
    ctx.fill();
    ctx.restore();
  }

  // Clip and draw image with effects
  ctx.save();

  // Separate CSS filters from pixel processors
  const cssFilters = [];
  const pixelProcessors = [];

  if (effects.length > 0) {
    for (const effect of effects) {
      switch (effect.type) {
        case 'blur':
          cssFilters.push(`blur(${effect.value}px)`);
          break;
        case 'brightness':
          cssFilters.push(`brightness(${effect.value}%)`);
          break;
        case 'contrast':
          cssFilters.push(`contrast(${effect.value}%)`);
          break;
        case 'grayscale':
          cssFilters.push(`grayscale(${effect.value}%)`);
          break;
        case 'hue-rotate':
          cssFilters.push(`hue-rotate(${effect.value}deg)`);
          break;
        case 'invert':
          cssFilters.push(`invert(${effect.value}%)`);
          break;
        case 'saturate':
          cssFilters.push(`saturate(${effect.value}%)`);
          break;
        case 'sepia':
          cssFilters.push(`sepia(${effect.value}%)`);
          break;
        case 'grain':
        case 'vignette':
        case 'sharpen':
        case 'bloom':
          pixelProcessors.push(effect);
          break;
      }
    }

    if (cssFilters.length > 0) {
      ctx.filter = cssFilters.join(' ');
    }
  }

  ctx.beginPath();
  drawShapePath(ctx, x, y, w, h, cornerRadiusPx);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

  // Apply pixel processors after drawing the image
  for (const effect of pixelProcessors) {
    switch (effect.type) {
      case 'grain':
        applyGrain(ctx, x, y, dw, dh, effect.value, effect.blendMode ?? 'overlay');
        break;
      case 'vignette':
        applyVignette(ctx, x, y, dw, dh, effect.value, effect.blendMode ?? 'overlay');
        break;
      case 'sharpen':
        applySharpen(ctx, x, y, dw, dh, effect.value);
        break;
      case 'bloom': {
        const amount = Math.max(0, Math.min(100, effect.value)) / 100;
        const blurPx = Math.max(0, effect.blur ?? 10);
        const blendMode = effect.blendMode ?? 'overlay';
        ctx.save();
        ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
        ctx.globalAlpha = amount;
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        ctx.restore();
        break;
      }
    }
  }

  ctx.restore();

  // Draw border if needed
  if (border && border.width > 0) {
    ctx.save();
    ctx.strokeStyle = border.color;
    ctx.lineWidth = border.width;

    if (cornerRadiusPx > 0) {
      ctx.beginPath();
      drawShapePath(ctx, x, y, w, h, cornerRadiusPx);
      ctx.stroke();
    } else {
      // Simple rectangular border with offset for stroke width
      ctx.strokeRect(x + border.width / 2, y + border.width / 2, w - border.width, h - border.width);
    }
    ctx.restore();
  }

  // Draw label and description
  if (imageData.label) {
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(imageData.label, x + 4, y + 16);
  }
  if (imageData.description) {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(imageData.description, x + 4, y + h - 6);
  }
}

// --- Layout functions ---
function layoutSingleRow(
  loadedImgs: HTMLImageElement[],
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
    scaledWidths = loadedImgs.map(img => Math.round(rowH * (img.naturalWidth / img.naturalHeight)));
    totalWidth = scaledWidths.reduce((sum, w, i) => sum + w + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  } else {
    totalWidth = sizes.reduce((sum, s, i) => sum + s.w + (i > 0 ? spacing : 0), 0) + 2 * spacing;
  }

  const items: LayoutItem[] = [];
  let x = spacing;

  loadedImgs.forEach((_img, i) => {
    const w = fit ? scaledWidths[i] : sizes[i].w;
    const h = fit ? maxHeight - 2 * spacing : sizes[i].h;
    items.push({ x, y: spacing, w, h, imageIndex: i });
    x += w + spacing;
  });

  return {
    canvasWidth: totalWidth,
    canvasHeight: maxHeight,
    items
  };
}

function layoutSingleColumn(
  loadedImgs: HTMLImageElement[],
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
    scaledHeights = loadedImgs.map(img => Math.round(colW * (img.naturalHeight / img.naturalWidth)));
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

function layoutGrid(
  loadedImgs: HTMLImageElement[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
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

  for (let i = 0; i < n; ++i) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (cellW + spacing) + spacing;
    const y = row * (cellH + spacing) + spacing;

    if (fit) {
      // Fit mode: use full cell dimensions
      items.push({ x, y, w: cellW, h: cellH, imageIndex: i });
    } else {
      // Center image in cell
      const imgW = sizes[i].w;
      const imgH = sizes[i].h;
      const cx = x + (cellW - imgW) / 2;
      const cy = y + (cellH - imgH) / 2;
      items.push({ x: cx, y: cy, w: imgW, h: imgH, imageIndex: i });
    }
  }

  return {
    canvasWidth,
    canvasHeight,
    items
  };
}

function layoutMasonry(
  loadedImgs: HTMLImageElement[],
  sizes: { w: number, h: number }[],
  spacing: number = 0,
  fit: boolean = false
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
    items.push({ x: x + spacing, y: y + spacing, w: drawW, h: drawH, imageIndex: i });
    colHeights[minCol] += drawH + (colHeights[minCol] > 0 ? spacing : 0);
  }
  const canvasWidth = colWidths.reduce((a, b) => a + b, 0) + 2 * spacing;
  const canvasHeight = Math.max(...colHeights) + 2 * spacing;
  return { canvasWidth, canvasHeight, items };
}

// Maximal rectangles bin-packing: place images in any available gap, splitting gaps as needed
// Blackpawn binary tree rectangle packing algorithm
function layoutPacked(
  sizes: { w: number, h: number }[],
  spacing: number = 0
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

  // Try to pack all images, grow bin if needed
  const placements = Array(sizes.length);
  let success = false;
  let growTries = 0;
  while (!success && growTries < 10) {
    // Reset tree
    const root = makeNode(spacing, spacing, binW - 2 * spacing, binH - 2 * spacing);
    let failed = false;
    for (let i = 0; i < sizes.length; ++i) {
      const { w, h } = sizes[i];
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
  return { canvasWidth: binW, canvasHeight: binH, items };
}

// Radial-masonry, constraint-driven greedy packing for organic collage
function layoutRadialMasonry(
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
function layoutSquarified(
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