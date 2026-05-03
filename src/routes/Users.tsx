// src/routes/Users.tsx
// Phase 4 Area 2 — admin UI for user management.
// List + add + role change (with confirm) + disable/re-enable (with confirm).
// No hard delete: FK on lot.intake_operator_id blocks delete for users with
// lots; out-of-band cleanup via Supabase dashboard for the narrow typo case.

import { useState } from 'react';
import { useUsers, useCreateUser, useUpdateUser } from '@/hooks/useUsers';
import { useSession } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from '@/components/ui/table';
import type { UserDTO, UserRole } from '@shared/types';

const ROLES: UserRole[] = ['admin', 'office', 'warehouse'];

export function Users() {
  const { data: users, isLoading, error } = useUsers();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <NewUserButton />
      </div>

      {error && <p className="text-sm text-danger">Error loading: {(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-textDim">Loading…</p>}
      {users && <UsersTable users={users} />}
    </div>
  );
}

function UsersTable({ users }: { users: UserDTO[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Display name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => <UserRowEntry key={u.id} user={u} />)}
        {users.length === 0 && (
          <TableRow><TableCell colSpan={6} className="text-textDim text-center">No users yet</TableCell></TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function UserRowEntry({ user }: { user: UserDTO }) {
  const { session } = useSession();
  const isSelf = session?.user.id === user.id;
  const isDisabled = !!user.disabledAt;

  return (
    <TableRow>
      <TableCell className="font-medium">{user.displayName}{isSelf && <span className="text-textDim text-xs ml-2">(you)</span>}</TableCell>
      <TableCell className="text-textDim text-sm">{user.email ?? '—'}</TableCell>
      <TableCell><RoleSelect user={user} /></TableCell>
      <TableCell>
        {isDisabled
          ? <span className="text-xs px-2 py-0.5 rounded-pill bg-warning-bg text-warning">Disabled</span>
          : <span className="text-xs px-2 py-0.5 rounded-pill bg-success-bg text-success">Active</span>}
      </TableCell>
      <TableCell className="text-textDim font-mono text-xs">{new Date(user.createdAt).toLocaleDateString()}</TableCell>
      <TableCell>
        <DisableToggleButton user={user} isSelf={isSelf} />
      </TableCell>
    </TableRow>
  );
}

function RoleSelect({ user }: { user: UserDTO }) {
  const update = useUpdateUser();
  const { toast } = useToast();
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as UserRole;
    if (next === user.role) return;
    setPendingRole(next);
  };

  const cancel = () => {
    setPendingRole(null);
  };

  const confirm = async () => {
    if (!pendingRole) return;
    try {
      await update.mutateAsync({ id: user.id, input: { role: pendingRole } });
      toast({ title: 'Role updated', variant: 'success' });
    } catch (err) {
      toast({
        title: 'Could not change role',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
    } finally {
      setPendingRole(null);
    }
  };

  // The select's value follows the server-confirmed role (user.role). The
  // pending-role state drives only the confirm dialog; we do NOT bind the
  // select to pendingRole to avoid the "looks changed before save" effect
  // (which would mislead the user into thinking the change applied).
  return (
    <>
      <select
        value={user.role}
        onChange={onChange}
        disabled={update.isPending}
        className="h-8 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm"
      >
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <Dialog open={!!pendingRole} onOpenChange={(o) => !o && cancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change {user.displayName}'s role?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-textDim">
            Role will change from <strong>{user.role}</strong> to <strong>{pendingRole}</strong>.
            They'll see the new permissions at next sign-in or token refresh (within 1 hour).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={cancel} disabled={update.isPending}>Cancel</Button>
            <Button onClick={confirm} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DisableToggleButton({ user, isSelf }: { user: UserDTO; isSelf: boolean }) {
  const update = useUpdateUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const isDisabled = !!user.disabledAt;

  // Self-disable rule (Area 1): admin can't disable own account. Hide the
  // button entirely on own row to prevent the foot-gun. Server enforces too.
  if (isSelf) return null;

  const onClick = () => setOpen(true);

  const confirm = async () => {
    try {
      await update.mutateAsync({ id: user.id, input: { disabled: !isDisabled } });
      toast({
        title: isDisabled ? 'User re-enabled' : 'User disabled',
        variant: 'success',
      });
      setOpen(false);
    } catch (err) {
      toast({
        title: isDisabled ? 'Could not re-enable user' : 'Could not disable user',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
      setOpen(false);
    }
  };

  return (
    <>
      <Button size="sm" variant={isDisabled ? 'outline' : 'ghost'} onClick={onClick}>
        {isDisabled ? 'Re-enable' : 'Disable'}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isDisabled
                ? `Re-enable ${user.displayName}?`
                : `Disable ${user.displayName}?`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-textDim">
            {isDisabled
              ? 'They will regain access at next sign-in.'
              : 'They will lose access at next token refresh (within 1 hour).'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={update.isPending}>Cancel</Button>
            <Button
              variant={isDisabled ? 'default' : 'destructive'}
              onClick={confirm}
              disabled={update.isPending}
            >
              {update.isPending ? 'Saving…' : (isDisabled ? 'Re-enable' : 'Disable')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewUserButton() {
  const create = useCreateUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('warehouse');
  const [displayName, setDisplayName] = useState('');

  const reset = () => {
    setEmail('');
    setPassword('');
    setRole('warehouse');
    setDisplayName('');
  };

  const onClose = () => {
    setOpen(false);
    reset();
  };

  const canSubmit = email.trim().length > 0
    && password.length >= 8
    && displayName.trim().length > 0;

  const onCreate = async () => {
    try {
      await create.mutateAsync({ email: email.trim(), password, role, displayName: displayName.trim() });
      // 30-second duration — long enough for the admin to capture the
      // initial password before auto-dismiss; short enough that the toast
      // doesn't persist across sign-out into the next user's session.
      // (AdminShell.handleSignOut also calls clearAll() as a backstop.)
      toast({
        title: 'User created',
        description: `Initial password: ${password} — share securely with the user.`,
        variant: 'success',
        durationMs: 30000,
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not create user',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => o ? setOpen(true) : onClose()}>
      <DialogTrigger asChild><Button>New user</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="user-email">Email</Label>
            <Input id="user-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label htmlFor="user-password">Initial password</Label>
            <Input id="user-password" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-textDim">Min. 8 characters. You'll share this with the user.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="user-role">Role</Label>
            <select
              id="user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full h-9 rounded-md border border-borderStrong bg-surfaceSolid px-2 text-sm"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="user-display-name">Display name</Label>
            <Input id="user-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>Cancel</Button>
          <Button onClick={onCreate} disabled={!canSubmit || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
