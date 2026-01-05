type ColorSwatchProps = {
  value: string;
  onChange: (color: string) => void;
  selected?: boolean;
  isTransparent?: boolean;
};

export function ColorSwatch({ value, onChange, selected = false, isTransparent = false }: ColorSwatchProps) {
  return (
    <label
      className={`w-7 h-7 rounded border mx-0 cursor-pointer relative outline-none inline-block flex items-center justify-center ${selected ? 'border-2 border-indigo-400 shadow' : 'border-neutral-700'}`}
      title="Custom color"
      style={{ background: isTransparent ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px' : value }}
    >
      <span className="absolute left-1.5 top-1.5 text-base text-neutral-700 pointer-events-none">🎨</span>
      <input
        type="color"
        value={isTransparent ? '#ffffff' : value}
        onChange={e => onChange(e.target.value)}
        className="absolute left-0 top-0 w-7 h-7 opacity-0 cursor-pointer border-none p-0 z-10"
        tabIndex={-1}
        aria-label="Custom color"
      />
    </label>
  );
}
