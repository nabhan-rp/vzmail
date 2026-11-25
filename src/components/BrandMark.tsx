import { useId } from 'react';

interface BrandMarkProps {
  variant: 'mail' | 'links';
  className?: string;
}

export function BrandMark({
  variant,
  className = 'w-7 h-7',
}: BrandMarkProps) {
  const uid = useId().replace(/:/g, '');
  const glowId = `${variant}-glow-${uid}`;
  const accentId = `${variant}-accent-${uid}`;

  const leftMaskId = `links-left-mask-${uid}`;
  const rightMaskId = `links-right-mask-${uid}`;

  if (variant === 'links') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={`shrink-0 ${className}`}
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="18%" r="72%">
            <stop offset="0%" stopColor="#4C1D95" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#0B0D11" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={accentId}
            x1="28"
            y1="22"
            x2="52"
            y2="42"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#C4B5FD" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <mask id={leftMaskId}>
            <rect width="64" height="64" fill="#FFFFFF" />
            <path
              d="M29.8 35.6A8.5 8.5 0 0 0 34.6 40"
              stroke="#000000"
              strokeWidth="8.5"
              strokeLinecap="round"
            />
          </mask>
          <mask id={rightMaskId}>
            <rect width="64" height="64" fill="#FFFFFF" />
            <path
              d="M29.4 24A8.5 8.5 0 0 1 34.2 28.4"
              stroke="#000000"
              strokeWidth="8.5"
              strokeLinecap="round"
            />
          </mask>
        </defs>
        <rect width="64" height="64" rx="16" fill="#0B0D11" />
        <rect width="64" height="64" rx="16" fill={`url(#${glowId})`} />
        <rect
          x="1.25"
          y="1.25"
          width="61.5"
          height="61.5"
          rx="14.75"
          stroke="#281F3D"
          strokeWidth="1.5"
        />
        <g transform="rotate(-45 32 32)">
          <rect
            x="12"
            y="23.5"
            width="23"
            height="17"
            rx="8.5"
            stroke="#FFFFFF"
            strokeWidth="4.5"
            mask={`url(#${leftMaskId})`}
          />
          <rect
            x="29"
            y="23.5"
            width="23"
            height="17"
            rx="8.5"
            stroke={`url(#${accentId})`}
            strokeWidth="4.5"
            mask={`url(#${rightMaskId})`}
          />
        </g>
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="18%" r="72%">
          <stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#0B0D11" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={accentId}
          x1="14"
          y1="20"
          x2="50"
          y2="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="55%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0B0D11" />
      <rect width="64" height="64" rx="16" fill={`url(#${glowId})`} />
      <rect
        x="1.25"
        y="1.25"
        width="61.5"
        height="61.5"
        rx="14.75"
        stroke="#1E2636"
        strokeWidth="1.5"
      />
      <rect
        x="12"
        y="17.5"
        width="40"
        height="29"
        rx="6"
        fill="#111827"
        stroke="#FFFFFF"
        strokeWidth="3.75"
      />
      <path
        d="M14.5 20.5L32 34.2L49.5 20.5V19.5C49.5 18.4 48.6 17.5 47.5 17.5H16.5C15.4 17.5 14.5 18.4 14.5 19.5V20.5Z"
        fill="#3B82F6"
        fillOpacity="0.18"
      />
      <path
        d="M15.5 43.2L25.2 33.8"
        stroke="#334155"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M48.5 43.2L38.8 33.8"
        stroke="#334155"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M14.5 21.5L32 34.5L49.5 21.5"
        stroke={`url(#${accentId})`}
        strokeWidth="4.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
