import { useState, useEffect } from 'react';
import { useSystemSettings, useUpdateSystemSettings } from '@/hooks/useSystemSettings';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ConnStatus = 'unknown' | 'pending' | 'connected' | 'unreachable';

async function testHelper(url: string): Promise<ConnStatus> {
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/available`);
    return r.ok ? 'connected' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

export function Settings() {
  const settingsQ = useSystemSettings();
  const update = useUpdateSystemSettings();
  const { toast } = useToast();
  const [helperUrl, setHelperUrl] = useState('');
  const [conn, setConn] = useState<ConnStatus>('unknown');

  useEffect(() => {
    if (settingsQ.data) setHelperUrl(settingsQ.data.labelPrinterHelperUrl ?? '');
  }, [settingsQ.data]);

  const onSave = async () => {
    await update.mutateAsync({ labelPrinterHelperUrl: helperUrl || null });
    toast({ title: 'Settings saved', variant: 'success' });
  };

  const onTest = async () => {
    setConn('pending');
    setConn(await testHelper(helperUrl));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-text">Settings</h1>

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

      <section className="rounded-lg border border-border bg-surfaceAlt p-4 opacity-60">
        <h2 className="text-base font-semibold text-text">AI schedule</h2>
        <p className="text-sm text-textDim mt-1">Configured in a future phase.</p>
      </section>
      <section className="rounded-lg border border-border bg-surfaceAlt p-4 opacity-60">
        <h2 className="text-base font-semibold text-text">Organization</h2>
        <p className="text-sm text-textDim mt-1">Configured in a future phase.</p>
      </section>
    </div>
  );
}
