import React, { useEffect, useMemo, useRef, useState } from 'react';

import { hashString, mulberry32 } from '@/lib/utils';
import type { Effect } from './types';

export type LayoutType = 'grid' | 'packed' | 'masonry' | 'lanes' | 'single-column' | 'single-row' | 'cluster' | 'squarified' | 'bubble';

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
  spacing?: number; // 0-100, relative to avg image size
  fit?: boolean; // fit option for grid/masonry
  scale?: number;
  jitterPosition?: number;
  jitterSize?: number;
  jitterRotation?: number;
  justify?: boolean;
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
  shape?: 'rect' | 'circle';
}

interface ImageComposerProps extends LayoutOptions, StyleOptions {
  images: ComposeImageItem[];
  normalizeSize: boolean;
  layout: LayoutType;
  onUpdate(info: { width: number; height: number; getImageData: () => string; getImageBlob: () => Promise<Blob | null>; }): void;
  style?: React.CSSProperties;
}

type DrawingOptions = StyleOptions & LayoutOptions;

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

const MAX_CANVAS_SIZE = 3200;

export const ImageComposer: React.FC<ImageComposerProps> = ({ images, normalizeSize, layout, spacing = 0, fit = false, scale = 1, jitterPosition = 0, jitterSize = 0, jitterRotation = 0, justify = false, backgroundColor = 'transparent', cornerRadius = 0, borderEnabled = false, borderWidth = 0, borderColor = '#ffffff', shadowEnabled = false, shadowAngle = 0, shadowDistance = 0, shadowBlur = 0, shadowColor = '#000000', effects = [], shape = 'rect', style, onUpdate }) => {
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
      return { w, h };
    });

    const avgW = sizes.reduce((a, s) => a + s.w, 0) / sizes.length;
    const avgH = sizes.reduce((a, s) => a + s.h, 0) / sizes.length;
    const spacingFrac = spacing / 100 * 0.5;
    const spacingPx = Math.round(spacingFrac * ((avgW + avgH) / 2));

    const layout_ = (() => {
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
          return { canvasWidth: 800, canvasHeight: 600, items: [] } as LayoutResult;
      }
    })();

    // Apply max size constraint (pre-scale)
    const maxScaleFactor = Math.min(MAX_CANVAS_SIZE / layout_.canvasWidth, MAX_CANVAS_SIZE / layout_.canvasHeight);
    const preScaledLayout = {
      canvasWidth: layout_.canvasWidth * maxScaleFactor,
      canvasHeight: layout_.canvasHeight * maxScaleFactor,
      items: layout_.items.map(item => ({
        ...item,
        x: item.x * maxScaleFactor,
        y: item.y * maxScaleFactor,
        w: item.w * maxScaleFactor,
        h: item.h * maxScaleFactor,
      })),
    };

    // Apply user scale uniformly after pre-scaling
    return {
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
  }, [loadedImages, images, normalizeSize, layout, spacing, fit, scale, justify]);

  // Phase 3: draw composition when layout or style changes
  useEffect(() => {
    if (!layoutResult || !loadedImages || loadedImages.length !== images.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawComposition(ctx, layoutResult, images, loadedImages, {
      fit,
      backgroundColor,
      cornerRadius,
      borderEnabled,
      borderWidth,
      borderColor,
      shadowEnabled,
      shadowAngle,
      shadowDistance,
      shadowBlur,
      shadowColor,
      effects,
      jitterPosition,
      jitterSize,
      jitterRotation,
      shape,
    });

    onUpdate({
      width: canvas.width,
      height: canvas.height,
      getImageData: () => canvas.toDataURL('image/png'),
      getImageBlob: () => new Promise(resolve => canvas.toBlob(resolve, 'image/png')),
    });
  }, [layoutResult, loadedImages, images, fit, backgroundColor, cornerRadius, borderEnabled, borderWidth, borderColor, shadowEnabled, shadowAngle, shadowDistance, shadowBlur, shadowColor, effects, jitterPosition, jitterSize, jitterRotation, shape, onUpdate]);

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
  {
    fit,
    backgroundColor = 'transparent',
    cornerRadius = 0,
    borderEnabled = false,
    borderWidth = 0,
    borderColor = '#ffffff',
    shadowEnabled = false,
    shadowAngle = 0,
    shadowDistance = 0,
    shadowBlur = 0,
    shadowColor = '#000000',
    effects = [],
    jitterPosition = 0,
    jitterSize = 0,
    jitterRotation = 0,
    shape = 'rect',
  }: DrawingOptions
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

    if (shape === 'circle') {
      // For circular shapes, fill a large circle
      const centerX = layout.canvasWidth / 2;
      const centerY = layout.canvasHeight / 2;
      const radius = Math.min(layout.canvasWidth, layout.canvasHeight) / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // For rectangular shapes, fill the entire canvas
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    ctx.restore();
  }

  // cornerRadius is a percentage where 100% equals the largest possible rounding across all images (half the largest min dimension).
  // We compute that target once, then clamp per-image so smaller images stay within their own maximum.
  const maxItemMinSize = layout.items.length ? Math.max(...layout.items.map(i => Math.min(i.w, i.h))) : 0;
  const cornerRadiusTargetPx = cornerRadius > 0 && maxItemMinSize > 0 ? (cornerRadius / 100) * (maxItemMinSize / 2) : 0;

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
    const img = images[item.imageIndex];
    const seedSource = img.id || img.src || `img-${item.imageIndex}`;
    const rng = mulberry32(hashString(String(seedSource)) ^ item.imageIndex);

    const posAmp = (Math.min(item.w, item.h) * 0.25) * (Math.max(0, jitterPosition) / 100);
    const sizeAmp = 0.3 * (Math.max(0, jitterSize) / 100);
    const rotAmpDeg = Math.max(0, jitterRotation);

    const randSigned = (amp: number) => (rng() - 0.5) * 2 * amp;

    const scale = 1 + randSigned(sizeAmp);
    const dx = randSigned(posAmp);
    const dy = randSigned(posAmp);
    const rotationRad = randSigned(rotAmpDeg) * (Math.PI / 180);

    const baseCx = item.x + item.w / 2;
    const baseCy = item.y + item.h / 2;
    const w = item.w * scale;
    const h = item.h * scale;
    const x = baseCx + dx - w / 2;
    const y = baseCy + dy - h / 2;

    drawImage(ctx, { ...item, x, y, w, h }, images[item.imageIndex], loadedImgs[item.imageIndex], {
      fit,
      cornerRadiusTargetPx,
      border,
      dropShadow,
      effects,
      rotationRad,
      shape,
    });
  }
}

