import { drawComposition, type DrawingOptions } from './draw';
import { layoutComposition, type LayoutResult } from './layout';
import type { ComposeImageItem } from './layout';

interface DrawWorkerMessage {
  type: 'compose';
  offscreenCanvas: OffscreenCanvas;
  images: ComposeImageItem[];
  loadedImgs: ImageBitmap[];
  options: DrawingOptions;
}

interface DrawWorkerResponse {
  type: 'start' | 'complete' | 'error';
  canvasWidth?: number;
  canvasHeight?: number;
  imageBitmap?: ImageBitmap;
  error?: string;
}

let lastLayoutKey: string | null = null;
let lastLayoutResult: LayoutResult | null = null;

self.onmessage = async (event: MessageEvent<DrawWorkerMessage>) => {
  if (event.data.type !== 'compose') return;

  // Notify main thread that rendering has started
  self.postMessage({
    type: 'start'
  } as DrawWorkerResponse);

  try {
    const { offscreenCanvas, images, loadedImgs, options } = event.data;

    const layoutParams = {
      images,
      loadedImages: loadedImgs,
      normalizeSize: options.normalizeSize,
      layout: options.layout,
      spacing: options.spacing,
      fit: options.fit,
      scale: options.scale,
      justify: options.justify,
    }

    // Compute layout (with simple cache)
    const layoutKey = JSON.stringify({
      ...layoutParams,
      images: layoutParams.images.map(i => i.src),
      dims: layoutParams.loadedImages.map(b => [b.width, b.height]),
    });

    let layoutResult: LayoutResult;
    if (lastLayoutKey === layoutKey && lastLayoutResult) {
      layoutResult = lastLayoutResult;
    } else {
      layoutResult = layoutComposition(layoutParams);
      lastLayoutKey = layoutKey;
      lastLayoutResult = layoutResult;
    }

    // Ensure canvas matches layout size before drawing
    offscreenCanvas.width = layoutResult.canvasWidth;
    offscreenCanvas.height = layoutResult.canvasHeight;
    const ctx = offscreenCanvas.getContext('2d');

    if (!ctx) {
      self.postMessage({
        type: 'error',
        error: 'Failed to get 2d context from offscreen canvas'
      } as DrawWorkerResponse);
      return;
    }

    // Draw composition using computed layout
    drawComposition(ctx, layoutResult, images, loadedImgs, options);

    // Transfer the rendered image back to the main thread
    const imageBitmap = offscreenCanvas.transferToImageBitmap();

    // Send back the result with dimensions and the rendered bitmap
    self.postMessage({
      type: 'complete',
      canvasWidth: offscreenCanvas.width,
      canvasHeight: offscreenCanvas.height,
      imageBitmap
    } as DrawWorkerResponse, { transfer: [imageBitmap] });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error in draw worker'
    } as DrawWorkerResponse);
  }
};
