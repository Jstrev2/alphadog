"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { photoUrl } from "@/lib/photos";

// ---------- layout ----------

const DESKTOP_QUERY = "(min-width: 1024px)";

/** True on wide screens, where panels sit in a sidebar instead of over the map. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

export function useEscape(onEscape: () => void) {
  const ref = useRef(onEscape);
  useEffect(() => {
    ref.current = onEscape;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ref.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * A card that slides up from the bottom on phones and floats over the map on
 * desktop. Place it inside the map area.
 */
export function Sheet({
  children,
  onClose,
  label,
  modal = false,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  modal?: boolean;
}) {
  useEscape(onClose);
  return (
    <div
      className={`absolute inset-0 z-30 flex items-end justify-center lg:items-end lg:pb-6 ${modal ? "" : "pointer-events-none"}`}
      role="dialog"
      aria-modal={modal}
      aria-label={label}
    >
      {modal && <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />}
      <div className="pointer-events-auto relative max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-2xl ring-1 ring-black/5 lg:max-h-[80dvh] lg:max-w-md lg:rounded-3xl lg:pb-4">
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-zinc-200 lg:hidden" />
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ title, sub, onClose }: { title: ReactNode; sub?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-bold text-zinc-900">{title}</h2>
        {sub && <p className="text-xs text-zinc-500">{sub}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1 shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
      >
        Close
      </button>
    </div>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex max-w-sm items-center rounded-2xl bg-zinc-900/90 px-4 py-2.5 text-sm text-white shadow-lg backdrop-blur"
    >
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; active?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-zinc-100 p-1">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-xl font-semibold transition-colors ${size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm"} ${
              selected ? (o.active ?? "bg-white text-zinc-900 shadow") : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = "primary",
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    secondary: "bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50",
    ghost: "text-zinc-600 hover:bg-zinc-100",
    danger: "text-red-600 hover:bg-red-50",
  }[kind];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

// ---------- dogs ----------

const AVATAR_COLORS = ["#059669", "#0284c7", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#0d9488", "#4f46e5"];

/** A dog's photo, or its first letter on a color picked from its name. */
export function DogAvatar({
  name,
  path,
  previewUrl,
  className = "size-10",
  rounded = "rounded-full",
}: {
  name: string;
  path?: string | null;
  previewUrl?: string | null;
  className?: string;
  rounded?: string;
}) {
  const src = previewUrl ?? photoUrl(path);
  if (src) {
    return (
      // Dog photos come from Supabase Storage at sizes we already shrank on upload.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className={`${className} ${rounded} shrink-0 bg-zinc-100 object-cover`} />
    );
  }
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <div
      className={`${className} ${rounded} flex shrink-0 items-center justify-center font-bold text-white`}
      style={{ background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}
      aria-label={name}
    >
      <span className="text-[0.45em] leading-none">{name.trim().charAt(0).toUpperCase() || "?"}</span>
    </div>
  );
}

// ---------- icons ----------

type IconProps = { className?: string };

export function PawIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#065f46" />
      <g fill="#ffffff">
        <path d="M256 236c-52 0-118 70-118 128 0 40 30 58 62 58 24 0 38-12 56-12s32 12 56 12c32 0 62-18 62-58 0-58-66-128-118-128z" />
        <ellipse cx="146" cy="232" rx="40" ry="52" transform="rotate(-24 146 232)" />
        <ellipse cx="214" cy="146" rx="40" ry="56" transform="rotate(-8 214 146)" />
        <ellipse cx="298" cy="146" rx="40" ry="56" transform="rotate(8 298 146)" />
        <ellipse cx="366" cy="232" rx="40" ry="52" transform="rotate(24 366 232)" />
      </g>
    </svg>
  );
}

export function PawGlyph({ className }: IconProps) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true" fill="currentColor">
      <path d="M256 236c-52 0-118 70-118 128 0 40 30 58 62 58 24 0 38-12 56-12s32 12 56 12c32 0 62-18 62-58 0-58-66-128-118-128z" />
      <ellipse cx="146" cy="232" rx="40" ry="52" transform="rotate(-24 146 232)" />
      <ellipse cx="214" cy="146" rx="40" ry="56" transform="rotate(-8 214 146)" />
      <ellipse cx="298" cy="146" rx="40" ry="56" transform="rotate(8 298 146)" />
      <ellipse cx="366" cy="232" rx="40" ry="52" transform="rotate(24 366 232)" />
    </svg>
  );
}

export function MapIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function TrophyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3 5 6.4 5c2 0 3.3 1.1 4 2.3h3.2C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.4 21.2 11.4 19 15.6 12 20 12 20Z" />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.25v3.25a.75.75 0 0 0 1.5 0V9.75A.75.75 0 0 0 10 9H9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

export function FlagIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

/** Map pin whose tip is the bottom-center of the box. */
export function PinIcon({ className, color = "#059669" }: IconProps & { color?: string }) {
  return (
    <svg viewBox="0 0 36 48" className={className} aria-hidden="true">
      <path
        d="M18 1C8.6 1 1 8.6 1 18c0 12.7 15.4 27.5 16.1 28.1a1.3 1.3 0 0 0 1.8 0C19.6 45.5 35 30.7 35 18 35 8.6 27.4 1 18 1Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth="2"
      />
      <circle cx="18" cy="18" r="6.5" fill="#ffffff" />
    </svg>
  );
}

export function Spinner({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} animate-spin`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- time ----------

export function timeAgo(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
