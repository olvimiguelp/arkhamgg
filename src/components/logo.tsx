export function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 512 512" className="text-white">
      {/* Blue glow border */}
      <rect
        x="80"
        y="60"
        width="352"
        height="392"
        rx="40"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        opacity="0.9"
      />

      {/* Orange mesh phone body */}
      <g fill="none" stroke="#ff8c00" strokeWidth="1.5">
        {/* Mesh pattern */}
        <circle cx="140" cy="200" r="35" opacity="0.7" />
        <circle cx="200" cy="180" r="28" opacity="0.8" />
        <circle cx="260" cy="210" r="32" opacity="0.75" />
        <circle cx="180" cy="250" r="22" opacity="0.6" />
        <circle cx="260" cy="260" r="18" opacity="0.7" />

        {/* Grid lines */}
        {[...Array(8)].map((_, i) => (
          <line key={`h${i}`} x1="100" y1={100 + i * 40} x2="412" y2={100 + i * 40} opacity="0.2" />
        ))}
      </g>

      {/* Blue detail on right side */}
      <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4">
        <path d="M 420 150 Q 450 200 420 250 L 420 350" strokeWidth="2" />
      </g>
    </svg>
  )
}
