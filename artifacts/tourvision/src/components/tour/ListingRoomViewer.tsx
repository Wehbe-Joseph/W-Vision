import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { roomNavRank } from "@/lib/roomOrder";

export interface ListingRoom {
  sceneId: string;
  roomType: string;
  imageUrl: string;
}

interface ListingRoomViewerProps {
  rooms: ListingRoom[];
}

export default function ListingRoomViewer({ rooms }: ListingRoomViewerProps) {
  const sorted = [...rooms].sort(
    (a, b) => roomNavRank(a.roomType) - roomNavRank(b.roomType),
  );
  const [index, setIndex] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const current = sorted[index];
  const hasMultiple = sorted.length > 1;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + sorted.length) % sorted.length);
      setPan({ x: 0, y: 0 });
      setZoom(1);
    },
    [sorted.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!current) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/60 text-sm">
        No room photos available.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-[#080808] overflow-hidden select-none">
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => {
          dragging.current = true;
          last.current = { x: e.clientX, y: e.clientY };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const dx = e.clientX - last.current.x;
          const dy = e.clientY - last.current.y;
          last.current = { x: e.clientX, y: e.clientY };
          setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) =>
            Math.min(2.5, Math.max(1, z + (e.deltaY > 0 ? -0.08 : 0.08))),
          );
        }}
      >
        <img
          key={current.sceneId}
          src={current.imageUrl}
          alt={current.roomType}
          draggable={false}
          className="absolute left-1/2 top-1/2 max-w-none h-full w-auto min-w-full object-cover transition-opacity duration-300"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          }}
        />
      </div>

      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-black/60 text-white/80 text-xs backdrop-blur-sm pointer-events-none">
        Drag to look around · Scroll to zoom
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            aria-label="Previous room"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/55 border border-white/20 text-white flex items-center justify-center hover:bg-black/75"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            aria-label="Next room"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/55 border border-white/20 text-white flex items-center justify-center hover:bg-black/75"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 p-3 pb-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
        <p className="text-center text-white font-medium text-sm mb-2">
          {current.roomType}
          {hasMultiple && (
            <span className="text-white/50 font-normal ml-2">
              {index + 1} / {sorted.length}
            </span>
          )}
        </p>
        {hasMultiple && (
          <div className="flex gap-2 overflow-x-auto justify-center max-w-full px-1 pb-1 scrollbar-thin">
            {sorted.map((room, i) => (
              <button
                key={room.sceneId}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setPan({ x: 0, y: 0 });
                  setZoom(1);
                }}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                  i === index
                    ? "bg-white text-black border-white"
                    : "bg-white/10 text-white/90 border-white/25 hover:bg-white/20"
                }`}
              >
                {room.roomType}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
