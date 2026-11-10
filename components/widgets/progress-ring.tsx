/**
 * Progreso circular (ref. form-example.png): arco lima sobre pista gris y % al centro.
 * SVG puro, sin JavaScript: funciona en Server Components.
 */
export function ProgressRing({ value, size = 88, label }: { value: number; size?: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${clamped}%`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-chart-muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className="absolute text-lg font-semibold tracking-tight text-fg">{clamped}%</span>
    </div>
  );
}
