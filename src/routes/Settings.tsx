import { useState } from 'react';
import { useSystemSettings, useUpdateSystemSettings } from '@/hooks/useSystemSettings';
import { useAiBacklog } from '@/hooks/useAiBacklog';
import { useToast } from '@/components/ui/toast';
import { AuctionPlatformsPanel } from '@/components/settings/AuctionPlatformsPanel';
import { AiCostPanel } from '@/components/settings/AiCostPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SystemSettingsDTO } from '@shared/types';

type ConnStatus = 'unknown' | 'pending' | 'connected' | 'unreachable';

const INTERVAL_OPTIONS = [4, 8, 12, 24] as const;

async function testHelper(url: string): Promise<ConnStatus> {
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/available`);
    return r.ok ? 'connected' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

// Wait-for-data wrapper. Each panel receives its slice via prop and seeds
// its state via useState initializer (no setState-in-effect to hydrate).
export function Settings() {
  const settingsQ = useSystemSettings();
  if (settingsQ.isLoading) return <p className="text-textDim">Loading…</p>;
  if (settingsQ.error) return <p className="text-danger">Failed to load settings: {(settingsQ.error as Error).message}</p>;
  if (!settingsQ.data) return null;
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-text">Settings</h1>
      <LabelPrinterPanel initial={settingsQ.data} />
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text">AI</h2>
        <AISchedulePanel initial={settingsQ.data} />
        <AiCostPanel settings={settingsQ.data} />
      </section>
      <AuctionPlatformsPanel />
    </div>
  );
}

function LabelPrinterPanel({ initial }: { initial: SystemSettingsDTO }) {
  const update = useUpdateSystemSettings();
  const { toast } = useToast();
  const [helperUrl, setHelperUrl] = useState(initial.labelPrinterHelperUrl ?? '');
  const [conn, setConn] = useState<ConnStatus>('unknown');

  const onSave = async () => {
    try {
      await update.mutateAsync({ labelPrinterHelperUrl: helperUrl || null });
      toast({ title: 'Settings saved', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not save settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
    }
  };

  const onTest = async () => {
    setConn('pending');
    setConn(await testHelper(helperUrl));
  };

  return (
    <section className="rounded-lg border border-border bg-surfaceSolid p-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-text">Label printer</h2>
        <p className="text-sm text-textDim mt-1">URL of the Zebra Browser Print helper running on the workstation. Typically <code className="font-mono">http://localhost:9100</code>.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="helper-url">Helper URL</Label>
        <div className="flex gap-2">
          <Input id="helper-url" value={helperUrl} onChange={(e) => setHelperUrl(e.target.value)} placeholder="http://localhost:9100" />
          <Button variant="outline" onClick={onTest} disabled={!helperUrl || conn === 'pending'}>
            {conn === 'pending' ? 'Testing…' : 'Test'}
          </Button>
        </div>
        {conn !== 'unknown' && conn !== 'pending' && (
          <p className={`text-xs ${conn === 'connected' ? 'text-success' : 'text-warning'}`}>
            {conn === 'connected' ? '✓ Helper reachable' : '✗ Helper unreachable'}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={onSave} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </section>
  );
}

function AISchedulePanel({ initial }: { initial: SystemSettingsDTO }) {
  const update = useUpdateSystemSettings();
  const backlog = useAiBacklog();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initial.aiScheduleEnabled);
  const [intervalHours, setIntervalHours] = useState(initial.aiScheduleIntervalHours);
  // Postgres TIME comes back as 'HH:MM:SS'; native <input type="time"> wants
  // HH:MM. Trim the seconds for display; we round-trip back as HH:MM on save.
  const [timeOfDay, setTimeOfDay] = useState(initial.aiScheduleTimeOfDay.slice(0, 5));

  const onSave = async () => {
    try {
      await update.mutateAsync({
        aiScheduleEnabled: enabled,
        aiScheduleIntervalHours: intervalHours,
        aiScheduleTimeOfDay: timeOfDay,
      });
      toast({ title: 'Settings saved', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not save settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
    }
  };

  return (
    <section className="rounded-lg border border-border bg-surfaceSolid p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Schedule</h3>
        <p className="text-sm text-textDim mt-1">
          When the AI subsystem is enabled, lots awaiting generation are batch-processed at this interval, anchored to the configured time of day. Phase 6 reads these values; until then, saving here just persists the configuration.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4" />
        <span className="text-text">AI scheduled runs enabled</span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ai-interval">Interval</Label>
          <select
            id="ai-interval"
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value))}
            className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm"
          >
            {INTERVAL_OPTIONS.map((h) => (
              <option key={h} value={h}>{h === 24 ? 'Every 24 hours (daily)' : `Every ${h} hours`}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-time">First run anchor (time of day)</Label>
          <Input id="ai-time" type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span
          aria-label={`${initial.aiPendingLotCount} lots pending AI`}
          className="text-xs text-textDim mr-auto"
          data-testid="ai-pending-count"
        >
          {initial.aiPendingLotCount === 1
            ? '1 lot pending AI'
            : `${initial.aiPendingLotCount} lots pending AI`}
        </span>
        <Button variant="outline" onClick={() => backlog.mutate()} disabled={backlog.isPending}>
          {backlog.isPending ? 'Running…' : 'Run Now'}
        </Button>
        <Button onClick={onSave} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </section>
  );
}
