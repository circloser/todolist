"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// A small dropdown for the board header: opens on click, closes on an outside
// click, Escape, or when an item runs.

export default function HeaderMenu({
  button,
  label,
  title,
  children,
  align = "right",
}: {
  button: ReactNode;
  label: string;
  title?: string;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((value) => !value)}
        data-active={open}
        className="tb-btn !px-2.5"
      >
        {button}
      </button>
      {open ? (
        <div role="menu" aria-label={label} className={`tb-menu ${align === "right" ? "right-0" : "left-0"}`}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  badge,
  onSelect,
}: {
  icon: string;
  children: ReactNode;
  badge?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button type="button" role="menuitem" className="tb-menu-item" onClick={onSelect}>
      <span aria-hidden="true" className="w-5 text-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </button>
  );
}
