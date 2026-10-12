"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { blobUrl } from "@/lib/client/db";

export function BlobImage({ id, alt, className }: { id?: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (id) blobUrl(id).then((u) => live && setSrc(u));
    return () => {
      live = false;
    };
  }, [id]);
  if (!src) return <div className={`img-placeholder ${className ?? ""}`} aria-label={alt} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} draggable={false} />;
}

export function AiBadge({ small }: { small?: boolean }) {
  return (
    <span className={`ai-badge ${small ? "ai-badge-sm" : ""}`} title="AI wardrobe simulation — not a real photograph">
      AI simulation
    </span>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
  footer,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function PhotoDrop({
  onFiles,
  multiple,
  label,
  hint,
  compact,
  busy,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  label: string;
  hint?: string;
  compact?: boolean;
  busy?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      className={`drop ${over ? "drop-over" : ""} ${compact ? "drop-compact" : ""}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      disabled={busy}
    >
      {busy ? <Spinner /> : <Icon name="upload" />}
      <span className="drop-label">{busy ? "Processing…" : label}</span>
      {hint && !compact && <span className="drop-hint">{hint}</span>}
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </button>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Swatch({ hex, label, active, onClick, size = 26 }: { hex: string; label: string; active?: boolean; onClick?: () => void; size?: number }) {
  return (
    <button
      type="button"
      className={`swatch ${active ? "swatch-active" : ""}`}
      style={{ background: hex, width: size, height: size }}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    />
  );
}

const PATHS: Record<string, ReactNode> = {
  upload: <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" />,
  trash: <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5m4-5v5" />,
  download: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4 17v1.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V17" />,
  wand: <path d="m4 20 11-11m2-5v3m-1.5-1.5h3M19 9v2m-1-1h2M8.5 4v2m-1-1h2" />,
  hanger: <path d="M12 8.5V7a2 2 0 1 0-2-2m2 3.5L3.5 15a1.5 1.5 0 0 0 .9 2.7h15.2a1.5 1.5 0 0 0 .9-2.7z" />,
  camera: <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
  up: <path d="m6 14 6-6 6 6" />,
  down: <path d="m6 10 6 6 6-6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  compare: <path d="M4 5h7v14H4zM13 5h7v14h-7z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  scan: <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8m8 0h2.5A1.5 1.5 0 0 1 20 5.5V8m0 8v2.5a1.5 1.5 0 0 1-1.5 1.5H16m-8 0H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" />,
  board: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  shield: <path d="M12 3 5 6v5.5c0 4.2 2.9 7.7 7 9.5 4.1-1.8 7-5.3 7-9.5V6z" />,
  sparkle: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}

export function useElapsed(since: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.round((now - since) / 1000));
}

export function confirmAction(message: string): boolean {
  return typeof window !== "undefined" && window.confirm(message);
}