// Helper to draw shape path (rounded rectangle or simple rectangle)
function drawShapePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadiusPx: number,
  shape: 'rect' | 'circle' = 'rect'
) {
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

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
  {
    fit,
    cornerRadiusTargetPx = 0,
    border,
    dropShadow,
    effects = [],
    rotationRad = 0,
    shape = 'rect',
  }: {
    fit?: boolean;
    cornerRadiusTargetPx?: number;
    border?: { color: string; width: number };
    dropShadow?: { color: string; offsetX: number; offsetY: number; blur: number };
    effects?: Effect[];
    rotationRad?: number;
    shape?: 'rect' | 'circle';
  }
) {
  const { x, y, w, h } = item;

  const srcAspect = img.naturalWidth / img.naturalHeight;
  const dstAspect = w / h;

  let drawWidth = w;
  let drawHeight = h;
  let sx = 0;
  let sy = 0;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;

  if (fit) {
    // Cover: crop source to fill destination
    if (dstAspect > srcAspect) {
      sw = img.naturalWidth;
      sh = sw / dstAspect;
      sy = (img.naturalHeight - sh) / 2;
    } else {
      sh = img.naturalHeight;
      sw = sh * dstAspect;
      sx = (img.naturalWidth - sw) / 2;
    }
  } else {
    // Contain: letterbox destination to preserve source aspect
    if (dstAspect > srcAspect) {
      drawWidth = h * srcAspect;
      drawHeight = h;
    } else {
      drawWidth = w;
      drawHeight = w / srcAspect;
    }
  }

  const drawX = x + (w - drawWidth) / 2;
  const drawY = y + (h - drawHeight) / 2;
  const centerX = drawX + drawWidth / 2;
  const centerY = drawY + drawHeight / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  if (rotationRad) ctx.rotate(rotationRad);
  ctx.translate(-centerX, -centerY);

  const maxRadiusPx = cornerRadiusTargetPx > 0 ? Math.min(cornerRadiusTargetPx, Math.min(drawWidth, drawHeight) / 2) : 0;

  if (dropShadow) {
    ctx.save();
    ctx.shadowColor = dropShadow.color;
    ctx.shadowBlur = dropShadow.blur;
    ctx.shadowOffsetX = dropShadow.offsetX;
    ctx.shadowOffsetY = dropShadow.offsetY;

    ctx.beginPath();
    drawShapePath(ctx, drawX, drawY, drawWidth, drawHeight, maxRadiusPx, shape);
    ctx.fillStyle = 'black';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();

  const cssFilters: string[] = [];
  const pixelProcessors: Effect[] = [];

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
  drawShapePath(ctx, drawX, drawY, drawWidth, drawHeight, maxRadiusPx, shape);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, drawWidth, drawHeight);

  for (const effect of pixelProcessors) {
    switch (effect.type) {
      case 'grain':
        applyGrain(ctx, drawX, drawY, drawWidth, drawHeight, effect.value, effect.blendMode ?? 'overlay');
        break;
      case 'vignette':
        applyVignette(ctx, drawX, drawY, drawWidth, drawHeight, effect.value, effect.blendMode ?? 'overlay');
        break;
      case 'sharpen':
        applySharpen(ctx, drawX, drawY, drawWidth, drawHeight, effect.value);
        break;
      case 'bloom': {
        const amount = Math.max(0, Math.min(100, effect.value)) / 100;
        const blurPx = Math.max(0, effect.blur ?? 10);
        const blendMode = effect.blendMode ?? 'overlay';
        ctx.save();
        ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
        ctx.globalAlpha = amount;
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
        break;
      }
    }
  }

  ctx.restore();

  if (border && border.width > 0) {
    ctx.save();
    ctx.strokeStyle = border.color;
    ctx.lineWidth = border.width;

    ctx.beginPath();
    drawShapePath(ctx, drawX, drawY, drawWidth, drawHeight, maxRadiusPx, shape);
    ctx.stroke();
    ctx.restore();
  }

  if (imageData.label) {
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(imageData.label, drawX + 4, drawY + 16);
  }
  if (imageData.description) {
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(imageData.description, drawX + 4, drawY + drawHeight - 6);
  }

  ctx.restore();
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

function layoutMasonry(
  loadedImgs: HTMLImageElement[],
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
      drawH = Math.round(drawW * (loadedImgs[i].naturalHeight / loadedImgs[i].naturalWidth));
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
function layoutLanes(
  loadedImgs: HTMLImageElement[],
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
    const aspect = loadedImgs[i].naturalWidth / loadedImgs[i].naturalHeight;
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
function layoutBubble(
  _loadedImgs: HTMLImageElement[],
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

  return { canvasWidth, canvasHeight, items };
}

// Maximal rectangles bin-packing: place images in any available gap, splitting gaps as needed
// Blackpawn binary tree rectangle packing algorithm
function layoutPacked(
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