type TrophySize = "standings" | "small" | "inline" | "profile" | "chart";
export function RankTrophy({
  rank,
  size = "standings",
}: {
  rank: number;
  size?: TrophySize;
}) {
  const glyph = (
    <>
      <path
        d="M13 8H4v9c0 9 6 14 14 15M35 8h9v9c0 9-6 14-14 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M11 3h26v17c0 10-5 16-11 18v7h10v6H12v-6h10v-7c-6-2-11-8-11-18Z"
        fill="currentColor"
      />
      <path d="M14 6h20" stroke="#fff" strokeOpacity=".55" strokeWidth="2" />
      <text
        x="24"
        y="26"
        textAnchor="middle"
        fill="#252018"
        fontFamily="Impact, Arial Narrow, sans-serif"
        fontSize="22"
        fontWeight="900"
      >
        {rank}
      </text>
    </>
  );
  const className = `rank-trophy rank-trophy--${rank} rank-trophy--${size}`;
  // SVG chart marks share the chart's coordinate system, with no nested viewport.
  if (size === "chart")
    return (
      <g
        className={className}
        transform={`scale(${[36, 32, 28][rank - 1] / 48})`}
        role="img"
        aria-label={`Rank ${rank}`}
      >
        {glyph}
      </g>
    );
  return (
    <svg
      className={className}
      viewBox="0 0 48 54"
      role="img"
      aria-label={`Rank ${rank}`}
    >
      {glyph}
    </svg>
  );
}
export function PlacementRank({
  rank,
  size = "inline",
  prefix = "#",
}: {
  rank?: number | null;
  size?: TrophySize;
  prefix?: string;
}) {
  if (!rank) return <>—</>;
  return rank <= 3 ? (
    <RankTrophy rank={rank} size={size} />
  ) : (
    <>
      {prefix}
      {rank}
    </>
  );
}
