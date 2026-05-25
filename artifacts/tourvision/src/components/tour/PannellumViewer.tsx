"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    pannellum: {
      viewer: (
        container: HTMLElement,
        config: Record<string, unknown>,
      ) => {
        destroy: () => void;
        on: (event: string, handler: (sceneId: string) => void) => void;
      };
    };
  }
}

interface Room {
  roomType: string;
  panoramaUrl: string;
  floorNumber: number;
}

interface PannellumViewerProps {
  rooms: Room[];
  isFreetier: boolean;
}

const PANNELLUM_CSS =
  "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
const PANNELLUM_JS =
  "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";

function sceneIdFromRoomType(roomType: string): string {
  return roomType.toLowerCase().replace(/\s+/g, "-");
}

export default function PannellumViewer({
  rooms,
  isFreetier,
}: PannellumViewerProps) {
  const viewerRef = useRef<ReturnType<Window["pannellum"]["viewer"]> | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentRoom, setCurrentRoom] = useState(rooms[0]?.roomType || "");

  useEffect(() => {
    if (!rooms.length || !containerRef.current) return;

    let link: HTMLLinkElement | null = null;
    let script: HTMLScriptElement | null = null;
    let cancelled = false;

    function buildScenes(roomList: Room[]) {
      const scenes: Record<string, unknown> = {};

      roomList.forEach((room, index) => {
        const hotspots: Record<string, unknown>[] = [];

        if (index < roomList.length - 1) {
          hotspots.push({
            pitch: -10,
            yaw: 0,
            type: "scene",
            text: `→ ${roomList[index + 1]!.roomType}`,
            sceneId: sceneIdFromRoomType(roomList[index + 1]!.roomType),
            cssClass: "wvision-hotspot",
          });
        }

        if (index > 0) {
          hotspots.push({
            pitch: -10,
            yaw: 180,
            type: "scene",
            text: `← ${roomList[index - 1]!.roomType}`,
            sceneId: sceneIdFromRoomType(roomList[index - 1]!.roomType),
            cssClass: "wvision-hotspot",
          });
        }

        if (isFreetier && roomList.length === 1) {
          hotspots.push({
            pitch: -10,
            yaw: 90,
            type: "info",
            text: "🔒 Unlock full house — $55",
            cssClass: "wvision-hotspot-locked",
          });
        }

        scenes[sceneIdFromRoomType(room.roomType)] = {
          title: room.roomType,
          panorama: room.panoramaUrl,
          hotSpots: hotspots,
        };
      });

      return scenes;
    }

    function initViewer() {
      if (cancelled || !window.pannellum || !containerRef.current) return;

      const scenes = buildScenes(rooms);
      const firstSceneId = sceneIdFromRoomType(rooms[0]!.roomType);

      viewerRef.current = window.pannellum.viewer(containerRef.current, {
        default: {
          firstScene: firstSceneId,
          sceneFadeDuration: 800,
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
        const room = rooms.find(
          (r) => sceneIdFromRoomType(r.roomType) === sceneId,
        );
        if (room) setCurrentRoom(room.roomType);
      });

      window.setTimeout(() => {
        if (!cancelled) setIsLoading(false);
      }, 1500);
    }

    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = PANNELLUM_CSS;
    document.head.appendChild(link);

    if (window.pannellum) {
      initViewer();
    } else {
      script = document.createElement("script");
      script.src = PANNELLUM_JS;
      script.async = true;
      script.onload = () => initViewer();
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      if (link?.parentNode) link.parentNode.removeChild(link);
      if (script?.parentNode) script.parentNode.removeChild(script);
    };
  }, [rooms, isFreetier]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {isLoading && (
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
          <p
            style={{
              fontSize: 14,
              color: "#888",
              fontFamily: "Inter, sans-serif",
            }}
          >
            Loading your 360° tour...
          </p>
        </div>
      )}

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {!isLoading && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(8px)",
            color: "white",
            padding: "8px 20px",
            borderRadius: 24,
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            pointerEvents: "none",
            zIndex: 50,
            whiteSpace: "nowrap",
          }}
        >
          {currentRoom}
          {isFreetier && (
            <span style={{ color: "#2563EB", marginLeft: 8 }}>
              · Free Preview
            </span>
          )}
        </div>
      )}

      {isFreetier && !isLoading && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            window.location.href = "/upgrade";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") window.location.href = "/upgrade";
          }}
          style={{
            position: "fixed",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(37,99,235,0.95)",
            color: "white",
            padding: "12px 24px",
            borderRadius: 12,
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            cursor: "pointer",
            zIndex: 50,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
          }}
        >
          🔒 Unlock full house walkthrough — $55 one time →
        </div>
      )}

      {!isLoading && (
        <div
          style={{
            position: "fixed",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.5)",
            color: "#aaa",
            padding: "6px 16px",
            borderRadius: 20,
            fontSize: 12,
            fontFamily: "Inter, sans-serif",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          Drag to look around · Click arrows to move
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .wvision-hotspot {
          background: rgba(37, 99, 235, 0.9) !important;
          color: white !important;
          border: 2px solid white !important;
          border-radius: 24px !important;
          padding: 8px 18px !important;
          font-family: Inter, sans-serif !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          transition: all 0.2s !important;
        }
        .wvision-hotspot:hover {
          background: rgba(37, 99, 235, 1) !important;
          transform: scale(1.05) !important;
        }
        .wvision-hotspot-locked {
          background: rgba(0,0,0,0.7) !important;
          color: #aaa !important;
          border: 2px solid #333 !important;
          border-radius: 24px !important;
          padding: 8px 18px !important;
          font-family: Inter, sans-serif !important;
          font-size: 13px !important;
          cursor: pointer !important;
          white-space: nowrap !important;
        }
        .pnlm-container {
          background: #080808 !important;
        }
      `}</style>
    </div>
  );
}
