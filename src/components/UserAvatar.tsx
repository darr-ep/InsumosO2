/**
 * Redesign — UX/UI pass (Login picker): a small avatar shared by any screen
 * that needs to show a business user visually — today the login picker
 * (`shape="square"`, grid layout) and available as `shape="circle"` (default)
 * for a future inline use (e.g. "Registró: {name}" in `RentalDetailSheet`)
 * without duplicating the image/fallback logic.
 */
export interface UserAvatarProps {
  name: string;
  avatarUrl: string | null;
  size?: number;
  shape?: "circle" | "square";
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 48,
  shape = "circle",
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

  return (
    <span
      aria-hidden="true"
      className={`bg-primary text-primary-foreground flex shrink-0 items-center justify-center font-semibold ${shapeClass}`}
      style={{ ...style, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}
