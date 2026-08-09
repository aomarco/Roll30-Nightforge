/**
 * Hand-drawn marks that carry the Nightforge identity where a stock icon
 * would look generic — the brand die and the faction pips.
 */

export function D20({ size = 18, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      {...rest}
    >
      <path d="M12 1.6 21.4 7v10L12 22.4 2.6 17V7z" />
      <path d="M12 1.6 16.6 9 12 16.4 7.4 9z" />
      <path d="M2.6 7 7.4 9m14 -2-4.8 2M12 16.4V22.4M7.4 9 12 16.4 16.6 9" />
    </svg>
  );
}

/** Small faction dot used in rosters and turn tracks. */
export function Pip({ tone = "ally", size = 7 }) {
  const color = tone === "foe" ? "var(--foe)" : "var(--ally)";
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: color,
        boxShadow: `0 0 8px ${color}`,
        flex: "none",
      }}
    />
  );
}
