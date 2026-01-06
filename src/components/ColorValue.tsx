import { ColorSwatch } from './ColorSwatch';

interface ColorValueProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isTransparent?: boolean;
  selected?: boolean;
}

export function ColorValue({ label, value, onChange, isTransparent, selected }: ColorValueProps) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium">{label}</label>
      <ColorSwatch value={value} onChange={onChange} isTransparent={isTransparent} selected={selected} />
    </div>
  );
}
