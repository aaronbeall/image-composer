// Effect types
export const BLEND_MODES = [
  'screen',
  'lighten',
  'overlay',
  'soft-light',
  'hard-light',
  'color-dodge',
  'color-burn',
  'multiply',
] as const;

export const EFFECT_CONFIG = {
  blur: { label: 'Blur', default: 5, min: 0, max: 20, unit: 'px' },
  brightness: { label: 'Brightness', default: 100, min: 0, max: 200, unit: '%' },
  contrast: { label: 'Contrast', default: 100, min: 0, max: 200, unit: '%' },
  grayscale: { label: 'Grayscale', default: 100, min: 0, max: 100, unit: '%' },
  'hue-rotate': { label: 'Hue Rotate', default: 0, min: 0, max: 360, unit: '°' },
  invert: { label: 'Invert', default: 100, min: 0, max: 100, unit: '%' },
  saturate: { label: 'Saturate', default: 100, min: 0, max: 200, unit: '%' },
  sepia: { label: 'Sepia', default: 100, min: 0, max: 100, unit: '%' },
  grain: {
    label: 'Grain',
    default: 20,
    min: 0,
    max: 100,
    unit: '%',
    blendModes: BLEND_MODES,
    defaultBlendMode: 'overlay' as const,
  },
  vignette: {
    label: 'Vignette',
    default: 30,
    min: 0,
    max: 100,
    unit: '%',
    blendModes: BLEND_MODES,
    defaultBlendMode: 'overlay' as const,
  },
  sharpen: { label: 'Sharpen', default: 30, min: 0, max: 100, unit: '%' },
  bloom: {
    label: 'Bloom',
    default: 40,
    min: 0,
    max: 100,
    unit: '%',
    blurDefault: 10,
    blurMin: 0,
    blurMax: 40,
    blendModes: BLEND_MODES,
    defaultBlendMode: 'overlay' as const,
  },
} as const;

export type EffectType = keyof typeof EFFECT_CONFIG;
export type BlendMode = (typeof BLEND_MODES)[number];

export type Effect = {
  id: string;
  type: EffectType;
  value: number;
  blur?: number;
  blendMode?: BlendMode;
};