
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { addAlphaToHex, cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ClipboardIcon, ClipboardPaste, Download, Eye, EyeOff, ImagePlus, LayoutGrid, Menu, Paintbrush, Share2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageComposer, type LayoutType } from './ImageComposer';
import { ColorSwatch } from './components/ColorSwatch';
import { ToggleSection } from './components/ToggleSection';

const SIDEBAR_TABS = [
  { key: 'images', icon: <ImagePlus size={20} />, label: 'Images' },
  { key: 'layout', icon: <LayoutGrid size={20} />, label: 'Layout' },
  { key: 'style', icon: <Paintbrush size={20} />, label: 'Style' },
];

// Effect configuration with metadata
const BLEND_MODES = [
  'screen',
  'lighten',
  'overlay',
  'soft-light',
  'hard-light',
  'color-dodge',
  'color-burn',
  'multiply',
] as const;

const titleCaseBlend = (mode: string) => mode.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

const EFFECT_CONFIG = {
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

// Image item type
type ImageItem = {
  id: string;
  src: string;
  file?: File;
  hidden?: boolean;
};

export default function App() {
  // Style controls state (for stubs)
  const [borderEnabled, setBorderEnabled] = useState(false);
  const [borderWidth, setBorderWidth] = useState(20);
  const [borderColor, setBorderColor] = useState('#ffffff');
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowAngle, setShadowAngle] = useState(45);
  const [shadowDistance, setShadowDistance] = useState(5);
  const [shadowBlur, setShadowBlur] = useState(15);
  const [shadowColor, setShadowColor] = useState('#000000');
  const [shadowOpacity, setShadowOpacity] = useState(65);
  const [cornerRadius, setCornerRadius] = useState(0);
  const [effects, setEffects] = useState<Effect[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('images');

  // Images state and drop/browse/paste logic
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);

  // Layout state
  const [layout, setLayout] = useState<LayoutType>('grid');
  const [spacing, setSpacing] = useState(20);
  const [scale, setScale] = useState(100);
  const [normalizeSize, setNormalizeSize] = useState(true);
  const [fit, setFit] = useState(true);
  const [canvasInfo, setCanvasInfo] = useState<{ width: number; height: number; getImageData?: () => string; getImageBlob?: () => Promise<Blob | null>; }>({ width: 0, height: 0 });
  const [isSharing, setIsSharing] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Style state
  const [bgColor, setBgColor] = useState<string>('transparent');

  // Read files and add to state
  const handleFiles = (files: File[]) => {
    const isFirstAdd = images.length === 0 && files.length > 0;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages(prev => [
          ...prev,
          {
            id: Math.random().toString(36).slice(2),
            src: e.target?.result as string,
            file,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    // After initial file selection, expand sidebar and select layout tab if not already expanded
    if (isFirstAdd && !sidebarOpen) {
      setSidebarOpen(true);
      setActiveTab('layout');
    }
  };

  // Handle file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    handleFiles(Array.from(files));
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // Trigger browser paste dialog if possible, else focus drop area
  const handlePasteButton = () => {
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard.read().then(() => { }).catch(() => {
        dropAreaRef.current?.focus();
      });
    } else {
      dropAreaRef.current?.focus();
      try {
        document.execCommand('paste');
      } catch {
        alert('Paste command not supported');
      }
    }
  };

  // Trigger file input
  const handleBrowse = () => fileInputRef.current?.click();

  // Global paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handleFiles(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Update canvas info from ImageComposer
  const visibleImages = useMemo(() => images.filter(img => !img.hidden), [images]);

  // Determine which layouts support the Fit option
  const supportsFit = ['grid', 'masonry', 'single-row', 'single-column', 'squarified'].includes(layout);

  return (
    <div className="w-full min-h-screen bg-neutral-900 text-white flex flex-col">
      {/* Hidden file input for all Browse buttons */}
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />
      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-14 bg-neutral-900/95 flex items-center justify-between z-50 border-b border-neutral-800 shadow-md px-4 lg:px-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="lg:hidden"><Menu size={22} /></Button>
          <span className="font-bold text-xl select-none">Image Composer</span>
        </div>
        <div className="flex items-center gap-2">
          {images.length > 0 && <>
            {/* Large screens: full buttons */}
            <button
              onClick={() => {
                if (canvasInfo.getImageData) {
                  const a = document.createElement('a');
                  a.href = canvasInfo.getImageData();
                  a.download = 'composed-image.png';
                  a.click();
                }
              }}
              className="hidden sm:inline-flex px-4 py-2 rounded bg-gradient-to-r from-indigo-600 to-indigo-400 text-white font-semibold items-center gap-2 shadow hover:from-indigo-700 hover:to-indigo-500 transition"
              title="Download composed image"
            >
              <Download size={18} className="mr-1" />Download
            </button>
            <button
              onClick={async () => {
                if (canvasInfo.getImageBlob) {
                  setIsCopying(true);
                  try {
                    const blob = await canvasInfo.getImageBlob();
                    if (blob) {
                      await navigator.clipboard.write([
                        new window.ClipboardItem({ 'image/png': blob })
                      ]);
                    }
                  } finally {
                    setIsCopying(false);
                  }
                }
              }}
              className="hidden sm:inline-flex px-4 py-2 rounded bg-gradient-to-r from-indigo-600 to-indigo-400 text-white font-semibold items-center gap-2 shadow hover:from-indigo-700 hover:to-indigo-500 transition disabled:opacity-60"
              disabled={isCopying}
              title="Copy image to clipboard"
            >
              <ClipboardIcon size={18} className="mr-1" />{isCopying ? 'Copying...' : 'Copy'}
            </button>
            {typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator && (
              <button
                onClick={async () => {
                  if (canvasInfo.getImageBlob) {
                    setIsSharing(true);
                    try {
                      const blob = await canvasInfo.getImageBlob();
                      if (!blob) return;
                      const file = new File([blob], 'composed-image.png', { type: 'image/png' });
                      if (!navigator.canShare({ files: [file] })) {
                        alert('Sharing files is not supported on this device/browser.');
                        return;
                      }
                      await navigator.share({
                        files: [file],
                        title: 'Composed Image',
                        text: 'Check out this composed image!'
                      });
                    } finally {
                      setIsSharing(false);
                    }
                  }
                }}
                className="hidden sm:inline-flex px-4 py-2 rounded bg-gradient-to-r from-indigo-400 to-indigo-600 text-white font-semibold items-center gap-2 shadow hover:from-indigo-500 hover:to-indigo-700 transition disabled:opacity-60"
                disabled={isSharing}
                title="Share composed image"
              >
                <Share2 size={18} className="mr-1" />{isSharing ? 'Sharing...' : 'Share'}
              </button>
            )}
            {/* Small screens: icon-only buttons */}
            <button
              onClick={() => {
                if (canvasInfo.getImageData) {
                  const a = document.createElement('a');
                  a.href = canvasInfo.getImageData();
                  a.download = 'composed-image.png';
                  a.click();
                }
              }}
              className="inline-flex sm:hidden p-2 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 text-white shadow hover:from-indigo-700 hover:to-indigo-500 transition"
              title="Download composed image"
            >
              <Download size={20} />
            </button>
            <button
              onClick={async () => {
                if (canvasInfo.getImageBlob) {
                  setIsCopying(true);
                  try {
                    const blob = await canvasInfo.getImageBlob();
                    if (blob) {
                      await navigator.clipboard.write([
                        new window.ClipboardItem({ 'image/png': blob })
                      ]);
                    }
                  } finally {
                    setIsCopying(false);
                  }
                }
              }}
              className="inline-flex sm:hidden p-2 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 text-white shadow hover:from-indigo-700 hover:to-indigo-500 transition disabled:opacity-60"
              disabled={isCopying}
              title="Copy image to clipboard"
            >
              <ClipboardIcon size={20} />
            </button>
            {typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator && (
              <button
                onClick={async () => {
                  if (canvasInfo.getImageBlob) {
                    setIsSharing(true);
                    try {
                      const blob = await canvasInfo.getImageBlob();
                      if (!blob) return;
                      const file = new File([blob], 'composed-image.png', { type: 'image/png' });
                      if (!navigator.canShare({ files: [file] })) {
                        alert('Sharing files is not supported on this device/browser.');
                        return;
                      }
                      await navigator.share({
                        files: [file],
                        title: 'Composed Image',
                        text: 'Check out this composed image!'
                      });
                    } finally {
                      setIsSharing(false);
                    }
                  }
                }}
                className="inline-flex sm:hidden p-2 rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 text-white shadow hover:from-indigo-500 hover:to-indigo-700 transition disabled:opacity-60"
                disabled={isSharing}
                title="Share composed image"
              >
                <Share2 size={20} />
              </button>
            )}
          </>}
        </div>
      </header>
      {/* Main layout */}
      <div className="flex-1 flex flex-row pt-14 w-full">
        {/* Sidebar (large screens) */}
        <aside className={cn(
          'hidden lg:flex flex-col bg-neutral-950 border-r border-neutral-800 transition-all duration-200',
          sidebarOpen ? 'w-20' : 'w-12',
          'min-h-[calc(100vh-56px)]'
        )}>
          <div className="flex flex-col items-center py-4 gap-2 flex-1 group/sidebar">
            {SIDEBAR_TABS.map(tab => (
              <div key={tab.key} className="relative mb-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSidebarOpen(true);
                    setActiveTab(tab.key);
                  }}
                  aria-label={tab.label}
                  className={
                    sidebarOpen && activeTab === tab.key
                      ? 'bg-indigo-900 text-indigo-400 shadow border border-indigo-500'
                      : 'text-neutral-400 hover:text-indigo-300'
                  }
                >
                  {tab.icon}
                </Button>
                <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded bg-neutral-800 text-white text-xs font-medium opacity-0 group-hover/sidebar:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10 shadow-lg">
                  {tab.label}
                </span>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="mx-auto mb-4"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </Button>
        </aside>
        {/* Sidebar content (large screens) */}
        <div className={cn('hidden lg:block bg-neutral-950 border-r border-neutral-800 transition-all duration-200', sidebarOpen ? 'w-64' : 'w-0', 'overflow-hidden')}>
          <div className="h-full p-4">
            {activeTab === 'images' && (
              <div className="flex flex-col h-full">
                {/* Drop area and instructions */}
                <div
                  ref={dropAreaRef}
                  tabIndex={0}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  aria-label="Image drop and preview area"
                  className={`transition-all border ${isDragOver ? 'border-2 border-indigo-400 outline outline-2 outline-indigo-300 shadow-lg bg-gradient-to-r from-indigo-950 to-indigo-900' : 'border-dashed border-neutral-700'} rounded-lg min-h-[80px] flex flex-col justify-center items-center relative mb-3 cursor-pointer px-2 py-2`}
                >
                  <div className="flex flex-col items-center justify-center gap-1 w-full">
                    <Upload size={22} className="text-neutral-400 mb-1" />
                    <div className="text-xs font-medium text-white mb-1">Drag & drop images</div>
                    <div className="flex flex-row gap-2 justify-center mt-1">
                      <Button variant="ghost" size="sm" onClick={handleBrowse} title="Browse images" className="flex items-center gap-1 px-2 py-1">
                        <ImagePlus size={16} /> <span className="text-xs">Browse</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handlePasteButton} title="Paste images" className="flex items-center gap-1 px-2 py-1">
                        <ClipboardPaste size={16} /> <span className="text-xs">Paste</span>
                      </Button>
                    </div>
                  </div>
                </div>
                {/* Image tile list, scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                  <ImageTileList
                    images={images}
                    onToggleHide={idx => setImages(prev => prev.map((im, i) => i === idx ? { ...im, hidden: !im.hidden } : im))}
                    onRemove={idx => setImages(prev => prev.filter((_, i) => i !== idx))}
                    size="large"
                  />
                </div>
              </div>
            )}
            {activeTab === 'layout' && (
              <div className="flex flex-col gap-6">
                {/* Layout type selection */}
                <div>
                  <div className="font-semibold text-sm mb-2">Layout Type</div>
                  <LayoutTypeSelector layout={layout} setLayout={setLayout} />
                </div>
                {/* Spacing slider */}
                <div className="flex flex-col gap-1">
                  <label className="font-medium text-xs flex items-center justify-between">
                    <span>Spacing</span>
                    <span className="text-neutral-400 text-xs">{spacing}</span>
                  </label>
                  <Slider
                    value={[spacing]}
                    min={0}
                    max={100}
                    onValueChange={val => setSpacing(val[0])}
                    className="w-full"
                  />
                </div>
                {/* Scale slider */}
                <div className="flex flex-col gap-1">
                  <label className="font-medium text-xs flex items-center justify-between">
                    <span>Scale</span>
                    <span className="text-neutral-400 text-xs">{scale}%</span>
                  </label>
                  <Slider
                    value={[scale]}
                    min={1}
                    max={100}
                    onValueChange={val => setScale(val[0])}
                    className="w-full"
                  />
                </div>
                {/* Toggles */}
                <div className="flex flex-col gap-2 mt-2">
                  <label className="flex items-center justify-between text-xs font-medium">
                    <span>Normalize size</span>
                    <Switch checked={normalizeSize} onCheckedChange={setNormalizeSize} />
                  </label>
                  {supportsFit && (
                    <label className="flex items-center justify-between text-xs font-medium">
                      <span>Fit</span>
                      <Switch checked={fit} onCheckedChange={setFit} />
                    </label>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'style' && (
              <div className="flex flex-col gap-6">
                {/* Background selector (existing) */}
                <div>
                  <div className="font-semibold text-sm mb-2">Background</div>
                  <BackgroundColorSelector bgColor={bgColor} setBgColor={setBgColor} />
                </div>

                {/* Corner radius selector (0-100%) - slider style */}
                <div className="flex flex-col gap-1">
                  <label className="font-medium text-xs flex items-center justify-between">
                    <span>Corner Radius</span>
                    <span className="text-neutral-400 text-xs">{cornerRadius}%</span>
                  </label>
                  <Slider
                    value={[cornerRadius]}
                    min={0}
                    max={100}
                    onValueChange={val => setCornerRadius(val[0])}
                    className="w-full"
                  />
                </div>

                {/* Border selector */}
                <ToggleSection label="Border" enabled={borderEnabled} onToggle={setBorderEnabled}>
                  <div className="flex flex-col gap-1">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Size</span>
                      <span className="text-neutral-400 text-xs">{borderWidth}</span>
                    </label>
                    <Slider value={[borderWidth]} min={0} max={100} onValueChange={val => setBorderWidth(val[0])} className="w-full" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">Color</label>
                    <ColorSwatch value={borderColor} onChange={setBorderColor} />
                  </div>
                </ToggleSection>

                {/* Drop shadow selector */}
                <ToggleSection label="Drop Shadow" enabled={shadowEnabled} onToggle={setShadowEnabled}>
                  <div className="flex flex-col gap-1">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Angle</span>
                      <span className="text-neutral-400 text-xs">{shadowAngle}°</span>
                    </label>
                    <Slider value={[shadowAngle]} min={0} max={360} onValueChange={val => setShadowAngle(val[0])} className="w-full" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Distance</span>
                      <span className="text-neutral-400 text-xs">{shadowDistance}</span>
                    </label>
                    <Slider value={[shadowDistance]} min={0} max={100} onValueChange={val => setShadowDistance(val[0])} className="w-full" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Blur</span>
                      <span className="text-neutral-400 text-xs">{shadowBlur}</span>
                    </label>
                    <Slider value={[shadowBlur]} min={0} max={100} onValueChange={val => setShadowBlur(val[0])} className="w-full" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">Color</label>
                    <ColorSwatch value={shadowColor} onChange={setShadowColor} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Opacity</span>
                      <span className="text-neutral-400 text-xs">{shadowOpacity}%</span>
                    </label>
                    <Slider value={[shadowOpacity]} min={0} max={100} onValueChange={val => setShadowOpacity(val[0])} className="w-full" />
                  </div>
                </ToggleSection>

                {/* Effects selector */}
                <div className="mt-4">
                  <label className="text-xs font-medium block mb-2">Effects</label>
                  <Combobox
                    options={Object.entries(EFFECT_CONFIG).map(([value, config]) => ({
                      value,
                      label: config.label,
                    }))}
                    placeholder="Add effect..."
                    onValueChange={(value) => {
                      if (!value) return;
                      const config = EFFECT_CONFIG[value as EffectType];
                      const next: Effect = {
                        id: Date.now().toString(),
                        type: value as EffectType,
                        value: config.default,
                      };
                      if ('blurDefault' in config) {
                        next.blur = config.blurDefault;
                      }
                      if ('blendModes' in config) {
                        next.blendMode = config.defaultBlendMode ?? config.blendModes[0];
                      }
                      setEffects([...effects, next]);
                    }}
                    className="w-full"
                  />
                  {effects.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {effects.slice().reverse().map((effect) => {
                        const config = EFFECT_CONFIG[effect.type];
                        const hasBlur = 'blurDefault' in config;
                        const hasBlend = 'blendModes' in config;
                        const blendCfg = hasBlend ? config : null;
                        return (
                          <div key={effect.id} className="flex items-center gap-2 border border-neutral-700 rounded-lg p-2">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-medium capitalize">{config.label}</label>
                                <span className="text-xs text-neutral-400">
                                  {effect.value}{config.unit}
                                </span>
                              </div>
                              <Slider
                                value={[effect.value]}
                                min={config.min}
                                max={config.max}
                                onValueChange={(val) => {
                                  setEffects(effects.map(e => e.id === effect.id ? { ...e, value: val[0] } : e));
                                }}
                                className="w-full"
                              />

                              {hasBlur && (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-neutral-300">Blur</span>
                                    <span className="text-xs text-neutral-400">{effect.blur ?? config.blurDefault}px</span>
                                  </div>
                                  <Slider
                                    value={[effect.blur ?? config.blurDefault]}
                                    min={config.blurMin}
                                    max={config.blurMax}
                                    onValueChange={(val) => {
                                      setEffects(effects.map(e => e.id === effect.id ? { ...e, blur: val[0] } : e));
                                    }}
                                    className="w-full"
                                  />

                                </>
                              )}

                              {hasBlend && blendCfg && (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-neutral-300">Blend Mode</span>
                                    <span className="text-xs text-neutral-400">{titleCaseBlend(effect.blendMode ?? blendCfg.defaultBlendMode ?? blendCfg.blendModes[0])}</span>
                                  </div>
                                  <Combobox
                                    options={blendCfg.blendModes.map(mode => ({ value: mode, label: titleCaseBlend(mode) }))}
                                    value={effect.blendMode}
                                    onValueChange={(mode) => {
                                      setEffects(effects.map(e => e.id === effect.id ? { ...e, blendMode: mode as BlendMode } : e));
                                    }}
                                    className="w-full"
                                    placeholder="Select mode"
                                  />
                                </>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                              onClick={() => setEffects(effects.filter(e => e.id !== effect.id))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Main work area */}
        <main className="flex-1 flex flex-col items-center justify-center bg-neutral-900 relative overflow-hidden">
          {images.length === 0 ? (
            <div
              ref={dropAreaRef}
              tabIndex={0}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              aria-label="Main image drop area"
              className={`transition-all border-2 ${isDragOver ? 'border-indigo-400 outline outline-2 outline-indigo-300 shadow-lg bg-gradient-to-r from-indigo-950 to-indigo-900' : 'border-dashed border-neutral-700'} rounded-2xl min-h-[320px] min-w-[340px] max-w-lg w-full flex flex-col justify-center items-center relative p-8 mb-8 cursor-pointer`}
            >
              <Upload size={48} className="text-neutral-400 mb-4" />
              <div className="font-bold text-2xl text-white mb-2">Drag and drop images here</div>
              <div className="flex flex-row gap-4 mb-2">
                <Button variant="default" size="lg" onClick={handleBrowse} className="flex items-center gap-2 px-6 py-2 text-lg font-semibold">
                  <ImagePlus size={22} /> Browse
                </Button>
                <Button variant="secondary" size="lg" onClick={handlePasteButton} className="flex items-center gap-2 px-6 py-2 text-lg font-semibold">
                  <ClipboardPaste size={22} /> Paste
                </Button>
              </div>
              <div className="text-neutral-400 text-base mt-2">or use <kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd> to paste from your clipboard</div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
              <div className="flex-1 w-full flex items-center justify-center overflow-hidden"
                style={{
                  minHeight: 0,
                  minWidth: 0,
                  height: 'calc(100vh - 56px - 36px)', // header (56px) + status bar (36px)
                  maxHeight: 'calc(100vh - 56px - 36px)',
                }}
              >
                <ImageComposer
                  images={visibleImages}
                  normalizeSize={normalizeSize}
                  layout={layout}
                  spacing={spacing}
                  fit={fit}
                  scale={scale / 100}
                  backgroundColor={bgColor}
                  cornerRadius={cornerRadius}
                  borderEnabled={borderEnabled}
                  borderWidth={borderWidth}
                  borderColor={borderColor}
                  shadowEnabled={shadowEnabled}
                  shadowAngle={shadowAngle}
                  shadowDistance={shadowDistance}
                  shadowBlur={shadowBlur}
                  shadowColor={addAlphaToHex(shadowColor, shadowOpacity)}
                  effects={effects}
                  onUpdate={setCanvasInfo}
                />
              </div>
              {/* Status bar below the image composer */}
              <div className="w-full flex items-center justify-center bg-neutral-950/95 border-t border-neutral-800 py-2 z-10 min-h-[36px] max-h-[36px]">
                <div className="text-xs text-neutral-400 flex flex-row gap-4 items-center">
                  {canvasInfo.width > 0 && canvasInfo.height > 0 && (
                    <span>Image size: {canvasInfo.width} × {canvasInfo.height} px</span>
                  )}
                  {/* Image count as a link to Images tab */}
                  <button
                    className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300 transition px-1 py-0.5 rounded"
                    style={{ fontSize: 'inherit' }}
                    onClick={() => {
                      setActiveTab('images');
                      setSidebarOpen(true);
                    }}
                    title="Show images"
                  >
                    {visibleImages.length} image{visibleImages.length === 1 ? '' : 's'}
                  </button>
                  {/* Add more button */}
                  <button
                    className="text-xs bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-1 rounded shadow ml-1"
                    style={{ fontSize: 'inherit' }}
                    onClick={handleBrowse}
                    title="Add more images"
                  >
                    add more
                  </button>
                  {/* Layout as a link button */}
                  <button
                    className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300 transition px-1 py-0.5 rounded"
                    style={{ fontSize: 'inherit' }}
                    onClick={() => {
                      setActiveTab('layout');
                      setSidebarOpen(true);
                    }}
                    title="Show layout settings"
                  >
                    Layout: {layout}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
        {/* Bottom nav and drawer (small screens) */}
        <Drawer>
          <div className="fixed bottom-0 left-0 w-full z-50 bg-neutral-950 border-t border-neutral-800 flex lg:hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="flex flex-row w-full justify-between px-2 bg-transparent">
                {SIDEBAR_TABS.map(tab => (
                  <DrawerTrigger asChild key={tab.key}>
                    <TabsTrigger value={tab.key} className="flex-1 flex flex-col items-center gap-0.5 data-[state=active]:text-indigo-400 py-2">{tab.icon}<span className="text-xs">{tab.label}</span></TabsTrigger>
                  </DrawerTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <DrawerContent className="lg:hidden bg-neutral-950 border-t border-neutral-800 rounded-t-2xl p-0 max-h-[80vh] flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
              <TabsList className="hidden" />
              <TabsContent value="images">
                <div className="p-4 flex flex-col gap-3">
                  <Button variant="default" size="lg" onClick={handleBrowse} className="flex items-center gap-2 px-6 py-2 text-base font-semibold w-full justify-center">
                    <ImagePlus size={20} /> Browse
                  </Button>
                  <ImageTileList
                    images={images}
                    onToggleHide={idx => setImages(prev => prev.map((im, i) => i === idx ? { ...im, hidden: !im.hidden } : im))}
                    onRemove={idx => setImages(prev => prev.filter((_, i) => i !== idx))}
                    size="small"
                  />
                </div>
              </TabsContent>
              <TabsContent value="layout">
                <div className="p-4">
                  <LayoutTypeSelector layout={layout} setLayout={setLayout} />
                  {/* Spacing slider */}
                  <div className="flex flex-col gap-1 mb-2">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Spacing</span>
                      <span className="text-neutral-400 text-xs">{spacing}</span>
                    </label>
                    <Slider
                      value={[spacing]}
                      min={0}
                      max={100}
                      onValueChange={val => setSpacing(val[0])}
                      className="w-full"
                    />
                  </div>
                  {/* Scale slider */}
                  <div className="flex flex-col gap-1 mb-2">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Scale</span>
                      <span className="text-neutral-400 text-xs">{scale}%</span>
                    </label>
                    <Slider
                      value={[scale]}
                      min={1}
                      max={100}
                      onValueChange={val => setScale(val[0])}
                      className="w-full"
                    />
                  </div>
                  {/* Toggles */}
                  <div className="flex flex-col gap-2 mt-2 mb-2">
                    <label className="flex items-center justify-between text-xs font-medium">
                      <span>Normalize size</span>
                      <Switch checked={normalizeSize} onCheckedChange={setNormalizeSize} />
                    </label>
                    {supportsFit && (
                      <label className="flex items-center justify-between text-xs font-medium">
                        <span>Fit</span>
                        <Switch checked={fit} onCheckedChange={setFit} />
                      </label>
                    )}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="style">
                <div className="p-4">
                  {/* Style options (reuse sidebar controls) */}
                  {/* Background selector (existing) */}
                  <div>
                    <div className="font-semibold text-sm mb-2">Background</div>
                    <BackgroundColorSelector bgColor={bgColor} setBgColor={setBgColor} />
                  </div>
                  {/* Corner radius selector (0-100%) - slider style */}
                  <div className="flex flex-col gap-1 mt-4">
                    <label className="font-medium text-xs flex items-center justify-between">
                      <span>Corner Radius</span>
                      <span className="text-neutral-400 text-xs">{cornerRadius}%</span>
                    </label>
                    <Slider
                      value={[cornerRadius]}
                      min={0}
                      max={100}
                      onValueChange={val => setCornerRadius(val[0])}
                      className="w-full"
                    />
                  </div>
                  {/* Border selector */}
                  <div className="mt-4">
                    <ToggleSection label="Border" enabled={borderEnabled} onToggle={setBorderEnabled}>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium text-xs flex items-center justify-between">
                          <span>Size</span>
                          <span className="text-neutral-400 text-xs">{borderWidth}</span>
                        </label>
                        <Slider value={[borderWidth]} min={0} max={100} onValueChange={val => setBorderWidth(val[0])} className="w-full" />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium">Color</label>
                        <ColorSwatch value={borderColor} onChange={setBorderColor} />
                      </div>
                    </ToggleSection>
                  </div>
                  {/* Drop shadow selector */}
                  <div className="mt-4">
                    <ToggleSection label="Drop Shadow" enabled={shadowEnabled} onToggle={setShadowEnabled}>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium text-xs flex items-center justify-between">
                          <span>Angle</span>
                          <span className="text-neutral-400 text-xs">{shadowAngle}°</span>
                        </label>
                        <Slider value={[shadowAngle]} min={0} max={360} onValueChange={val => setShadowAngle(val[0])} className="w-full" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium text-xs flex items-center justify-between">
                          <span>Distance</span>
                          <span className="text-neutral-400 text-xs">{shadowDistance}</span>
                        </label>
                        <Slider value={[shadowDistance]} min={0} max={100} onValueChange={val => setShadowDistance(val[0])} className="w-full" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium text-xs flex items-center justify-between">
                          <span>Blur</span>
                          <span className="text-neutral-400 text-xs">{shadowBlur}</span>
                        </label>
                        <Slider value={[shadowBlur]} min={0} max={100} onValueChange={val => setShadowBlur(val[0])} className="w-full" />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium">Color</label>
                        <ColorSwatch value={shadowColor} onChange={setShadowColor} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-medium text-xs flex items-center justify-between">
                          <span>Opacity</span>
                          <span className="text-neutral-400 text-xs">{shadowOpacity}%</span>
                        </label>
                        <Slider value={[shadowOpacity]} min={0} max={100} onValueChange={val => setShadowOpacity(val[0])} className="w-full" />
                      </div>
                    </ToggleSection>
                  </div>
                  {/* Effects selector */}
                  <div className="mt-4">
                    <label className="text-xs font-medium block mb-2">Effects</label>
                    <Combobox
                      options={Object.entries(EFFECT_CONFIG).map(([value, config]) => ({
                        value,
                        label: config.label,
                      }))}
                      placeholder="Add effect..."
                      onValueChange={(value) => {
                        if (!value) return;
                        const config = EFFECT_CONFIG[value as EffectType];
                        const next: Effect = {
                          id: Date.now().toString(),
                          type: value as EffectType,
                          value: config.default,
                        };
                        if ('blurDefault' in config) {
                          next.blur = config.blurDefault;
                        }
                        if ('blendModes' in config) {
                          next.blendMode = config.defaultBlendMode ?? config.blendModes[0];
                        }
                        setEffects([...effects, next]);
                      }}
                      className="w-full"
                    />
                    {effects.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {effects.slice().reverse().map((effect) => {
                          const config = EFFECT_CONFIG[effect.type];
                          const hasBlur = 'blurDefault' in config;
                          const hasBlend = 'blendModes' in config;
                          const blendCfg = hasBlend ? config : null;
                          return (
                            <div key={effect.id} className="flex items-center gap-2 border border-neutral-700 rounded-lg p-2">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-xs font-medium capitalize">{config.label}</label>
                                  <span className="text-xs text-neutral-400">
                                    {effect.value}{config.unit}
                                  </span>
                                </div>
                                <Slider
                                  value={[effect.value]}
                                  min={config.min}
                                  max={config.max}
                                  onValueChange={(val) => {
                                    setEffects(effects.map(e => e.id === effect.id ? { ...e, value: val[0] } : e));
                                  }}
                                  className="w-full"
                                />

                                {hasBlur && (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-neutral-300">Blur</span>
                                      <span className="text-xs text-neutral-400">{effect.blur ?? config.blurDefault}px</span>
                                    </div>
                                    <Slider
                                      value={[effect.blur ?? config.blurDefault]}
                                      min={config.blurMin}
                                      max={config.blurMax}
                                      onValueChange={(val) => {
                                        setEffects(effects.map(e => e.id === effect.id ? { ...e, blur: val[0] } : e));
                                      }}
                                      className="w-full"
                                    />
                                  </>
                                )}

                                {hasBlend && blendCfg && (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-neutral-300">Blend Mode</span>
                                      <span className="text-xs text-neutral-400">{titleCaseBlend(effect.blendMode ?? blendCfg.defaultBlendMode ?? blendCfg.blendModes[0])}</span>
                                    </div>
                                    <Combobox
                                      options={blendCfg.blendModes.map(mode => ({ value: mode, label: titleCaseBlend(mode) }))}
                                      value={effect.blendMode}
                                      onValueChange={(mode) => {
                                        setEffects(effects.map(e => e.id === effect.id ? { ...e, blendMode: mode as BlendMode } : e));
                                      }}
                                      className="w-full"
                                      placeholder="Select mode"
                                    />
                                  </>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0"
                                onClick={() => setEffects(effects.filter(e => e.id !== effect.id))}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}

// --- Reusable Components ---

type ImageTileListProps = {
  images: ImageItem[];
  onToggleHide: (idx: number) => void;
  onRemove: (idx: number) => void;
  size: 'large' | 'small';
};
function ImageTileList({ images, onToggleHide, onRemove, size }: ImageTileListProps) {
  if (images.length === 0) return null;
  return (
    <div className={size === 'large' ? 'flex flex-row flex-wrap gap-3' : 'flex flex-row gap-2 overflow-x-auto pb-2'}>
      {images.map((img, idx) => (
        <div
          key={img.id}
          className={size === 'large'
            ? 'relative min-w-[100px] max-w-[140px] flex flex-col items-center bg-neutral-800 rounded-lg shadow-md p-2'
            : 'relative min-w-[72px] max-w-[90px] flex flex-col items-center bg-neutral-800 rounded-lg shadow-md p-1 mx-1'}
        >
          <img
            src={img.src}
            alt={`Image ${idx + 1}`}
            className={size === 'large'
              ? `w-[80px] h-[80px] object-cover rounded-md mb-1 bg-neutral-900 ${img.hidden ? 'opacity-30 grayscale' : ''}`
              : `w-[60px] h-[60px] object-cover rounded-md mb-1 bg-neutral-900 ${img.hidden ? 'opacity-30 grayscale' : ''}`}
          />
          <div className="flex flex-row items-center gap-1 w-full justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-400"
              title={img.hidden ? 'Show image' : 'Hide image'}
              onClick={() => onToggleHide(idx)}
            >
              {img.hidden ? (size === 'large' ? <EyeOff size={18} /> : <EyeOff size={16} />) : (size === 'large' ? <Eye size={18} /> : <Eye size={16} />)}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-400"
              title="Remove image"
              onClick={() => onRemove(idx)}
            >
              {size === 'large' ? <X size={18} /> : <X size={16} />}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

type LayoutTypeSelectorProps = {
  layout: LayoutType;
  setLayout: (layout: LayoutType) => void;
};
function LayoutTypeSelector({ layout, setLayout }: LayoutTypeSelectorProps) {
  const layouts = [
    {
      key: 'grid',
      label: 'Grid',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          {[0, 1, 2].map(r => [0, 1, 2].map(c => (
            <rect key={r + ',' + c} x={2 + c * 5.5} y={2 + r * 5.5} width="4" height="4" rx="1" fill="currentColor" />
          )))}
        </svg>
      ),
    },
    {
      key: 'packed',
      label: 'Packed',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
          <rect x="9" y="2" width="4" height="4" rx="1" fill="currentColor" />
          <rect x="14" y="2" width="3" height="7" rx="1" fill="currentColor" />
          <rect x="2" y="9" width="4" height="4" rx="1" fill="currentColor" />
          <rect x="7" y="8" width="7" height="6" rx="1" fill="currentColor" />
          <rect x="2" y="15" width="5" height="3" rx="1" fill="currentColor" />
          <rect x="9" y="15" width="8" height="3" rx="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'squarified',
      label: 'Squarified',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
          <rect x="11" y="2" width="7" height="8" rx="1" fill="currentColor" />
          <rect x="2" y="11" width="6" height="7" rx="1" fill="currentColor" />
          <rect x="9" y="11" width="9" height="7" rx="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'cluster',
      label: 'Cluster',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="7" y="7" width="6" height="6" rx="1" fill="currentColor" />
          <rect x="4" y="3" width="3" height="3" rx="0.7" fill="currentColor" />
          <rect x="13" y="3" width="3" height="3" rx="0.7" fill="currentColor" />
          <rect x="3" y="8" width="3" height="3" rx="0.7" fill="currentColor" />
          <rect x="14" y="8" width="3" height="3" rx="0.7" fill="currentColor" />
          <rect x="4" y="14" width="3" height="3" rx="0.7" fill="currentColor" />
          <rect x="13" y="14" width="3" height="3" rx="0.7" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'masonry',
      label: 'Masonry',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="2" width="4" height="7" rx="1" fill="currentColor" />
          <rect x="2" y="10" width="4" height="6" rx="1" fill="currentColor" />
          <rect x="8" y="2" width="4" height="4" rx="1" fill="currentColor" />
          <rect x="8" y="8" width="4" height="8" rx="1" fill="currentColor" />
          <rect x="14" y="2" width="4" height="12" rx="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'single-column',
      label: 'Column',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="7" y="3" width="6" height="4" rx="1" fill="currentColor" />
          <rect x="7" y="8" width="6" height="4" rx="1" fill="currentColor" />
          <rect x="7" y="13" width="6" height="4" rx="1" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'single-row',
      label: 'Row',
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="7" width="4" height="6" rx="1" fill="currentColor" />
          <rect x="8" y="7" width="4" height="6" rx="1" fill="currentColor" />
          <rect x="13" y="7" width="4" height="6" rx="1" fill="currentColor" />
        </svg>
      ),
    },
  ] as const satisfies { key: LayoutType; label: string; icon: React.ReactNode }[];
  return (
    <div className="flex flex-row flex-wrap gap-2">
      {layouts.map(l => (
        <Button
          key={l.key}
          variant={layout === l.key ? 'secondary' : 'ghost'}
          size="icon"
          aria-label={l.label}
          onClick={() => setLayout(l.key)}
          className={
            (layout === l.key ? 'ring-2 ring-indigo-400 bg-indigo-900 text-indigo-300 ' : '') +
            'flex flex-col items-center justify-center min-w-[56px] min-h-[48px] px-2 py-1'
          }
        >
          <span>{l.icon}</span>
          <span className="text-[10px] block">{l.label}</span>
        </Button>
      ))}
    </div>
  );
}

type BackgroundColorSelectorProps = {
  bgColor: string;
  setBgColor: (color: string) => void;
};
function BackgroundColorSelector({ bgColor, setBgColor }: BackgroundColorSelectorProps) {
  const presets = [
    { name: 'White', value: '#fff' },
    { name: 'Light Gray', value: '#eee' },
    { name: 'Gray', value: '#888' },
    { name: 'Black', value: '#222' },
    { name: 'Blue', value: '#4e54c8' },
    { name: 'Red', value: '#e44' },
    { name: 'Yellow', value: '#ffe066' },
    { name: 'Green', value: '#4caf50' },
  ];
  return (
    <div className="flex flex-row flex-wrap gap-2 items-center">
      {/* Transparent */}
      <button
        onClick={() => setBgColor('transparent')}
        className={`w-7 h-7 rounded border ${bgColor === 'transparent' ? 'border-2 border-indigo-400 shadow' : 'border-neutral-700'} bg-[repeating-conic-gradient(#ccc_0%_25%,_#fff_0%_50%)] bg-[length:10px_10px] relative outline-none`}
        title="Transparent"
      >
        <span className="absolute left-1 top-2 text-xs text-neutral-400 pointer-events-none">⌀</span>
      </button>
      {/* Presets */}
      {presets.map(opt => (
        <button
          key={opt.value}
          onClick={() => setBgColor(opt.value)}
          className={`w-7 h-7 rounded border ${bgColor === opt.value ? 'border-2 border-indigo-400 shadow' : 'border-neutral-700'} mx-0 cursor-pointer inline-block relative outline-none px-0`}
          style={{ background: opt.value }}
          title={opt.name}
        />
      ))}
      {/* Custom color */}
      <ColorSwatch value={bgColor} onChange={setBgColor} isTransparent={bgColor === 'transparent'} selected={bgColor !== 'transparent' && !presets.map(p => p.value).includes(bgColor)} />
    </div>
  );
}
