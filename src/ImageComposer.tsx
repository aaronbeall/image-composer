import React, { useEffect, useMemo, useRef, useState } from 'react';

import { drawComposition, type StyleOptions } from './lib/draw';
import { layoutComposition, type ComposeImageItem, type LayoutOptions, type LayoutType } from './lib/layout';

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
    return layoutComposition({
      images,
      loadedImages,
      normalizeSize,
      layout,
      spacing,
      fit,
      scale,
      justify
    });
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