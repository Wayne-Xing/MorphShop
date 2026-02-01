"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
}

/**
 * Lightweight in-page modal (no external deps).
 * - Click outside to close
 * - Close button
 * - Esc to close
 */
export function Modal({ open, onOpenChange, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onOpenChange(false);
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl overflow-hidden rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="min-w-0">
              {title ? <p className="truncate text-sm font-medium">{title}</p> : null}
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

