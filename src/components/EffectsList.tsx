import { X } from 'lucide-react';
import { Combobox } from './ui/combobox';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { EFFECT_CONFIG } from '@/types';
import type { Effect, EffectType, BlendMode } from '@/types';
import { titleCase } from '@/lib/utils';

interface EffectsListProps {
  effects: Effect[];
  setEffects: (effects: Effect[]) => void;
}

export function EffectsList({ effects, setEffects }: EffectsListProps) {
  return (
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
                        <span className="text-xs text-neutral-400">{titleCase(effect.blendMode ?? blendCfg.defaultBlendMode ?? blendCfg.blendModes[0])}</span>
                      </div>
                      <Combobox
                        options={blendCfg.blendModes.map(mode => ({ value: mode, label: titleCase(mode) }))}
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
  );
}
