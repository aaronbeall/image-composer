import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dices } from 'lucide-react';
import type { Sequence as Sequence } from '@/lib/layout';

interface SequenceSelectorProps {
  value: Sequence | '';
  onChange: (value: Sequence | '') => void;
}

const SEQUENCE_LABELS: Record<Sequence | '', string> = {
  'random': 'Random',
  'linear': 'Linear',
  'exponential': 'Exponential',
  'bulge': 'Bulge',
  'peak': 'Peak',
  '': 'Random',
};

export function SequenceSelector({ value, onChange }: SequenceSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="font-medium text-xs">Sequence</label>
        <span className="text-xs text-neutral-400">{SEQUENCE_LABELS[value]}</span>
      </div>
      <ToggleGroup type='single' variant='outline' value={value} onValueChange={(newValue) => onChange(newValue as Sequence | '')} className="w-full">
        <ToggleGroupItem value="linear" title="Linear" className="flex-1">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 14 L14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </ToggleGroupItem>
        <ToggleGroupItem value="exponential" title="Exponential" className="flex-1">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 14 C2 10 8 4 14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </ToggleGroupItem>
        <ToggleGroupItem value="bulge" title="Bulge" className="flex-1">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 14 Q8 2 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </ToggleGroupItem>
        <ToggleGroupItem value="peak" title="Peak" className="flex-1">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 14 Q6 11 8 2 Q10 11 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
