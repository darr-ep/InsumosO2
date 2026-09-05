/**
 * Redesign — UX/UI pass (Login picker): a small avatar shared by any screen
 * that needs to show a business user visually — today the login picker
 * (`shape="square"`, grid layout) and available as `shape="circle"` (default)
 * for a future inline use (e.g. "Registró: {name}" in `RentalDetailSheet`)
 * without duplicating the image/fallback logic.
 *
 * design-fidelity Slice C (§4.2 Clientes card): `tone="soft"` renders the
 * initial-fallback in `--primary-soft`/`--primary` instead of the solid
 * `--primary`/`--primary-foreground` pair — `CustomerCard` uses it so its
 * new avatar reads as a quiet identity mark, not a second CTA-weight blue
 * circle competing with the card's own primary actions. Only the initial
 * fallback is affected; an `avatarUrl` image ignores `tone` entirely (no
 * visual "soft" version of a real photo exists).
 */
export interface UserAvatarProps {
  name: string;
  avatarUrl: string | null;
  size?: number;
  shape?: "circle" | "square";
  tone?: "solid" | "soft";
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 48,
  shape = "circle",
  tone = "solid",
}: UserAvatarProps) {
  const style = { width: size, height: size };
  const shapeClass = shape === "square" ? "rounded-2xl" : "rounded-full";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`shrink-0 object-cover ${shapeClass}`}
        style={style}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const toneClass =
    tone === "soft"
      ? "bg-primary-soft text-primary"
      : "bg-primary text-primary-foreground";

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-semibold ${toneClass} ${shapeClass}`}
      style={{ ...style, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}
