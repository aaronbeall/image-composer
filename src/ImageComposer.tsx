import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { StyleOptions } from './lib/draw';
import { layoutComposition, type ComposeImageItem, type LayoutOptions, type LayoutType } from './lib/layout';

interface ImageComposerProps extends LayoutOptions, StyleOptions {
  images: ComposeImageItem[];
  normalizeSize: boolean;
  layout: LayoutType;
  onUpdate(info: { width: number; height: number; getImageData: () => string; getImageBlob: () => Promise<Blob | null>; }): void;
  style?: React.CSSProperties;
}

// Utility to load an image and convert to ImageBitmap
function loadBitmap(src: string) {
  return new Promise<ImageBitmap>((resolve, reject) => {
    const imgElement = new window.Image();
    imgElement.onload = async () => {
      try {
        const bitmap = await createImageBitmap(imgElement);
        resolve(bitmap);
      } catch (err) {
        reject(err);
      }
    };
    imgElement.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    imgElement.src = src;
  });
}


export const ImageComposer: React.FC<ImageComposerProps> = ({ images, normalizeSize, layout, spacing = 0, fit = false, scale = 1, jitterPosition = 0, jitterSize = 0, jitterRotation = 0, justify = false, backgroundColor = 'transparent', cornerRadius = 0, borderEnabled = false, borderWidth = 0, borderColor = '#ffffff', shadowEnabled = false, shadowAngle = 0, shadowDistance = 0, shadowBlur = 0, shadowColor = '#000000', effects = [], shape = 'rect', style, onUpdate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageBitmapCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const workerRef = useRef<Worker | null>(null);
  const [loadedImageBitmaps, setLoadedImageBitmaps] = useState<ImageBitmap[] | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Initialize web worker
  useEffect(() => {
    const drawWorker = new Worker(
      new URL('./lib/draw.worker.ts?worker', import.meta.url),
      { type: 'module' }
    );

    drawWorker.onmessage = (event) => {
      if (event.data.type === 'start') {
        setIsRendering(true);
      } else if (event.data.type === 'complete') {
        const { canvasWidth, canvasHeight, imageBitmap } = event.data;
        const canvas = canvasRef.current;
        if (canvas && imageBitmap) {
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;

          // Draw the received ImageBitmap onto the visible canvas
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(imageBitmap, 0, 0);
          }

          onUpdate({
            width: canvasWidth,
            height: canvasHeight,
            getImageData: () => canvas.toDataURL('image/png'),
            getImageBlob: () => new Promise(resolve => canvas.toBlob(resolve, 'image/png')),
          });
        }
        setIsRendering(false);
      } else if (event.data.type === 'error') {
        console.error('Draw worker error:', event.data.error);
        setIsRendering(false);
      }
    };

    workerRef.current = drawWorker;

    return () => {
      drawWorker.terminate();
    };
  }, [onUpdate]);

  // Phase 1: load and convert images to ImageBitmap (with caching)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!images.length) {
        setLoadedImageBitmaps([]);
        return;
      }
      const bitmapCache = imageBitmapCacheRef.current;

      const bitmaps = await Promise.all(images.map(async img => {
        const cached = bitmapCache.get(img.src);
        if (cached) return cached;

        const bitmap = await loadBitmap(img.src);
        bitmapCache.set(img.src, bitmap);
        return bitmap;
      }));

      if (cancelled) return;
      setLoadedImageBitmaps(bitmaps);
    };
    load();
    return () => { cancelled = true; };
  }, [images]);

  // Phase 2: compute layout (memoized) when images or layout inputs change
  const layoutResult = useMemo(() => {
    return layoutComposition({
      images,
      loadedImages: loadedImageBitmaps,
      normalizeSize,
      layout,
      spacing,
      fit,
      scale,
      justify
    });
  }, [loadedImageBitmaps, images, normalizeSize, layout, spacing, fit, scale, justify]);

  // Phase 3: draw composition using worker when layout or style changes
  useEffect(() => {
    if (!layoutResult || !loadedImageBitmaps || loadedImageBitmaps.length !== images.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if browser supports OffscreenCanvas
    if (typeof OffscreenCanvas === 'undefined' || !workerRef.current) {
      console.error('OffscreenCanvas not supported');
      return;
    }

    // Create an offscreen canvas with the same dimensions as the layout result
    const offscreenCanvas = new OffscreenCanvas(
      layoutResult.canvasWidth,
      layoutResult.canvasHeight
    );

    // Send work to worker (worker will send 'renderingStarted' message)
    try {
      workerRef.current.postMessage({
        type: 'draw',
        offscreenCanvas,
        layoutResult,
        images,
        loadedImgs: loadedImageBitmaps,
        options: {
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
        },
      }, [offscreenCanvas]); // Transfer OffscreenCanvas
    } catch (error) {
      console.error('Error sending message to worker:', error);
    }
  }, [
    layoutResult,
    loadedImageBitmaps,
    images,
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
  ]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
      {isRendering && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 10px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.9)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderTop: '2px solid rgba(139, 92, 246, 1)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};