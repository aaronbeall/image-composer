import type { ComposeImageItem, LayoutItem, LayoutOptions, LayoutResult } from "./layout";
import type { Effect } from "@/types";
import { hashString, mulberry32 } from "./utils";

export interface StyleOptions {
  backgroundColor: string;
  cornerRadius: number;
  borderEnabled: boolean;
  borderWidth: number;
  borderColor: string;
  shadowEnabled: boolean;
  shadowAngle: number;
  shadowDistance: number;
  shadowBlur: number;
  shadowColor: string;
  effects: Effect[];
  shape: 'rect' | 'circle';
}

export type DrawingOptions = StyleOptions & LayoutOptions;

type DrawingContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// --- Drawing functions ---
export function drawComposition(
  ctx: DrawingContext,
  layout: LayoutResult,
  images: ComposeImageItem[],
  loadedImgs: ImageBitmap[],
  {
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
      fit: layout.fit ?? fit,
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
export function drawShapePath(
  ctx: DrawingContext,
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
export function applyGrain(
  ctx: DrawingContext,
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

export function applyVignette(ctx: DrawingContext, x: number, y: number, w: number, h: number, intensity: number, blendMode: string = 'overlay') {
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

export function applySharpen(ctx: DrawingContext, x: number, y: number, w: number, h: number, intensity: number) {
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

export function drawImage(
  ctx: DrawingContext,
  item: LayoutItem,
  imageData: ComposeImageItem,
  img: ImageBitmap,
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

  const srcAspect = img.width / img.height;
  const dstAspect = w / h;

  let drawWidth = w;
  let drawHeight = h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (fit) {
    // Cover: crop source to fill destination
    if (dstAspect > srcAspect) {
      sw = img.width;
      sh = sw / dstAspect;
      sy = (img.height - sh) / 2;
    } else {
      sh = img.height;
      sw = sh * dstAspect;
      sx = (img.width - sw) / 2;
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