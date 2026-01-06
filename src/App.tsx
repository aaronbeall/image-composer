import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { ValueToggle } from './components/ValueToggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { addAlphaToHex, cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ClipboardIcon, ClipboardPaste, Dices, Download, Eye, EyeOff, HelpCircle, ImagePlus, Mail, LayoutGrid, Paintbrush, Share2, Upload, X, AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SiPatreon, SiBuymeacoffee } from 'react-icons/si';
import logoSvg from '@/assets/logo.svg';
import { ImageComposer } from './ImageComposer';
import { ColorSwatch } from './components/ColorSwatch';
import { ColorValue } from './components/ColorValue';
import { ToggleSection } from './components/ToggleSection';
import { PopoverTooltip } from './components/PopoverTooltip';
import { ValueSlider } from './components/ValueSlider';
import { EffectsList } from './components/EffectsList';
import type { Effect } from '@/types';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ComposeImageItem, LayoutType } from './lib/layout';

const NAV_ITEMS = [
  { key: 'images', icon: <ImagePlus size={20} />, label: 'Images' },
  { key: 'layout', icon: <LayoutGrid size={20} />, label: 'Layout' },
  { key: 'style', icon: <Paintbrush size={20} />, label: 'Style' },
];

const BG_PRESETS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Pearl', value: '#f1f5f9' },
  { name: 'Sky', value: '#7dc8ff' },
  { name: 'Teal', value: '#2dd4bf' },
  { name: 'Emerald', value: '#34d399' },
  { name: 'Lime', value: '#a3e635' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Coral', value: '#ff7b72' },
  { name: 'Rose', value: '#f472b6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Charcoal', value: '#1f2937' },
];
const LAYOUTS = [
  {
    key: 'grid',
    label: 'Grid',
    fit: true,
    justify: true,
    shape: 'rect' as const,
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
    fit: true,
    justify: true,
    shape: 'rect' as const,
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
    fit: true,
    justify: false,
    shape: 'rect' as const,
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
    key: 'masonry',
    label: 'Masonry',
    fit: true,
    justify: true,
    shape: 'rect' as const,
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
    key: 'lanes',
    label: 'Lanes',
    fit: true,
    justify: true,
    shape: 'rect' as const,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="3" width="8" height="3" rx="0.8" fill="currentColor" />
        <rect x="11" y="3" width="6" height="3" rx="0.8" fill="currentColor" />
        <rect x="2" y="9" width="7" height="3" rx="0.8" fill="currentColor" />
        <rect x="10" y="9" width="8" height="3" rx="0.8" fill="currentColor" />
        <rect x="2" y="15" width="6" height="3" rx="0.8" fill="currentColor" />
        <rect x="9" y="15" width="7" height="3" rx="0.8" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'cluster',
    label: 'Cluster',
    fit: false,
    justify: false,
    shape: 'rect' as const,
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
    key: 'bubble',
    label: 'Bubbles',
    fit: false,
    justify: false,
    shape: 'circle' as const,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="6" cy="7" r="3" fill="currentColor" />
        <circle cx="13" cy="5" r="2" fill="currentColor" />
        <circle cx="14" cy="12" r="4" fill="currentColor" />
        <circle cx="7" cy="14" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'single-column',
    label: 'Column',
    fit: true,
    justify: false,
    shape: 'rect' as const,
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
    fit: true,
    justify: false,
    shape: 'rect' as const,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="7" width="4" height="6" rx="1" fill="currentColor" />
        <rect x="8" y="7" width="4" height="6" rx="1" fill="currentColor" />
        <rect x="13" y="7" width="4" height="6" rx="1" fill="currentColor" />
      </svg>
    ),
  },
] as const satisfies {
  key: LayoutType;
  label: string;
  icon: React.ReactNode;
  fit: boolean;
  justify: boolean;
  shape: 'rect' | 'circle';
}[];

