// src/components/ui/sheet.tsx
// Bottom-drawer primitive for mobile filter UX. Built on Radix Dialog
// (same primitive shadcn's Sheet uses). Slides in from bottom, snaps to
// 88% max height, has a drag-handle indicator at the top.
//
// Used by InventoryFiltersMobileSheet for the filter drawer that the
// option-c-mobile-inventory.jsx mockup screen 3 specifies.

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentProps<typeof DialogPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  );
});

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentProps<typeof DialogPrimitive.Content>
>(function SheetContent({ className, children, ...props }, ref) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl bg-popover text-popover-foreground shadow-[0_-12px_40px_rgba(15,23,42,0.2)] duration-150 outline-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom pb-[env(safe-area-inset-bottom)]",
          className
        )}
        {...props}
      >
        {/* Drag handle indicator */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-9 rounded-full bg-borderStrong" />
        </div>
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});

const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(function SheetHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("px-4 py-3 flex items-center justify-between border-b border-border", className)}
      {...props}
    />
  );
});

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentProps<typeof DialogPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-base font-bold text-text", className)}
      {...props}
    />
  );
});

const SheetBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(function SheetBody({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("flex-1 overflow-y-auto p-4 space-y-4", className)}
      {...props}
    />
  );
});

const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(function SheetFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("px-4 py-3 border-t border-border flex gap-2", className)}
      {...props}
    />
  );
});

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
  SheetFooter,
};
