import { Slider } from '@/components/ui/slider';

interface ValueSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}

export function ValueSlider({ label, value, onChange, min = 0, max = 100, unit = '' }: ValueSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-xs flex items-center justify-between">
        <span>{label}</span>
        <span className="text-neutral-400 text-xs">
          {value}
          {unit}
        </span>
      </label>
      <Slider
        value={[value]}
        min={min}
        max={max}
        onValueChange={(val) => onChange(val[0])}
        className="w-full"
      />
    </div>
  );
}