const LAYOUT_KEYS: LayoutType[] = LAYOUTS.map(l => l.key);

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
  const [aboutOpen, setAboutOpen] = useState(false);

  // Images state and drop/browse/paste logic
  const [images, setImages] = useState<ComposeImageItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);

  // Layout state
  const [layout, setLayout] = useState<LayoutType>('grid');
  const [spacing, setSpacing] = useState(20);
  const [scale, setScale] = useState(100);
  const [normalizeSize, setNormalizeSize] = useState(true);
  const [fit, setFit] = useState(true);
  const [justify, setJustify] = useState(true);
  const [jitterEnabled, setJitterEnabled] = useState(false);
  const [jitterPosition, setJitterPosition] = useState(10);
  const [jitterSize, setJitterSize] = useState(10);
  const [jitterRotation, setJitterRotation] = useState(10);
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

  // Layout capabilities are driven off metadata on LAYOUTS
  const selectedLayout = useMemo(() => LAYOUTS.find(l => l.key === layout), [layout]);
  const supportsFit = !!selectedLayout?.fit;
  const supportsJustify = !!selectedLayout?.justify;
  const shape = selectedLayout?.shape ?? 'rect';

  const randomPick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const randomBool = (probability = 0.5) => Math.random() < probability;

  const shuffleImages = () => {
    setImages(prev => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  };

  const randomizeBorderColor = (bg: string) => {
    const hex = bg.replace('#', '');
    if (hex.length !== 6) return '#0f172a';
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.6 ? '#0f172a' : '#f8fafc';
  };

  const handleShuffleAll = () => {
    if (images.length === 0) return;

    shuffleImages();

    setLayout(randomPick(LAYOUT_KEYS));
    setNormalizeSize(randomBool(0.5));
    setFit(true);
    setJustify(true);

    const enableJitter = randomBool(1 / 3);
    setJitterEnabled(enableJitter);
    if (enableJitter) {
      setJitterPosition(Math.floor(Math.random() * 101));
      setJitterSize(Math.floor(Math.random() * 101));
      setJitterRotation(Math.floor(Math.random() * 46));
    }

    const bgChoice = randomPick(BG_PRESETS).value;
    setBgColor(bgChoice);

    const enableBorder = randomBool(0.5);
    setBorderEnabled(enableBorder);
    if (enableBorder) {
      setBorderWidth(Math.floor(Math.random() * 61) + 4); // 4-64
      setBorderColor(randomizeBorderColor(bgChoice));
    }

    const enableShadow = randomBool(0.5);
    setShadowEnabled(enableShadow);
    if (enableShadow) {
      setShadowAngle(Math.floor(Math.random() * 361));
      setShadowDistance(Math.floor(Math.random() * 31) + 4); // 4-34
      setShadowBlur(Math.floor(Math.random() * 41) + 10); // 10-50
      setShadowOpacity(Math.floor(Math.random() * 41) + 40); // 40-80
      setShadowColor('#000000');
    }

    const enableCornerRadius = randomBool(0.5);
    if (enableCornerRadius) {
      setCornerRadius(Math.floor(Math.random() * 101)); // 0-100
    } else {
      setCornerRadius(0);
    }
  };

  return (
    <div className="w-screen h-screen bg-neutral-900 text-white flex flex-col overflow-hidden">
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
      <header className="fixed top-0 left-0 w-full h-14 bg-neutral-900/95 flex items-center justify-between z-50 border-b border-neutral-800 shadow-md px-4 lg:px-6">
        <div className="flex items-center gap-2.5">
          <img src={logoSvg} alt="Image Composer" className="w-8 h-8" />
          <span className="font-bold text-xl select-none bg-gradient-to-r from-indigo-400 via-indigo-300 to-indigo-400 bg-clip-text text-transparent">Image Composer</span>
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
          <button
            onClick={() => setAboutOpen(true)}
            className="inline-flex p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-indigo-400 transition"
            title="About Image Composer"
            aria-label="About"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </header>
      {/* Main layout */}
      <div className="flex-1 flex flex-row pt-14 w-full overflow-hidden">
        {/* Sidebar (large screens) */}
        <aside className={cn(
          'hidden lg:flex flex-col bg-neutral-950 border-r border-neutral-800 transition-all duration-200',
          sidebarOpen ? 'w-20' : 'w-12',
          'min-h-[calc(100vh-56px)]'
        )}>
          <div className="flex flex-col items-center py-4 gap-2 flex-1 group/sidebar">
            {NAV_ITEMS.map(tab => (
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
                    onReorder={(fromIndex, toIndex) => {
                      setImages(prev => arrayMove(prev, fromIndex, toIndex));
                    }}
                    onShuffle={() => {
                      setImages(prev => {
                        const shuffled = [...prev];
                        for (let i = shuffled.length - 1; i > 0; i--) {
                          const j = Math.floor(Math.random() * (i + 1));
                          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                        }
                        return shuffled;
                      });
                    }}
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
                <ValueSlider label="Spacing" value={spacing} onChange={setSpacing} max={100} />
                {/* Scale slider */}
                <ValueSlider label="Scale" value={scale} onChange={setScale} min={1} max={100} unit="%" />
                {/* Toggles */}
                <div className="flex flex-col gap-2 mt-2">
                  <ValueToggle label="Normalize sizes" value={normalizeSize} onChange={setNormalizeSize} />
                  {supportsFit && (
                    <ValueToggle label="Fit images" value={fit} onChange={setFit} />
                  )}
                  {supportsJustify && (
                    <ValueToggle label="Justify layout" value={justify} onChange={setJustify} />
                  )}
                </div>

                <ToggleSection label="Jitter" enabled={jitterEnabled} onToggle={setJitterEnabled}>
                  <ValueSlider label="Position" value={jitterPosition} onChange={setJitterPosition} max={100} unit="%" />
                  <ValueSlider label="Size" value={jitterSize} onChange={setJitterSize} max={100} unit="%" />
                  <ValueSlider label="Rotation" value={jitterRotation} onChange={setJitterRotation} max={45} unit="°" />
                </ToggleSection>
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
                {shape === 'rect' && (
                  <ValueSlider label="Corner Radius" value={cornerRadius} onChange={setCornerRadius} max={100} unit="%" />
                )}

                {/* Border selector */}
                <ToggleSection label="Border" enabled={borderEnabled} onToggle={setBorderEnabled}>
                  <ValueSlider label="Size" value={borderWidth} onChange={setBorderWidth} max={100} />
                  <ColorValue label="Color" value={borderColor} onChange={setBorderColor} />
                </ToggleSection>

                {/* Drop shadow selector */}
                <ToggleSection label="Drop Shadow" enabled={shadowEnabled} onToggle={setShadowEnabled}>
                  <ValueSlider label="Angle" value={shadowAngle} onChange={setShadowAngle} min={0} max={360} unit="°" />
                  <ValueSlider label="Distance" value={shadowDistance} onChange={setShadowDistance} max={100} />
                  <ValueSlider label="Blur" value={shadowBlur} onChange={setShadowBlur} max={100} />
                  <ColorValue label="Color" value={shadowColor} onChange={setShadowColor} />
                  <ValueSlider label="Opacity" value={shadowOpacity} onChange={setShadowOpacity} max={100} unit="%" />
                </ToggleSection>

                {/* Effects selector */}
                <EffectsList effects={effects} setEffects={setEffects} />
              </div>
            )}
          </div>
        </div>
        {/* Main work area */}
        <main className="flex-1 flex flex-col items-center justify-center bg-neutral-900 relative overflow-hidden pb-16 lg:pb-0">
          {images.length === 0 ? (
            <div
              ref={dropAreaRef}
              tabIndex={0}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              aria-label="Main image drop area"
              className={`transition-all border-2 ${isDragOver ? 'border-indigo-400 outline outline-2 outline-indigo-300 shadow-lg bg-gradient-to-r from-indigo-950 to-indigo-900' : 'border-dashed border-neutral-700'} rounded-2xl max-w-lg w-full flex flex-col justify-center items-center relative p-8 mb-8 cursor-pointer`}
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
              <div className="text-neutral-500 text-xs mt-6 max-w-xs text-center">
                Your images stay private — nothing is uploaded to servers. No account needed. All processing happens locally on your device.
              </div>
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
                  justify={supportsJustify ? justify : false}
                  jitterPosition={jitterEnabled ? jitterPosition : 0}
                  jitterSize={jitterEnabled ? jitterSize : 0}
                  jitterRotation={jitterEnabled ? jitterRotation : 0}
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
                  shape={shape}
                  effects={effects}
                  onUpdate={setCanvasInfo}
                />
              </div>
              {/* Status bar below the image composer */}
              <div className="w-full flex items-center justify-center bg-neutral-950/95 border-t border-neutral-800 py-2 z-10 min-h-9 max-h-9">
                <div className="text-xs text-neutral-400 flex flex-row gap-3 items-center">
                  {canvasInfo.width > 0 && canvasInfo.height > 0 && (
                    <>
                      <span>Image size: {canvasInfo.width} × {canvasInfo.height} px</span>
                      {(canvasInfo.width >= 3200 || canvasInfo.height >= 3200) && (
                        <PopoverTooltip
                          trigger={
                            <button className="p-1 hover:bg-neutral-800 rounded transition">
                              <AlertTriangle size={16} className="text-orange-400" />
                            </button>
                          }
                          content="3200px is the maximum size. Contact support for larger image sizes."
                          contentClassName="w-64 text-sm"
                        />
                      )}
                    </>
                  )}
                  <div className="inline-flex items-center gap-1">
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
                      className="inline-flex items-center justify-center bg-indigo-700 hover:bg-indigo-600 text-white px-2 py-1 rounded shadow"
                      style={{ fontSize: 'inherit' }}
                      onClick={handleBrowse}
                      title="Add more images"
                      aria-label="Add more images"
                    >
                      <ImagePlus size={14} />
                    </button>
                  </div>
                  <div className="inline-flex items-center gap-1">
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
                    {images.length > 0 && (
                      <button
                        onClick={handleShuffleAll}
                        className="inline-flex items-center justify-center p-1.5 rounded bg-indigo-700 hover:bg-indigo-600 text-white shadow transition"
                        title="Shuffle images and layout"
                      >
                        <Dices size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
        {/* Bottom nav and drawer (small screens) */}
        <Drawer>
          <div className="fixed bottom-0 left-0 w-full z-50 bg-neutral-950 border-t border-neutral-800 flex lg:hidden max-w-screen h-16">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="flex flex-row w-full justify-between px-2 bg-transparent h-full">
                {NAV_ITEMS.map(tab => (
                  <DrawerTrigger asChild key={tab.key}>
                    <TabsTrigger value={tab.key} className="flex-1 flex flex-col items-center gap-0.5 data-[state=active]:text-indigo-400 py-3">{tab.icon}<span className="text-xs">{tab.label}</span></TabsTrigger>
                  </DrawerTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <DrawerContent className="lg:hidden bg-neutral-950 border-t border-neutral-800 rounded-t-2xl p-0 max-h-[80vh] flex flex-col overflow-hidden">
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
                    onReorder={(fromIndex, toIndex) => {
                      setImages(prev => arrayMove(prev, fromIndex, toIndex));
                    }}
                    onShuffle={() => {
                      setImages(prev => {
                        const shuffled = [...prev];
                        for (let i = shuffled.length - 1; i > 0; i--) {
                          const j = Math.floor(Math.random() * (i + 1));
                          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                        }
                        return shuffled;
                      });
                    }}
                    size="small"
                  />
                </div>
              </TabsContent>
              <TabsContent value="layout">
                <div className="p-4">
                  <LayoutTypeSelector layout={layout} setLayout={setLayout} />
                  {/* Spacing slider */}
                  <div className="mb-2">
                    <ValueSlider label="Spacing" value={spacing} onChange={setSpacing} max={100} />
                  </div>
                  {/* Scale slider */}
                  <div className="mb-2">
                    <ValueSlider label="Scale" value={scale} onChange={setScale} min={1} max={100} unit="%" />
                  </div>
                  {/* Toggles */}
                  <div className="flex flex-col gap-2 mt-2 mb-2">
                    <ValueToggle label="Normalize sizes" value={normalizeSize} onChange={setNormalizeSize} />
                    {supportsFit && (
                      <ValueToggle label="Fit images" value={fit} onChange={setFit} />
                    )}
                    {supportsJustify && (
                      <ValueToggle label="Justify layout" value={justify} onChange={setJustify} />
                    )}
                  </div>

                  <div className="mt-2">
                    <ToggleSection label="Jitter" enabled={jitterEnabled} onToggle={setJitterEnabled}>
                      <ValueSlider label="Position" value={jitterPosition} onChange={setJitterPosition} max={100} unit="%" />
                      <ValueSlider label="Size" value={jitterSize} onChange={setJitterSize} max={100} unit="%" />
                      <ValueSlider label="Rotation" value={jitterRotation} onChange={setJitterRotation} max={45} unit="°" />
                    </ToggleSection>
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
                  {shape === 'rect' && (
                    <div className="mt-4">
                      <ValueSlider label="Corner Radius" value={cornerRadius} onChange={setCornerRadius} max={100} unit="%" />
                    </div>
                  )}
                  {/* Border selector */}
                  <div className="mt-4">
                    <ToggleSection label="Border" enabled={borderEnabled} onToggle={setBorderEnabled}>
                      <ValueSlider label="Size" value={borderWidth} onChange={setBorderWidth} max={100} />
                      <ColorValue label="Color" value={borderColor} onChange={setBorderColor} />
                    </ToggleSection>
                  </div>
                  {/* Drop shadow selector */}
                  <div className="mt-4">
                    <ToggleSection label="Drop Shadow" enabled={shadowEnabled} onToggle={setShadowEnabled}>
                      <ValueSlider label="Angle" value={shadowAngle} onChange={setShadowAngle} max={360} unit="°" />
                      <ValueSlider label="Distance" value={shadowDistance} onChange={setShadowDistance} max={100} />
                      <ValueSlider label="Blur" value={shadowBlur} onChange={setShadowBlur} max={100} />
                      <ValueSlider label="Opacity" value={shadowOpacity} onChange={setShadowOpacity} max={100} unit="%" />
                      <ColorValue label="Color" value={shadowColor} onChange={setShadowColor} />
                    </ToggleSection>
                  </div>
                  {/* Effects selector */}
                  <EffectsList effects={effects} setEffects={setEffects} />
                </div>
              </TabsContent>
            </Tabs>
          </DrawerContent>
        </Drawer>
      </div>

      {/* About Dialog */}
      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="sm:max-w-md bg-neutral-900 border-neutral-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">About Image Composer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-neutral-300">
            <div>
              <h3 className="font-semibold text-white mb-1">Created by</h3>
              <p>
                <a href="https://metamodernmonkey.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">
                  MetaModernMonkey.com
                </a>
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-1">Free to Use</h3>
              <p>Image Composer is completely free to use. No accounts, no subscriptions, no ads. Your images are processed locally on your device and never uploaded to any server.</p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-1">Disclaimer</h3>
              <p>Image Composer is provided as-is without warranties. While we strive for reliability and functionality, we're not liable for any damages or loss resulting from use of this tool.</p>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-2">Support</h3>
              <div className="space-y-2">
                <a
                  href="mailto:support@metamodernmonkey.com"
                  className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition"
                >
                  <Mail size={16} />
                  support@metamodernmonkey.com
                </a>
                <a
                  href="https://buymeacoffee.com/metamodernmonkey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition"
                >
                  <SiBuymeacoffee size={16} />
                  Buy Me a Coffee
                </a>
                <a
                  href="https://patreon.com/metamodernmonkey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition"
                >
                  <SiPatreon size={16} />
                  Patreon
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Reusable Components ---

type SortableImageTileProps = {
  img: ComposeImageItem;
  idx: number;
  size: 'large' | 'small';
  onToggleHide: (idx: number) => void;
  onRemove: (idx: number) => void;
};

function SortableImageTile({ img, idx, size, onToggleHide, onRemove }: SortableImageTileProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: img.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={size === 'large'
        ? `relative min-w-[100px] max-w-[140px] flex flex-col items-center bg-neutral-800 rounded-lg shadow-md p-2 cursor-move transition-all ${isDragging ? 'opacity-50 scale-95 z-50' : ''}`
        : `relative min-w-[72px] max-w-[90px] flex flex-col items-center bg-neutral-800 rounded-lg shadow-md p-1 mx-1 cursor-move transition-all ${isDragging ? 'opacity-50 scale-95 z-50' : ''}`}
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
          onClick={(e) => {
            e.stopPropagation();
            onToggleHide(idx);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {img.hidden ? (size === 'large' ? <EyeOff size={18} /> : <EyeOff size={16} />) : (size === 'large' ? <Eye size={18} /> : <Eye size={16} />)}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-red-400"
          title="Remove image"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(idx);
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {size === 'large' ? <X size={18} /> : <X size={16} />}
        </Button>
      </div>
    </div>
  );
}

type ImageTileListProps = {
  images: ComposeImageItem[];
  onToggleHide: (idx: number) => void;
  onRemove: (idx: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onShuffle: () => void;
  size: 'large' | 'small';
};

function ImageTileList({ images, onToggleHide, onRemove, onReorder, onShuffle, size }: ImageTileListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);
      onReorder(oldIndex, newIndex);
    }
  };

  if (images.length === 0) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={images.map((img) => img.id)}
        strategy={rectSortingStrategy}
      >
        <div className={size === 'large' ? 'flex flex-row flex-wrap gap-3' : 'flex flex-row gap-2 overflow-x-auto pb-2'}>
          {images.map((img, idx) => (
            <SortableImageTile
              key={img.id}
              img={img}
              idx={idx}
              size={size}
              onToggleHide={onToggleHide}
              onRemove={onRemove}
            />
          ))}
          {images.length > 1 && (
            <button
              onClick={onShuffle}
              className={size === 'large'
                ? 'relative min-w-[100px] max-w-[140px] flex flex-col items-center justify-center bg-neutral-800 hover:bg-neutral-700 rounded-lg shadow-md p-2 cursor-pointer transition-colors border border-neutral-700 hover:border-indigo-500'
                : 'relative min-w-[72px] max-w-[90px] flex flex-col items-center justify-center bg-neutral-800 hover:bg-neutral-700 rounded-lg shadow-md p-1 mx-1 cursor-pointer transition-colors border border-neutral-700 hover:border-indigo-500'}
              title="Shuffle images"
            >
              <Dices size={size === 'large' ? 32 : 24} className="text-neutral-400" />
              <span className="text-xs text-neutral-400 mt-1">Shuffle</span>
            </button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

type LayoutTypeSelectorProps = {
  layout: LayoutType;
  setLayout: (layout: LayoutType) => void;
};
function LayoutTypeSelector({ layout, setLayout }: LayoutTypeSelectorProps) {
  return (
    <div className="flex flex-row flex-wrap gap-2">
      {LAYOUTS.map(l => (
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
      {BG_PRESETS.map(opt => (
        <button
          key={opt.value}
          onClick={() => setBgColor(opt.value)}
          className={`w-7 h-7 rounded border ${bgColor === opt.value ? 'border-2 border-indigo-400 shadow' : 'border-neutral-700'} mx-0 cursor-pointer inline-block relative outline-none px-0`}
          style={{ background: opt.value }}
          title={opt.name}
        />
      ))}
      {/* Custom color */}
      <ColorSwatch value={bgColor} onChange={setBgColor} isTransparent={bgColor === 'transparent'} selected={bgColor !== 'transparent' && !BG_PRESETS.map(p => p.value).includes(bgColor)} />
    </div>
  );
}
