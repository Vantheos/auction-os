// src/routes/DesignSystem.tsx
// Design system audit page — renders the app's UI primitives so visual
// affordance can be reviewed in one place. Linked from the AdminShell.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type SwatchProps = { name: string; value: string; sample: string; textOn?: string };

function Swatch({ name, value, sample, textOn }: SwatchProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surfaceSolid">
      <div
        className="size-12 rounded-md border border-border shrink-0"
        style={{ background: sample, color: textOn }}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-text">{name}</div>
        <div className="text-xs text-textDim font-mono truncate">{value}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-text border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 items-start py-2">
      <div className="text-xs text-textDim font-mono pt-2">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function DesignSystem() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-text">Design system audit</h1>
        <p className="text-sm text-textDim mt-1">
          Mica Slate tokens applied to shadcn primitives. Use this page to spot affordance
          and consistency gaps before building Phase 2 UI on top.
        </p>
      </div>

      <Section title="Color tokens (Mica Slate)">
        <div className="grid grid-cols-2 gap-2">
          <Swatch name="accent / --primary" value="#1E40AF" sample="#1E40AF" textOn="#fff" />
          <Swatch name="text / --foreground" value="#0F172A" sample="#0F172A" textOn="#fff" />
          <Swatch name="textDim / --muted-foreground" value="#475569" sample="#475569" textOn="#fff" />
          <Swatch name="textFaint" value="#94A3B8" sample="#94A3B8" textOn="#fff" />
          <Swatch name="surface / --card" value="rgba(255,255,255,0.72)" sample="rgba(255,255,255,0.72)" />
          <Swatch name="surfaceAlt / --secondary" value="#F8FAFC" sample="#F8FAFC" />
          <Swatch name="surfaceSolid / --popover" value="#FFFFFF" sample="#FFFFFF" />
          <Swatch name="border" value="rgba(15,23,42,0.08)" sample="rgba(15,23,42,0.08)" />
          <Swatch name="success" value="#15803D" sample="#15803D" textOn="#fff" />
          <Swatch name="warning" value="#92400E" sample="#92400E" textOn="#fff" />
          <Swatch name="danger / --destructive" value="#B91C1C" sample="#B91C1C" textOn="#fff" />
          <Swatch name="info" value="#1E40AF" sample="#1E40AF" textOn="#fff" />
        </div>
      </Section>

      <Section title="Buttons — variants">
        <Row label="default">
          <Button>Primary action</Button>
          <Button disabled>Disabled</Button>
        </Row>
        <Row label="outline">
          <Button variant="outline">Cancel</Button>
          <Button variant="outline" disabled>Disabled</Button>
        </Row>
        <Row label="secondary">
          <Button variant="secondary">Secondary</Button>
          <Button variant="secondary" disabled>Disabled</Button>
        </Row>
        <Row label="ghost">
          <Button variant="ghost">Ghost</Button>
          <Button variant="ghost" disabled>Disabled</Button>
        </Row>
        <Row label="destructive">
          <Button variant="destructive">Delete</Button>
        </Row>
        <Row label="link">
          <Button variant="link">View details</Button>
        </Row>
      </Section>

      <Section title="Buttons — sizes">
        <Row label="xs">
          <Button size="xs">Extra small</Button>
          <Button size="xs" variant="outline">XS outline</Button>
        </Row>
        <Row label="sm">
          <Button size="sm">Small</Button>
          <Button size="sm" variant="outline">SM outline</Button>
        </Row>
        <Row label="default">
          <Button>Default</Button>
          <Button variant="outline">Default outline</Button>
        </Row>
        <Row label="lg">
          <Button size="lg">Large</Button>
          <Button size="lg" variant="outline">LG outline</Button>
        </Row>
      </Section>

      <Section title="Inputs and form fields">
        <Row label="default">
          <div className="w-64 space-y-1.5">
            <Label htmlFor="ds-default">Customer name</Label>
            <Input id="ds-default" placeholder="e.g. Smith Estate" />
          </div>
        </Row>
        <Row label="filled">
          <div className="w-64 space-y-1.5">
            <Label htmlFor="ds-filled">Job number</Label>
            <Input id="ds-filled" defaultValue="2026-04-Smith-001" />
          </div>
        </Row>
        <Row label="disabled">
          <div className="w-64 space-y-1.5">
            <Label htmlFor="ds-disabled">Read-only</Label>
            <Input id="ds-disabled" defaultValue="Not editable" disabled />
          </div>
        </Row>
        <Row label="error">
          <div className="w-64 space-y-1.5">
            <Label htmlFor="ds-error">With error</Label>
            <Input id="ds-error" defaultValue="" aria-invalid />
            <p className="text-xs text-danger">This field is required.</p>
          </div>
        </Row>
      </Section>

      <Section title="Dialog (modal)">
        <Row label="trigger">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New customer</DialogTitle>
                <DialogDescription>Add a customer to the directory.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="ds-dialog-name">Name</Label>
                <Input id="ds-dialog-name" placeholder="Customer name" autoFocus />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Row>
      </Section>

      <Section title="Table">
        <div className="rounded-lg border border-border bg-surface p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Job count</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Smith Estate</TableCell>
                <TableCell>3</TableCell>
                <TableCell className="text-textDim font-mono text-xs">2026-04-29 10:24</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost">View →</Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Jones Family</TableCell>
                <TableCell>1</TableCell>
                <TableCell className="text-textDim font-mono text-xs">2026-04-30 09:11</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost">View →</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section title="Status / inline messages">
        <Row label="success">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-success-bg text-success text-xs font-medium">
            Saved
          </span>
        </Row>
        <Row label="warning">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-warning-bg text-warning text-xs font-medium">
            Printer offline
          </span>
        </Row>
        <Row label="danger">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-danger-bg text-danger text-xs font-medium">
            Failed to save
          </span>
        </Row>
        <Row label="info">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-info-bg text-info text-xs font-medium">
            Draft
          </span>
        </Row>
      </Section>

      <Section title="Typography">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text">H1 — Page title (text-2xl semibold)</h1>
          <h2 className="text-xl font-semibold text-text">H2 — Section (text-xl semibold)</h2>
          <h3 className="text-base font-semibold text-text">H3 — Subsection (text-base semibold)</h3>
          <p className="text-sm text-text">Body text (text-sm).</p>
          <p className="text-sm text-textDim">Dimmed body (text-textDim) — for metadata, helper text.</p>
          <p className="text-xs text-textFaint">Faint caption (text-xs textFaint).</p>
          <p className="text-xs font-mono text-textDim">Monospace caption (font-mono) — for IDs, dates.</p>
        </div>
      </Section>
    </div>
  );
}
