"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { roomNavRank } from "@/lib/roomOrder";

declare global {
  interface Window {
    pannellum: {
      viewer: (
        container: HTMLElement,
        config: Record<string, unknown>,
      ) => {
        destroy: () => void;
        loadScene: (sceneId: string) => void;
        on: (event: string, handler: (sceneId: string) => void) => void;
      };
    };
  }
}

interface Room {
  sceneId: string;
  roomType: string;
  panoramaUrl: string;
  floorNumber: number;
}

function inspectImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not load panorama image"));
    img.src = url;
  });
}

interface PannellumViewerProps {
  rooms: Room[];
  /** @deprecated Tier restrictions disabled — always full house */
  isFreetier?: boolean;
  /** Controlled active scene (used with sidebar). */
  activeSceneId?: string;
  onActiveSceneIdChange?: (sceneId: string) => void;
  /** Hide bottom room tabs when using the left sidebar. */
  hideBottomNav?: boolean;
}

const PANNELLUM_CSS =
  "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
const PANNELLUM_JS =
  "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

export default function PannellumViewer({
  rooms,
  isFreetier: _isFreetier = false,
  activeSceneId: controlledSceneId,
  onActiveSceneIdChange,
  hideBottomNav = false,
}: PannellumViewerProps) {
  const orderedRooms = useMemo(
    () =>
      [...rooms].sort(
        (a, b) => roomNavRank(a.roomType) - roomNavRank(b.roomType),
      ),
    [rooms],
  );
  const viewerRef = useRef<ReturnType<Window["pannellum"]["viewer"]> | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showImageFallback, setShowImageFallback] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const activeSceneId =
    controlledSceneId ?? orderedRooms[activeIndex]?.sceneId ?? "";

  const currentRoom =
    orderedRooms.find((r) => r.sceneId === activeSceneId) ??
    orderedRooms[activeIndex];

  const setActiveBySceneId = (sceneId: string) => {
    const idx = orderedRooms.findIndex((r) => r.sceneId === sceneId);
    if (idx >= 0) setActiveIndex(idx);
    onActiveSceneIdChange?.(sceneId);
    viewerRef.current?.loadScene(sceneId);
  };

  useEffect(() => {
    if (!controlledSceneId || !viewerRef.current) return;
    const idx = orderedRooms.findIndex((r) => r.sceneId === controlledSceneId);
    if (idx >= 0) setActiveIndex(idx);
    try {
      viewerRef.current.loadScene(controlledSceneId);
    } catch {
      /* viewer may still be initializing */
    }
  }, [controlledSceneId, orderedRooms]);

  useEffect(() => {
    if (!orderedRooms.length || !containerRef.current) return;

    let link: HTMLLinkElement | null = null;
    let script: HTMLScriptElement | null = null;
    let cancelled = false;
    let viewerSettled = false;

    function buildScenes(roomList: Room[]) {
      const scenes: Record<string, unknown> = {};
      for (const room of roomList) {
        scenes[room.sceneId] = {
          title: room.roomType,
          panorama: room.panoramaUrl,
          hotSpots: [],
        };
      }
      return scenes;
    }

    function initViewer() {
      if (cancelled || !window.pannellum || !containerRef.current) return;

      try {
        setLoadError(null);
        setShowImageFallback(false);
        const scenes = buildScenes(orderedRooms);
        const firstSceneId = orderedRooms[0]!.sceneId;

        viewerRef.current = window.pannellum.viewer(containerRef.current, {
          default: {
            firstScene: firstSceneId,
            sceneFadeDuration: 600,
            autoLoad: true,
            showControls: false,
            compass: false,
            hfov: 100,
            minHfov: 50,
            maxHfov: 120,
          },
          scenes,
        });

        viewerRef.current.on("scenechange", (sceneId: string) => {
          const idx = orderedRooms.findIndex((r) => r.sceneId === sceneId);
          if (idx >= 0) setActiveIndex(idx);
          onActiveSceneIdChange?.(sceneId);
        });

        // Some invalid/non-equirectangular images never throw but also never render.
        // If the viewer still hasn't loaded after a while, surface a fallback.
        window.setTimeout(() => {
          if (!cancelled && !viewerSettled) {
            setLoadError(
              "Could not render this panorama in 360 mode. Showing image fallback.",
            );
            setShowImageFallback(true);
            setIsLoading(false);
          }
        }, 7000);

        window.setTimeout(() => {
          if (!cancelled) {
            viewerSettled = true;
            setIsLoading(false);
          }
        }, 1200);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not start 360° viewer",
          );
          setIsLoading(false);
        }
      }
    }

    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = PANNELLUM_CSS;
    document.head.appendChild(link);

    if (window.pannellum) {
      void (async () => {
        try {
          const first = orderedRooms[0];
          if (first?.panoramaUrl) {
            const { width, height } = await inspectImageSize(first.panoramaUrl);
            const ratio = width / Math.max(1, height);
            if (ratio < 1.95 || ratio > 2.05) {
              setLoadError(
                `Panorama aspect ratio is ${width}x${height} (expected 2:1). Showing image fallback.`,
              );
              setShowImageFallback(true);
              setIsLoading(false);
              return;
            }
          }
        } catch {
          // Continue and let Pannellum attempt rendering.
        }
        initViewer();
      })();
    } else {
      script = document.createElement("script");
      script.src = PANNELLUM_JS;
      script.async = true;
      script.onload = () => {
        void (async () => {
          try {
            const first = orderedRooms[0];
            if (first?.panoramaUrl) {
              const { width, height } = await inspectImageSize(first.panoramaUrl);
              const ratio = width / Math.max(1, height);
              if (ratio < 1.95 || ratio > 2.05) {
                setLoadError(
                  `Panorama aspect ratio is ${width}x${height} (expected 2:1). Showing image fallback.`,
                );
                setShowImageFallback(true);
                setIsLoading(false);
                return;
              }
            }
          } catch {
            // Continue and let Pannellum attempt rendering.
          }
          initViewer();
        })();
      };
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      if (link?.parentNode) link.parentNode.removeChild(link);
      if (script?.parentNode) script.parentNode.removeChild(script);
    };
  }, [orderedRooms]);

  const switchRoom = (index: number) => {
    const room = orderedRooms[index];
    if (!room) return;
    setActiveBySceneId(room.sceneId);
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#080808",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            color: "#f87171",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div>
            <p style={{ fontSize: 14 }}>{loadError}</p>
            {currentRoom?.panoramaUrl ? (
              <a
                href={currentRoom.panoramaUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  color: "#93c5fd",
                  fontSize: 13,
                  textDecoration: "underline",
                }}
              >
                Open panorama image
              </a>
            ) : null}
          </div>
        </div>
      )}

      {isLoading && !loadError && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#080808",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            color: "#F0EDE6",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              border: "3px solid #222",
              borderTop: "3px solid #2563EB",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: 16,
            }}
          />
          <p style={{ fontSize: 14, color: "#888" }}>Loading 360° view…</p>
        </div>
      )}

      {showImageFallback && currentRoom?.panoramaUrl ? (
        <img
          src={currentRoom.panoramaUrl}
          alt={currentRoom.roomType}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      )}

      {!isLoading && !hideBottomNav && orderedRooms.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-20 p-3 pb-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-auto">
          <p className="text-center text-white font-medium text-sm mb-2">
            {currentRoom?.roomType}
            <span className="text-white/50 font-normal ml-2">
              {activeIndex + 1} / {orderedRooms.length}
            </span>
          </p>
          <div className="flex gap-2 overflow-x-auto justify-center max-w-full px-1">
            {orderedRooms.map((room, i) => (
              <button
                key={room.sceneId}
                type="button"
                onClick={() => switchRoom(i)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors ${
                  i === activeIndex
                    ? "bg-white text-black border-white"
                    : "bg-white/10 text-white/90 border-white/25 hover:bg-white/20"
                }`}
              >
                {room.roomType}
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .pnlm-container {
          background: #080808 !important;
        }
      `}</style>
    </div>
  );
}
