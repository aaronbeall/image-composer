import { Slider } from '@/components/ui/slider';

interface ValueRangeProps {
  label: string;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  min?: number;
  max?: number;
  unit?: string;
}

export function ValueRange({ label, value, onChange, min = -100, max = 100, unit = '' }: ValueRangeProps) {
  const formatValue = (val: number) => {
    const sign = val > 0 ? '+' : '';
    return `${sign}${val}${unit}`;
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-xs flex items-center justify-between">
        <span>{label}</span>
        <span className="text-neutral-400 text-xs">
          {formatValue(value[0])} ↔ {formatValue(value[1])}
        </span>
      </label>
      <Slider
        value={value}
        min={min}
        max={max}
        onValueChange={(val) => onChange([val[0], val[1]])}
        className="w-full"
      />
    </div>
  );
}
