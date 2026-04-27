/**
 * Pulse — identidade visual do app em movimento.
 * Um ponto que respira, com halo expansivo. Usado em loading states
 * e como referência ao ícone do app. Sem caixa, sem borda — apenas o gesto.
 */
export function Pulse({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative inline-flex ${className}`}
      style={{ width: size, height: size }}
      aria-label="Carregando"
      role="status"
    >
      <span
        className="absolute inset-0 rounded-full bg-foreground/30 animate-pulse-ring"
      />
      <span
        className="absolute inset-0 rounded-full bg-foreground/20 animate-pulse-ring"
        style={{ animationDelay: "0.6s" }}
      />
      <span className="relative inline-flex h-full w-full rounded-full bg-foreground animate-pulse-dot" />
    </span>
  );
}

export function PulseScreen({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
      <Pulse size={14} />
      {label && <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>}
    </div>
  );
}
