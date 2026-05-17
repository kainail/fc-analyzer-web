import * as React from "react";

type IconProps = {
  size?: number;
  stroke?: number;
  style?: React.CSSProperties;
  className?: string;
};

type InternalIconProps = IconProps & {
  children: React.ReactNode;
  fill?: string;
};

const Icon: React.FC<InternalIconProps> = ({
  children,
  size = 16,
  stroke = 1.6,
  fill = "none",
  style,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={["ico", className].filter(Boolean).join(" ")}
    style={style}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const Upload: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M12 4v12" />
    <path d="m7 9 5-5 5 5" />
    <path d="M5 20h14" />
  </Icon>
);

export const Activity: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M3 12h4l3-7 4 14 3-7h4" />
  </Icon>
);

export const Grid: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Icon>
);

export const Mic: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </Icon>
);

export const Search: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const Filter: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M3 5h18" />
    <path d="M6 12h12" />
    <path d="M10 19h4" />
  </Icon>
);

export const Cal: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
  </Icon>
);

export const Chevron: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const ChevronD: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ChevronR: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const ArrowR: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="m13 5 7 7-7 7" />
  </Icon>
);

export const ArrowL: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m11 5-7 7 7 7" />
  </Icon>
);

export const Check: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="m5 12 5 5L20 7" />
  </Icon>
);

export const CheckCirc: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </Icon>
);

export const Spin: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M21 12a9 9 0 1 1-6.2-8.55" />
  </Icon>
);

export const Dot: React.FC<IconProps> = (p) => (
  <Icon {...p} fill="currentColor" stroke={0}>
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const Flag: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M4 21V4" />
    <path d="M4 4h12l-2 4 2 4H4" />
  </Icon>
);

export const Target: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </Icon>
);

export const Sparkle: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </Icon>
);

export const Play: React.FC<IconProps> = (p) => (
  <Icon {...p} fill="currentColor" stroke={0}>
    <path d="m7 4 13 8-13 8z" />
  </Icon>
);

export const Pause: React.FC<IconProps> = (p) => (
  <Icon {...p} fill="currentColor" stroke={0}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </Icon>
);

export const Doc: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Icon>
);

export const Clock: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const X: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M6 6 18 18M18 6 6 18" />
  </Icon>
);

export const Plus: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const Settings: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.07a2 2 0 0 1-2.83 2.83l-.07-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.07.06a2 2 0 1 1-2.83-2.83l.06-.07a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.6 1.7 1.7 0 0 0 4.3 6.73l-.06-.07a2 2 0 1 1 2.83-2.83l.07.06A1.7 1.7 0 0 0 9 4.24h.01A1.7 1.7 0 0 0 10 2.69V3a2 2 0 1 1 4 0v.09c0 .67.4 1.27 1.04 1.55a1.7 1.7 0 0 0 1.87-.34l.07-.06a2 2 0 1 1 2.83 2.83l-.06.07a1.7 1.7 0 0 0-.34 1.87c.27.64.87 1.04 1.55 1.04H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1.04z" />
  </Icon>
);

export const Help: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" />
  </Icon>
);

export const Wave: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="M3 12h2l2-6 3 12 3-9 2 6h6" />
  </Icon>
);

export const TrendUp: React.FC<IconProps> = (p) => (
  <Icon {...p}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </Icon>
);
