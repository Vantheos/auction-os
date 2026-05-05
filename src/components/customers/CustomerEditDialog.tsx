// src/components/customers/CustomerEditDialog.tsx
// Phase 5 Area 2 — edit form for an existing customer.
//
// Fields:
//   - name (required, 1-200 chars)
//   - sellerCode (1-50 chars when present; allowed empty save for existing
//     customers that carry null — but export endpoint blocks until set)
//   - Disable / Re-enable button (with secondary confirm dialog)
//
// Mirrors the Phase 4 user disable/re-enable pattern.
//
// Form state lives in EditForm (a keyed child) so that form fields
// initialize fresh from props each time a different customer is opened —
// no useEffect-driven state resets needed.
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useUpdateCustomer, useToggleCustomerDisabled } from '@/hooks/useCustomers';
import type { CustomerDTO, UpdateCustomerRequest } from '@shared/types';

export function CustomerEditDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: CustomerDTO;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed by customer.id so opening a different customer
            initializes a fresh EditForm with state from that customer's
            props, no setState-in-effect needed. */}
        <EditForm key={customer.id} customer={customer} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ customer, onClose }: { customer: CustomerDTO; onClose: () => void }) {
  const update = useUpdateCustomer();
  const toggleDisabled = useToggleCustomerDisabled();
  const { toast } = useToast();

  const [name, setName] = useState(customer.name);
  const [sellerCode, setSellerCode] = useState(customer.sellerCode ?? '');
  const [confirmDisable, setConfirmDisable] = useState(false);

  const isDisabled = customer.disabledAt !== null;
  const sellerCodeMissing = customer.sellerCode === null;

  const onSave = async () => {
    const trimmedName = name.trim();
    const trimmedSellerCode = sellerCode.trim();

    const patch: UpdateCustomerRequest = {};
    if (trimmedName !== customer.name) patch.name = trimmedName;
    // Only send sellerCode if non-empty AND changed. We intentionally do
    // NOT send empty string (server rejects with 400). For existing
    // customers carrying null, admin can save name changes without
    // touching sellerCode.
    if (trimmedSellerCode && trimmedSellerCode !== customer.sellerCode) {
      patch.sellerCode = trimmedSellerCode;
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    try {
      await update.mutateAsync({ id: customer.id, ...patch });
      toast({ title: 'Customer updated', variant: 'success' });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not update customer',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
    }
  };

  const onConfirmDisableToggle = async () => {
    try {
      await toggleDisabled.mutateAsync({ id: customer.id, disabled: !isDisabled });
      toast({
        title: isDisabled ? 'Customer re-enabled' : 'Customer disabled',
        variant: 'success',
      });
      setConfirmDisable(false);
      onClose();
    } catch (err) {
      toast({
        title: isDisabled ? 'Could not re-enable customer' : 'Could not disable customer',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
      setConfirmDisable(false);
    }
  };

  return (
    <>
      <DialogHeader><DialogTitle>Edit customer</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="cust-name">Name</Label>
          <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cust-seller-code">Seller Code</Label>
          <Input
            id="cust-seller-code"
            value={sellerCode}
            onChange={(e) => setSellerCode(e.target.value)}
            maxLength={50}
            placeholder="e.g. SMTH001"
          />
          {sellerCodeMissing && !sellerCode.trim() && (
            <p className="text-xs text-warning">
              Seller Code is required before exporting jobs for this customer.
            </p>
          )}
          <p className="text-xs text-textDim">
            From AF360 → Customers → Customer List → Customer Code.
          </p>
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-textDim mb-2">
            Status: {isDisabled
              ? <span className="text-warning font-medium">Disabled</span>
              : <span className="text-success font-medium">Active</span>}
          </p>
          <Button
            variant={isDisabled ? 'outline' : 'ghost'}
            size="sm"
            onClick={() => setConfirmDisable(true)}
          >
            {isDisabled ? 'Re-enable customer' : 'Disable customer'}
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={update.isPending}>Cancel</Button>
        <Button onClick={onSave} disabled={!name.trim() || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>

      <Dialog open={confirmDisable} onOpenChange={(o) => !o && setConfirmDisable(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isDisabled
                ? `Re-enable ${customer.name}?`
                : `Disable ${customer.name}?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-textDim">
            {isDisabled
              ? 'They will reappear in cataloging and new-job flows.'
              : 'They will be hidden from cataloging and new-job creation. Existing jobs are unaffected.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDisable(false)} disabled={toggleDisabled.isPending}>Cancel</Button>
            <Button
              variant={isDisabled ? 'default' : 'destructive'}
              onClick={onConfirmDisableToggle}
              disabled={toggleDisabled.isPending}
            >
              {toggleDisabled.isPending ? 'Saving…' : (isDisabled ? 'Re-enable' : 'Disable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
