// Shared chart styling tokens used across dashboard pages.
// Keeps Recharts tooltips legible and removes the default gray hover cursor on bars.

export const tooltipStyle = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 10,
  fontSize: 12,
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 10px 30px -10px hsl(var(--primary) / 0.35)',
  backdropFilter: 'blur(8px)',
} as const;

export const tooltipItemStyle = {
  color: 'hsl(var(--popover-foreground))',
} as const;

export const tooltipLabelStyle = {
  color: 'hsl(var(--popover-foreground))',
  fontWeight: 600,
  marginBottom: 4,
} as const;

// Subtle accent overlay for bar hover instead of the default opaque gray.
export const barCursor = {
  fill: 'hsl(var(--primary) / 0.08)',
  radius: 6,
} as const;

// Thin accent line for area/line charts instead of the default gray cursor.
export const lineCursor = {
  stroke: 'hsl(var(--primary) / 0.5)',
  strokeWidth: 1,
  strokeDasharray: '3 3',
} as const;
