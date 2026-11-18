// Hero illustration for the landing page: a large, quiet compass.
// Pure SVG (no images to load); the dial drifts and the needle sways
// gently, and both stop when the viewer prefers reduced motion.

const CENTER = 200;

function polar(radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

const TICKS = Array.from({ length: 120 }, (_, index) => {
  const degrees = index * 3;
  const major = degrees % 30 === 0;
  const mid = !major && degrees % 15 === 0;
  const outer = polar(182, degrees);
  const inner = polar(182 - (major ? 14 : mid ? 9 : 5), degrees);
  return { degrees, major, mid, outer, inner };
});

const CARDINALS = [
  { label: "N", degrees: 0 },
  { label: "E", degrees: 90 },
  { label: "S", degrees: 180 },
  { label: "W", degrees: 270 },
];

// Milestones resting on the outer ring, a nod to tracked progress.
const MILESTONES = [28, 118, 236];

export default function CompassArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      role="img"
      aria-label="업무나침반 나침반 그림"
    >
      <defs>
        <radialGradient id="ca-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8fe3d2" stopOpacity="0.32" />
          <stop offset="0.6" stopColor="#8fe3d2" stopOpacity="0.08" />
          <stop offset="1" stopColor="#8fe3d2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ca-north" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9f2e8" />
        </linearGradient>
        <linearGradient id="ca-south" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3fae9b" stopOpacity="0.95" />
          <stop offset="1" stopColor="#1d7c6f" stopOpacity="0.85" />
        </linearGradient>
        <filter id="ca-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#062a26" floodOpacity="0.45" />
        </filter>
      </defs>

      <circle cx={CENTER} cy={CENTER} r="198" fill="url(#ca-glow)" />

      <g className="tb-compass-dial">
        <circle cx={CENTER} cy={CENTER} r="182" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.2" />
        {TICKS.map((tick) => (
          <line
            key={tick.degrees}
            x1={tick.outer.x}
            y1={tick.outer.y}
            x2={tick.inner.x}
            y2={tick.inner.y}
            stroke="#ffffff"
            strokeOpacity={tick.major ? 0.62 : tick.mid ? 0.36 : 0.18}
            strokeWidth={tick.major ? 1.6 : 1}
            strokeLinecap="round"
          />
        ))}
        {CARDINALS.map((cardinal) => {
          const point = polar(152, cardinal.degrees);
          return (
            <text
              key={cardinal.label}
              x={point.x}
              y={point.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="15"
              fontWeight="600"
              letterSpacing="1"
              fill={cardinal.label === "N" ? "#a7f0e0" : "#ffffff"}
              fillOpacity={cardinal.label === "N" ? 1 : 0.62}
            >
              {cardinal.label}
            </text>
          );
        })}
        {MILESTONES.map((degrees) => {
          const point = polar(182, degrees);
          return (
            <g key={degrees}>
              <circle cx={point.x} cy={point.y} r="7" fill="#8fe3d2" fillOpacity="0.22" />
              <circle cx={point.x} cy={point.y} r="3.2" fill="#d6fbf2" />
            </g>
          );
        })}
      </g>

      <circle cx={CENTER} cy={CENTER} r="128" fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeDasharray="2 7" />
      <circle cx={CENTER} cy={CENTER} r="104" fill="#ffffff" fillOpacity="0.04" stroke="#ffffff" strokeOpacity="0.12" />

      {/* Compass rose */}
      {[0, 90, 180, 270].map((degrees) => (
        <g key={`long-${degrees}`} transform={`rotate(${degrees} ${CENTER} ${CENTER})`}>
          <path d="M200 96 L211 189 L200 200 Z" fill="#ffffff" fillOpacity="0.2" />
          <path d="M200 96 L189 189 L200 200 Z" fill="#ffffff" fillOpacity="0.08" />
        </g>
      ))}
      {[45, 135, 225, 315].map((degrees) => (
        <g key={`short-${degrees}`} transform={`rotate(${degrees} ${CENTER} ${CENTER})`}>
          <path d="M200 140 L207 194 L200 200 Z" fill="#ffffff" fillOpacity="0.14" />
          <path d="M200 140 L193 194 L200 200 Z" fill="#ffffff" fillOpacity="0.06" />
        </g>
      ))}

      <g className="tb-compass-needle" filter="url(#ca-shadow)">
        <path d="M200 66 L215 200 L185 200 Z" fill="url(#ca-north)" />
        <path d="M200 334 L215 200 L185 200 Z" fill="url(#ca-south)" />
        <path d="M200 66 L200 200 L185 200 Z" fill="#000000" fillOpacity="0.06" />
      </g>

      <circle cx={CENTER} cy={CENTER} r="12" fill="#0f4b44" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="2" />
      <circle cx={CENTER} cy={CENTER} r="4" fill="#ffffff" />
    </svg>
  );
}
