import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code for a link, drawn as one SVG path. Always dark on white with a quiet margin, whatever the board
 * colour, because phone cameras need that contrast to read it.
 */
export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const { path, cells } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 2 });
    let d = "";
    qr.data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, cells: qr.size };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${cells} ${cells}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-xl bg-white p-1"
    >
      <path d={path} fill="#111827" />
    </svg>
  );
}
