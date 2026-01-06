import { drawComposition, type DrawingOptions } from './draw';
import type { LayoutResult } from './layout';
import type { ComposeImageItem } from './layout';

interface DrawWorkerMessage {
  type: 'draw';
  offscreenCanvas: OffscreenCanvas;
  layoutResult: LayoutResult;
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

self.onmessage = async (event: MessageEvent<DrawWorkerMessage>) => {
  if (event.data.type !== 'draw') return;

  // Notify main thread that rendering has started
  self.postMessage({
    type: 'start'
  } as DrawWorkerResponse);

  try {
    const { offscreenCanvas, layoutResult, images, loadedImgs, options } = event.data;
    const ctx = offscreenCanvas.getContext('2d');

    if (!ctx) {
      self.postMessage({
        type: 'error',
        error: 'Failed to get 2d context from offscreen canvas'
      } as DrawWorkerResponse);
      return;
    }

    // Call the expensive drawing function with ImageBitmaps
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
