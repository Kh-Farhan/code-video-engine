import React from "react";
import { colors } from "../theme";

type MarkProps = {
  /** Badge diameter in px. */
  size: number;
  /** 0 to 1: how much of the stroke is drawn. */
  draw?: number;
};

const Badge: React.FC<{ size: number; color: string; children: React.ReactNode }> = ({
  size,
  color,
  children,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0, display: "block" }}>
    <circle cx={50} cy={50} r={46} fill={color} fillOpacity={0.16} stroke={color} strokeWidth={6} />
    {children}
  </svg>
);

/** Red cross in a ring, for the wrong side of a comparison. */
export const CrossMark: React.FC<MarkProps> = ({ size, draw = 1 }) => {
  // Each stroke is about 50 units long.
  const len = 50;
  const a = Math.min(1, draw * 2);
  const b = Math.max(0, draw * 2 - 1);
  const stroke = {
    stroke: colors.danger,
    strokeWidth: 10,
    strokeLinecap: "round" as const,
    strokeDasharray: len,
  };
  return (
    <Badge size={size} color={colors.danger}>
      <line x1={32} y1={32} x2={68} y2={68} {...stroke} strokeDashoffset={len * (1 - a)} />
      <line x1={68} y1={32} x2={32} y2={68} {...stroke} strokeDashoffset={len * (1 - b)} />
    </Badge>
  );
};

/** Green check in a ring, for the right side of a comparison. */
export const CheckMark: React.FC<MarkProps> = ({ size, draw = 1 }) => {
  const len = 62;
  return (
    <Badge size={size} color={colors.success}>
      <polyline
        points="29,52 44,66 72,36"
        fill="none"
        stroke={colors.success}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - Math.min(1, Math.max(0, draw)))}
      />
    </Badge>
  );
};
