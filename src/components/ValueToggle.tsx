import { Switch } from '@/components/ui/switch';

interface ValueToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
  disabled?: boolean;
}

export function ValueToggle({ label, value, onChange, description, disabled }: ValueToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-neutral-100">{label}</span>
        {description && <span className="text-[11px] text-neutral-400 leading-tight">{description}</span>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
