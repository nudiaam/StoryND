// Small round "remove" button shown on hover over images, colours, fonts…
// The circle and the cross are one drawing, so they scale together and the
// cross stays centred at any zoom.
export default function XButton({ onClick, title = 'Quitar' }) {
  return (
    <button
      className="x"
      title={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <svg viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="11" />
        <path d="M7.75 7.75l6.5 6.5M14.25 7.75l-6.5 6.5" />
      </svg>
    </button>
  );
}
