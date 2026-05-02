// src/components/lot/LotEditForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
};

export function LotEditForm({ lot, onSubmit, busy }: Props) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<LotFormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      title: lot.title ?? '',
      description: lot.description ?? '',
      price: lot.price ?? '',
      quantity: lot.quantity ?? 1,
      ref1: lot.ref1 ?? '',
      ref2: lot.ref2 ?? '',
      specialNotesCategory: lot.specialNotesCategory,
      specialNotesText: lot.specialNotesText ?? '',
      untested: lot.untested,
    },
  });
  // react-hooks/incompatible-library: react-hook-form's `watch` is opaque to
  // the React Compiler analyzer. We're not running the compiler in this
  // project, so the warning is informational only. Standard RHF usage.
  // eslint-disable-next-line react-hooks/incompatible-library
  const category = watch('specialNotesCategory');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" type="number" min={1} {...register('quantity', { valueAsNumber: true })} />
        </div>
        <label className="flex items-center gap-2 text-sm pt-6">
          <input type="checkbox" {...register('untested')} className="size-4" />
          Untested
        </label>
      </div>

      <div className="space-y-1">
        <Label htmlFor="title">Title <span className="text-textDim">(max 50 chars)</span></Label>
        <Input id="title" maxLength={50} placeholder="e.g., 1x Antique Brass Vase" {...register('title')} />
        {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <textarea id="description" rows={4} {...register('description')}
          className="w-full rounded-md border border-borderStrong bg-surfaceSolid px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="price">Price</Label>
          <Input id="price" placeholder="45.00" {...register('price')} />
          {errors.price && <p className="text-xs text-danger">{errors.price.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="specialNotesCategory">Special notes</Label>
          <select id="specialNotesCategory" {...register('specialNotesCategory')}
            className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm">
            <option>None</option><option>TOOL ONLY</option><option>READ</option><option>CLOTHING</option>
          </select>
        </div>
      </div>

      {category === 'CLOTHING' && (
        <div className="space-y-1">
          <Label htmlFor="specialNotesText">Size</Label>
          <Input id="specialNotesText" {...register('specialNotesText')} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ref1">Ref 1</Label>
          <Input id="ref1" {...register('ref1')} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ref2">Ref 2</Label>
          <Input id="ref2" {...register('ref2')} />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
