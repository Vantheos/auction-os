// src/components/lot/ChangeStateMenu.tsx
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { legalTransitions, isTerminalTransition } from '@/hooks/useLotState';
import { StatePill } from '@/components/ui/pill';
import type { LotState } from '@shared/types';

type Props = {
  current: LotState;
  onPick: (to: LotState, requiresConfirm: boolean) => void;
  disabled?: boolean;
};

export function ChangeStateMenu({ current, onPick, disabled }: Props) {
  const transitions = legalTransitions(current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || transitions.length === 0}>
          Change status
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {transitions.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-textDim">No legal transitions (terminal state)</div>
        )}
        {transitions.map((to) => (
          <DropdownMenuItem key={to} onSelect={() => onPick(to, isTerminalTransition(to))}>
            <span className="mr-2"><StatePill state={to} /></span>
            {isTerminalTransition(to) && <span className="text-xs text-textDim ml-auto">requires confirm</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
