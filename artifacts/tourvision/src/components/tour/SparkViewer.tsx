"use client";

import { useEffect, useRef, useState } from "react";

interface SparkViewerProps {
  splatUrl: string | null;
  onLoaded?: () => void;
}

export default function SparkViewer({ splatUrl, onLoaded }: SparkViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!splatUrl || !containerRef.current) {
      setError(true);
      setIsLoading(false);
      return;
    }

    setError(false);
    setIsLoading(true);

    let cleanup: (() => void) | undefined;

    const init = async () => {
      try {
        // Dynamic imports to avoid SSR issues
        const THREE = await import("three");
        const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");

        const container = containerRef.current!;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111111);

        // Camera
        const camera = new THREE.PerspectiveCamera(
          75,
          container.clientWidth / container.clientHeight,
          0.01,
          1000,
        );
        camera.position.set(0, 0, 3);

        // Renderer
        const renderer = new THREE.WebGLRenderer({
          antialias: false,
          powerPreference: "high-performance",
        });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "none";
        container.appendChild(renderer.domElement);

        // Spark
        const spark = new SparkRenderer({ renderer });
        scene.add(spark);

        // Load splat
        const splat = new SplatMesh({ url: splatUrl });
        // World Labs splats are frequently inverted relative to our camera
        // basis; rotate once around X so the environment is upright.
        (splat as unknown as import("three").Object3D).quaternion.set(1, 0, 0, 0);
        scene.add(splat as unknown as import("three").Object3D);
        await splat.initialized;

        // Mark as loaded
        setIsLoading(false);
        onLoaded?.();

        // Navigation state
        let yaw = 0;
        let pitch = 0;
        let isPointerLocked = false;
        const keys: Record<string, boolean> = {};

        // Pointer lock
        const onCanvasClick = () => {
          if (renderer.domElement.requestPointerLock) {
            void renderer.domElement.requestPointerLock();
          }
        };
        renderer.domElement.addEventListener("click", onCanvasClick);

        const onPointerLockChange = () => {
          isPointerLocked = document.pointerLockElement === renderer.domElement;
        };
        document.addEventListener("pointerlockchange", onPointerLockChange);

        // Mouse look
        const onMouseMove = (e: MouseEvent) => {
          if (!isPointerLocked) return;
          yaw -= e.movementX * 0.002;
          pitch -= e.movementY * 0.002;
          pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
        };
        document.addEventListener("mousemove", onMouseMove);

        // Keyboard
        const onKeyDown = (e: KeyboardEvent) => {
          if (
            e.code === "ArrowUp" ||
            e.code === "ArrowDown" ||
            e.code === "ArrowLeft" ||
            e.code === "ArrowRight" ||
            e.code === "Space"
          ) {
            e.preventDefault();
          }
          keys[e.code] = true;
        };
        const onKeyUp = (e: KeyboardEvent) => {
          keys[e.code] = false;
        };
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);

        // Touch controls
        let lastTouchX = 0;
        let lastTouchY = 0;
        let lastTouchDistance = 0;
        let lastTwoCenterY = 0;

        const onTouchStart = (e: TouchEvent) => {
          if (e.touches.length === 1) {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
          }
          if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            lastTouchDistance = Math.hypot(
              t1.clientX - t2.clientX,
              t1.clientY - t2.clientY,
            );
            lastTwoCenterY = (t1.clientY + t2.clientY) / 2;
          }
        };

        const onTouchMove = (e: TouchEvent) => {
          e.preventDefault();
          const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

          if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - lastTouchX;
            const dy = e.touches[0].clientY - lastTouchY;
            yaw -= dx * 0.003;
            pitch -= dy * 0.003;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
          }

          if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];

            // Two-finger drag up/down -> move forward/backward.
            const centerY = (t1.clientY + t2.clientY) / 2;
            const centerDeltaY = centerY - lastTwoCenterY;
            if (Math.abs(centerDeltaY) > 0) {
              camera.position.addScaledVector(forward, -centerDeltaY * 0.01);
              lastTwoCenterY = centerY;
            }

            // Pinch in/out -> move backward/forward.
            const distance = Math.hypot(
              t1.clientX - t2.clientX,
              t1.clientY - t2.clientY,
            );
            const delta = distance - lastTouchDistance;
            camera.position.addScaledVector(forward, delta * 0.01);
            lastTouchDistance = distance;
          }
        };

        renderer.domElement.addEventListener("touchstart", onTouchStart, {
          passive: false,
        });
        renderer.domElement.addEventListener("touchmove", onTouchMove, {
          passive: false,
        });

        // Resize handler
        const onResize = () => {
          camera.aspect = container.clientWidth / container.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener("resize", onResize);

        // Animation loop
        const clock = new THREE.Clock();
        renderer.setAnimationLoop(() => {
          const delta = Math.min(clock.getDelta(), 0.05);
          const speed = 2.2 * delta;
          camera.rotation.order = "YXZ";
          camera.rotation.y = yaw;
          camera.rotation.x = pitch;

          const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
          const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          const up = new THREE.Vector3(0, 1, 0);

          if (keys["KeyW"] || keys["ArrowUp"])
            camera.position.addScaledVector(forward, speed);
          if (keys["KeyS"] || keys["ArrowDown"])
            camera.position.addScaledVector(forward, -speed);
          if (keys["KeyA"] || keys["ArrowLeft"])
            camera.position.addScaledVector(right, -speed);
          if (keys["KeyD"] || keys["ArrowRight"])
            camera.position.addScaledVector(right, speed);
          if (keys["KeyE"] || keys["Space"])
            camera.position.addScaledVector(up, speed);
          if (keys["KeyQ"] || keys["ShiftLeft"] || keys["ShiftRight"])
            camera.position.addScaledVector(up, -speed);

          renderer.render(scene, camera);
        });

        // Cleanup
        cleanup = () => {
          renderer.setAnimationLoop(null);
          renderer.dispose();
          splat.dispose();
          renderer.domElement.removeEventListener("click", onCanvasClick);
          renderer.domElement.removeEventListener("touchstart", onTouchStart);
          renderer.domElement.removeEventListener("touchmove", onTouchMove);
          document.removeEventListener("pointerlockchange", onPointerLockChange);
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("keydown", onKeyDown);
          document.removeEventListener("keyup", onKeyUp);
          window.removeEventListener("resize", onResize);
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement);
          }
        };
      } catch (err) {
        console.error("Spark viewer error:", err);
        setError(true);
        setIsLoading(false);
      }
    };

    void init();
    return () => cleanup?.();
  }, [splatUrl, onLoaded, retryNonce]);

  if (error) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          color: "#ffffff",
          gap: 12,
        }}
      >
        <p>3D environment unavailable</p>
        <button
          onClick={() => setRetryNonce((v) => v + 1)}
          style={{
            background: "#2563EB",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8,8,8,0.9)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            color: "#F0EDE6",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: "3px solid #222222",
              borderTop: "3px solid #2563EB",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              marginBottom: 16,
            }}
          />
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              color: "#E9E6DF",
            }}
          >
            Loading 3D environment...
          </p>
        </div>
      )}

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {!isLoading && (
        <div
          style={{
            position: "absolute",
            bottom: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.6)",
            color: "#ffffff",
            padding: "8px 16px",
            borderRadius: 20,
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Click to explore · WASD to move · Mouse to look around
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
