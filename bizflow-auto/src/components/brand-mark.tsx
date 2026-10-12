type BrandMarkProps = {
  width?: number | string;
  height?: number | string;
  className?: string;
};

export function BrandMark({ width = 48, height = 48, className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="BizFlow Auto"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="brand-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#8e5fe6" />
          <stop offset="55%" stopColor="#8653db" />
          <stop offset="100%" stopColor="#7d4ccf" />
        </linearGradient>
        <linearGradient id="brand-disk" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#f9f9fb" />
          <stop offset="38%" stopColor="#e9ebf2" />
          <stop offset="64%" stopColor="#d3d8e6" />
          <stop offset="100%" stopColor="#c5c9d9" />
        </linearGradient>
        <linearGradient id="brand-disk-shadow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#a9afc1" />
          <stop offset="100%" stopColor="#7b8298" />
        </linearGradient>
        <radialGradient id="brand-highlight" cx="35%" cy="25%" r="65%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <rect x="12" y="12" width="1000" height="1000" rx="190" fill="url(#brand-bg)" />
      <rect x="12" y="12" width="1000" height="1000" rx="190" fill="rgba(0,0,0,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />

      <g opacity="0.18">
        <path d="M120 300H904" stroke="rgba(255,255,255,0.7)" strokeWidth="40" strokeLinecap="round" />
        <path d="M120 420H904" stroke="rgba(255,255,255,0.7)" strokeWidth="40" strokeLinecap="round" />
        <path d="M120 540H904" stroke="rgba(255,255,255,0.7)" strokeWidth="40" strokeLinecap="round" />
        <path d="M120 660H904" stroke="rgba(255,255,255,0.7)" strokeWidth="40" strokeLinecap="round" />
        <path d="M120 780H904" stroke="rgba(255,255,255,0.7)" strokeWidth="40" strokeLinecap="round" />
      </g>

      <g>
        <ellipse cx="512" cy="286" rx="300" ry="90" fill="rgba(255,255,255,0.08)" />

        <g>
          <ellipse cx="512" cy="320" rx="320" ry="88" fill="url(#brand-disk)" />
          <ellipse cx="512" cy="310" rx="320" ry="88" fill="url(#brand-highlight)" opacity="0.7" />
          <ellipse cx="512" cy="320" rx="320" ry="88" fill="rgba(0,0,0,0.08)" />
        </g>

        <g>
          <rect x="190" y="350" width="644" height="188" rx="48" fill="url(#brand-disk)" />
          <ellipse cx="512" cy="350" rx="322" ry="82" fill="url(#brand-disk-shadow)" opacity="0.28" />
          <ellipse cx="512" cy="350" rx="322" ry="82" fill="url(#brand-highlight)" opacity="0.7" />
          <rect x="190" y="350" width="644" height="188" rx="48" fill="rgba(255,255,255,0.08)" />
        </g>

        <g>
          <rect x="236" y="536" width="552" height="162" rx="40" fill="url(#brand-disk)" />
          <ellipse cx="512" cy="536" rx="276" ry="72" fill="url(#brand-disk-shadow)" opacity="0.28" />
          <ellipse cx="512" cy="536" rx="276" ry="72" fill="url(#brand-highlight)" opacity="0.7" />
          <rect x="236" y="536" width="552" height="162" rx="40" fill="rgba(255,255,255,0.08)" />
        </g>

        <g>
          <rect x="274" y="710" width="476" height="134" rx="36" fill="url(#brand-disk)" />
          <ellipse cx="512" cy="710" rx="238" ry="60" fill="url(#brand-disk-shadow)" opacity="0.28" />
          <ellipse cx="512" cy="710" rx="238" ry="60" fill="url(#brand-highlight)" opacity="0.7" />
          <rect x="274" y="710" width="476" height="134" rx="36" fill="rgba(255,255,255,0.08)" />
        </g>
      </g>
    </svg>
  );
}
