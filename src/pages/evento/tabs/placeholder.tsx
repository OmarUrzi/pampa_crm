export function EventoTabPlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 12,
        padding: 14,
        background: "var(--color-background-secondary)",
      }}
    >
      {label} (pendiente de implementar interacciones)
    </div>
  );
}

