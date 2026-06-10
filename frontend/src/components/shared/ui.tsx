import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { clsx } from "clsx";

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <section className={clsx("rounded-3xl border border-border bg-panel shadow-panel", className)}>{children}</section>;
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }>) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition",
        variant === "primary" && "bg-accent text-slate-950 hover:brightness-110",
        variant === "ghost" && "border border-border bg-white/5 text-ink hover:bg-white/10",
        variant === "danger" && "bg-rose-400 text-slate-950 hover:bg-rose-300",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  return (
    <label className="flex flex-col gap-2 text-sm text-muted">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx("rounded-2xl border border-border bg-slate-950/30 px-3 py-2 text-sm text-ink outline-none ring-0", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx("rounded-2xl border border-border bg-slate-950/30 px-3 py-2 text-sm text-ink outline-none", className)}
      {...props}
    />
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx("min-h-24 rounded-2xl border border-border bg-slate-950/30 px-3 py-2 text-sm text-ink outline-none", className)}
      {...props}
    />
  );
}
