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

// Turns the picture a quarter clockwise. Same drawing as the remove button,
// shown beside it.
export function RotateButton({ onClick, className = '' }) {
  return (
    <button
      className={`rotb nodrag ${className}`}
      title="Girar"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <svg viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="11" />
        <path d="M15.08 12.9A4.5 4.5 0 1 1 11 6.5c1.26 0 2.47.5 3.37 1.37L15.5 9M15.5 6.5V9H13" />
      </svg>
    </button>
  );
}
