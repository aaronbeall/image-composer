
# Image Composer

Paste/select images into a single composed image, with layout, spacing, and fitting options.

[Try it online](https://aaronbeall.github.io/image-composer/)

<img width="1723" height="959" alt="image" src="https://github.com/user-attachments/assets/3e2f7bcf-a10a-43f5-9c07-66e24b28f354" />

## Todo

* [ ] Canvas margin
* [x] Debounce updates
* [x] Offload to workers
  * [ ] Load images
  * [x] Layout algorithm
  * [x] Offscreen canvas for drawing
* [ ] Drag and drop on canvas (tricky due to sorting)
* [ ] Add dragging offset to position images within their frame
* [ ] Individual image editing
  * [ ] Position in frame
  * [ ] Size
  * [ ] Crop
  * [ ] Rotate
  * [ ] Effects
* [ ] Random seed cycler
* [ ] Non-algorithmic designed collage layouts
* [ ] Create image (shape, color, text, etc)
* [x] Max image size (prevents crashes on large images)
  * [ ] User configurable
* [ ] Background gradients and patterns
* [x] Sequencer (size, opacity, rotation)
* [ ] Canvas zoom, pan, actual size controls

# Issues

* [ ] Image tile list drag and drop on mobile doesn't work
* [ ] Cluster layout leaves gaps, add axis tightening phase