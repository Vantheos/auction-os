// src/components/lot/LotEditForm.tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LotDTO } from '@shared/types';

const Schema = z.object({
  title: z.string().max(50).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid price').nullable().optional().or(z.literal('')),
  quantity: z.coerce.number().int().positive(),
  ref1: z.string().max(200).nullable().optional(),
  ref2: z.string().max(200).nullable().optional(),
  specialNotesCategory: z.enum(['None', 'TOOL ONLY', 'READ', 'CLOTHING']),
  specialNotesText: z.string().max(200).nullable().optional(),
  untested: z.boolean(),
});

export type LotFormValues = z.infer<typeof Schema>;

type Props = {
  lot: LotDTO;
  onSubmit: (values: LotFormValues) => Promise<void> | void;
  busy?: boolean;
  // Notify parent when dirty state changes. Used by Inventory to gate the
  // close action with an "unsaved changes" confirm dialog.
  onDirtyChange?: (dirty: boolean) => void;
  // Phase 6: when AI generation is in flight on this lot, disable all
  // editable inputs so the operator can't race the AI write. Save button
  // is also disabled. The dialog close + state-change controls remain
  // enabled (handled by parent LotDetail).
  disabled?: boolean;
};

export function LotEditForm({ lot, onSubmit, busy, onDirtyChange, disabled }: Props) {
  const { register, handleSubmit, watch, reset, formState: { isDirty, errors } } = useForm<LotFormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      title: lot.title ?? '',
      description: lot.description ?? '',
      price: lot.price ?? '',
      quantity: lot.quantity,
      ref1: lot.ref1 ?? '',
      ref2: lot.ref2 ?? '',
      specialNotesCategory: lot.specialNotesCategory,
      specialNotesText: lot.specialNotesText ?? '',
      untested: lot.untested,
    },
  });

  // "Additional Info" collapse — Title / Description / Price / Ref1 / Ref2
  // hidden by default to match the cataloging-session design (option-c-flow
  // spec) and reduce form length on mobile. AI fills these on the back-channel;
  // user expands to override AI output or set values manually.
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);

  // Surface dirty state to the parent. RHF's isDirty toggles on first edit and
  // back to false after reset(values) post-save (handled below). The parent is
  // responsible for resetting its own dirty tracking when the modal closes.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleValid = async (values: LotFormValues) => {
    // Normalize empty strings to null for nullable string fields. HTML inputs
    // can't hold null, so RHF surfaces blank fields as ''. The server's
    // PatchSchema validates price against a regex that doesn't accept '',
    // and (correctly) prefers null over '' for absent values. Without this
    // transform, saving a lot whose price is unset surfaces a 400 with the
    // server's Zod default message ("Invalid"), confusing the user.
    const normalized: LotFormValues = {
      ...values,
      title: values.title || null,
      description: values.description || null,
      price: values.price || null,
      ref1: values.ref1 || null,
      ref2: values.ref2 || null,
      specialNotesText: values.specialNotesText || null,
    };
    await onSubmit(normalized);
    // Mark current values as the new baseline so isDirty returns to false.
    // We reset to `values` (user-typed shape with '' for empty), not
    // `normalized` (with null), so the form input and dirty-comparison stay
    // consistent with what the input control actually holds.
    // If onSubmit threw, the catch in the parent handler already toasted;
    // we don't reach here in that case (handleSubmit awaits this fn).
    reset(values);
  };
  // react-hooks/incompatible-library: react-hook-form's `watch` is opaque to
  // the React Compiler analyzer. We're not running the compiler in this
  // project, so the warning is informational only. Standard RHF usage.
  // eslint-disable-next-line react-hooks/incompatible-library
  const category = watch('specialNotesCategory');

  return (
    <form onSubmit={handleSubmit(handleValid)} className="space-y-3">
      {/* Required-visible row — Quantity + Untested */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" type="number" min={1} disabled={disabled} {...register('quantity', { valueAsNumber: true })} />
        </div>
        <label className="flex items-center gap-2 text-sm pt-6">
          <input type="checkbox" disabled={disabled} {...register('untested')} className="size-4" />
          Untested
        </label>
      </div>

      {/* Special notes — required, full-width per design spec */}
      <div className="space-y-1">
        <Label htmlFor="specialNotesCategory">Special notes</Label>
        <select id="specialNotesCategory" disabled={disabled} {...register('specialNotesCategory')}
          className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
          <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
        </select>
      </div>

      {/* Conditional Size field for CLOTHING */}
      {category === 'CLOTHING' && (
        <div className="space-y-1">
          <Label htmlFor="specialNotesText">Size</Label>
          <Input id="specialNotesText" disabled={disabled} {...register('specialNotesText')} />
        </div>
      )}

      {/* Additional Info — collapsed by default; matches the cataloging
          session UX so the form doesn't dwarf the action footer. */}
      <button
        type="button"
        onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md border border-border bg-surfaceAlt text-sm font-medium text-textDim text-left"
        aria-expanded={showAdditionalInfo}
      >
        {showAdditionalInfo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Additional Info</span>
      </button>

      {showAdditionalInfo && (
        <div className="space-y-3 p-3 rounded-md border border-border bg-surfaceSolid">
          <div className="space-y-1">
            <Label htmlFor="title">Title <span className="text-textDim">(max 50 chars)</span></Label>
            <Input id="title" maxLength={50} placeholder="AI will fill" disabled={disabled} {...register('title')} />
            {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <textarea id="description" rows={4} placeholder="AI will fill" disabled={disabled} {...register('description')}
              className="w-full rounded-md border border-borderStrong bg-surfaceSolid px-3 py-2 text-sm" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="price">Price</Label>
            <Input id="price" placeholder="45.00" disabled={disabled} {...register('price')} />
            {errors.price && <p className="text-xs text-danger">{errors.price.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ref1">Ref 1</Label>
              <Input id="ref1" disabled={disabled} {...register('ref1')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ref2">Ref 2</Label>
              <Input id="ref2" disabled={disabled} {...register('ref2')} />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={busy || disabled}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
