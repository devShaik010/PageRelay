export default function Logo({ compact = false }) {
  return (
    <a className="brand" href="/" aria-label="Blankroom home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!compact && <span>Blankroom</span>}
    </a>
  );
}
