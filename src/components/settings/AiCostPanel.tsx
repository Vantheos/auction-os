// src/components/settings/AiCostPanel.tsx
// Read-only cost displays under Settings → AI.
import type { SystemSettingsDTO } from '@shared/types';

type Props = { settings: SystemSettingsDTO };

function formatDollars(cents: number, fractionDigits = 2): string {
  return `$${(cents / 100).toFixed(fractionDigits)}`;
}

export function AiCostPanel({ settings }: Props) {
  const mtd = formatDollars(settings.aiCostMtdCents);
  const avgPerLot = settings.aiRunCountLifetime > 0
    ? formatDollars(settings.aiCostLifetimeCents / settings.aiRunCountLifetime, 3)
    : null;

  return (
    <section className="rounded-lg border border-border bg-surfaceSolid p-4 space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-text">Cost</h3>
        <p className="text-xs text-textDim mt-1">
          Token usage is captured per AI call and accumulated here.
          Investigate spikes via the Anthropic billing dashboard.
        </p>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-textDim">Month-to-date cost</dt>
          <dd className="text-text font-medium">{mtd}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-textDim">Average per lot</dt>
          <dd className="text-text font-medium">
            {avgPerLot ?? <span className="text-textDim italic">no data yet</span>}
          </dd>
        </div>
      </dl>
    </section>
  );
}
