export default function ProfileAvatar({
  seed,
  name,
  size = 32,
  className = "",
  decorative = false,
}) {
  const identity = String(seed || name || "Guest");
  const label = name || identity;

  return (
    <img
      className={`dicebear-avatar ${className}`.trim()}
      src={`/api/avatar?seed=${encodeURIComponent(identity)}`}
      width={size}
      height={size}
      alt={decorative ? "" : `${label} profile avatar`}
      aria-hidden={decorative ? "true" : undefined}
      draggable="false"
    />
  );
}
