import { Checkbox } from '@/components/ui/checkbox';
import { type ReactNode } from 'react';

type ToggleSectionProps = {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
};

export function ToggleSection({ label, enabled, onToggle, children }: ToggleSectionProps) {
  return !enabled ? (
    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
      <Checkbox
        checked={enabled}
        onCheckedChange={onToggle}
        className="h-4 w-4"
      />
      <span>{label}</span>
    </label>
  ) : (
    <fieldset className="border border-neutral-700 rounded-lg p-4 flex flex-col gap-3">
      <legend className="flex items-center gap-2 text-xs font-medium px-2 -mx-2 cursor-pointer" onClick={() => onToggle(!enabled)}>
        <Checkbox
          checked={enabled}
          onCheckedChange={onToggle}
          className="h-4 w-4"
        />
        {label}
      </legend>
      {children}
    </fieldset>
  );
}
