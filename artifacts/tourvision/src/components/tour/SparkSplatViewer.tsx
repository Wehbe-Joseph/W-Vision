import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { SplatFileType } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

export interface SparkSplatViewerProps {
  splatUrl: string;
  roomLabel: string;
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
}

type ViewerState =
  | { kind: "fetching"; progress: number }
  | { kind: "decoding" }
  | { kind: "ready" }
  | { kind: "error"; message: string; status?: number };

/**
 * Fetch the .spz bytes on the main thread so we can:
 *   • surface HTTP / CORS errors clearly (Spark's worker fetch swallows them)
 *   • show real download progress to the user
 *   • enforce a sane timeout instead of hanging on a stalled connection
 *
 * Returns an ArrayBuffer ready to hand to SplatMesh as `fileBytes`.
 */
async function downloadSpz(
  url: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number | null) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    signal,
    mode: "cors",
    credentials: "omit",
    cache: "force-cache",
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`.trim());
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const totalHeader = res.headers.get("content-length");
  const total = totalHeader ? Number(totalHeader) : null;

  // Stream so we can report progress while the bytes come in.
  if (!res.body) {
    return await res.arrayBuffer();
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress(received, total);
    }
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/**
 * Full-screen Gaussian splat viewer (Spark + THREE). No iframes.
 *
 * Desktop (fine pointer): click canvas to lock pointer — mouse look + WASD/arrows + scroll.
 * Touch / coarse pointer: OrbitControls (drag to orbit, pinch to zoom).
 */
export function SparkSplatViewer({
  splatUrl,
  roomLabel,
  onLoadStart,
  onLoadComplete,
}: SparkSplatViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ViewerState>({
    kind: "fetching",
    progress: 0,
  });
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    setState({ kind: "fetching", progress: 0 });
    const mount = mountRef.current;
    if (!mount || !splatUrl) return;

    let cancelled = false;
    const abort = new AbortController();
    onLoadStart?.();

    // Hard cap so a stalled download never leaves the user on an infinite spinner.
    const HARD_TIMEOUT_MS = 90_000;
    const timeoutId = window.setTimeout(() => {
      abort.abort();
    }, HARD_TIMEOUT_MS);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 512);
    camera.position.set(0, 1.45, 2.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    mount.appendChild(renderer.domElement);

    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    let splat: SplatMesh | null = null;
    let pointerLock: PointerLockControls | null = null;
    let orbit: OrbitControls | null = null;
    let hintEl: HTMLDivElement | null = null;
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

    const finePointer =
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: fine)").matches;

    let onClick: ((e: MouseEvent) => void) | null = null;
    let onWheel: ((e: WheelEvent) => void) | null = null;
    let onLockChange: (() => void) | null = null;
    let animationActive = false;

    const teardown = () => {
      cancelled = true;
      abort.abort();
      window.clearTimeout(timeoutId);
      ro.disconnect();
      if (animationActive) renderer.setAnimationLoop(null);
      if (pointerLock) {
        if (onClick) renderer.domElement.removeEventListener("click", onClick);
        if (onWheel) renderer.domElement.removeEventListener("wheel", onWheel);
        if (onLockChange) {
          document.removeEventListener("pointerlockchange", onLockChange);
        }
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        hintEl?.remove();
        pointerLock.dispose();
      }
      if (orbit) orbit.dispose();
      if (splat) {
        try {
          splat.dispose();
        } catch {
          /* ignore */
        }
      }
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };

    const frameTargetFor = (mesh: SplatMesh): THREE.Vector3 => {
      try {
        const box = mesh.getBoundingBox(true);
        const c = new THREE.Vector3();
        box.getCenter(c);
        if (Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z)) {
          return c;
        }
      } catch {
        /* fall through */
      }
      return new THREE.Vector3(0, 1.2, 0);
    };

    const attachControls = (mesh: SplatMesh) => {
      if (finePointer) {
        pointerLock = new PointerLockControls(camera, renderer.domElement);
        hintEl = document.createElement("div");
        hintEl.className =
          "pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 z-20 max-w-[min(90vw,28rem)] rounded-full bg-white/10 px-4 py-2 text-center text-xs text-white/90 border border-white/15 backdrop-blur-md shadow-lg";
        hintEl.textContent =
          "Click to look · WASD or arrows to walk · scroll to zoom · ESC to release";
        mount.appendChild(hintEl);

        onLockChange = () => {
          if (hintEl) hintEl.style.opacity = pointerLock?.isLocked ? "0" : "1";
        };
        document.addEventListener("pointerlockchange", onLockChange);

        onClick = () => {
          void pointerLock?.lock();
        };
        renderer.domElement.addEventListener("click", onClick);

        onWheel = (e: WheelEvent) => {
          if (!pointerLock?.isLocked) return;
          e.preventDefault();
          const forward = new THREE.Vector3();
          camera.getWorldDirection(forward);
          camera.position.addScaledVector(forward, -e.deltaY * 0.0025);
        };
        renderer.domElement.addEventListener("wheel", onWheel, {
          passive: false,
        });

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);

        const c = frameTargetFor(mesh);
        camera.position.copy(c.clone().add(new THREE.Vector3(0.15, 0.2, 1.85)));

        const clock = new THREE.Clock();
        const animate = () => {
          const delta = Math.min(clock.getDelta(), 0.06);
          if (pointerLock?.isLocked) {
            const speed = 3.2 * delta;
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.y = 0;
            if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
            forward.normalize();
            const right = new THREE.Vector3()
              .crossVectors(forward, new THREE.Vector3(0, 1, 0))
              .normalize();

            let fx = 0;
            let fz = 0;
            if (keys.has("KeyW") || keys.has("ArrowUp")) fz -= 1;
            if (keys.has("KeyS") || keys.has("ArrowDown")) fz += 1;
            if (keys.has("KeyA") || keys.has("ArrowLeft")) fx -= 1;
            if (keys.has("KeyD") || keys.has("ArrowRight")) fx += 1;
            if (fx !== 0 || fz !== 0) {
              const step = new THREE.Vector3()
                .addScaledVector(right, fx * speed)
                .addScaledVector(forward, -fz * speed);
              camera.position.add(step);
            }
          }
          renderer.render(scene, camera);
        };
        animationActive = true;
        renderer.setAnimationLoop(animate);
        return;
      }

      orbit = new OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.06;
      orbit.minDistance = 0.35;
      orbit.maxDistance = 28;
      orbit.enablePan = true;

      const c = frameTargetFor(mesh);
      orbit.target.copy(c);
      camera.position.copy(c.clone().add(new THREE.Vector3(0.55, 0.35, 1.85)));
      orbit.update();

      const animateOrbit = () => {
        orbit?.update();
        renderer.render(scene, camera);
      };
      animationActive = true;
      renderer.setAnimationLoop(animateOrbit);
    };

    (async () => {
      try {
        const bytes = await downloadSpz(
          splatUrl,
          abort.signal,
          (loaded, total) => {
            if (cancelled) return;
            setState({
              kind: "fetching",
              progress: total ? loaded / total : Math.min(0.95, loaded / 5_000_000),
            });
          },
        );
        if (cancelled) return;

        setState({ kind: "decoding" });

        const mesh = new SplatMesh({
          fileBytes: bytes,
          fileType: SplatFileType.SPZ,
          fileName: "world.spz",
          onLoad: () => {
            if (cancelled) return;
            setState({ kind: "ready" });
            onLoadComplete?.();
          },
        });
        // SplatMesh extends THREE.Object3D but the published types omit the
        // inherited transform fields. Reach through Object3D to flip the
        // splat to a Y-up world.
        (mesh as unknown as THREE.Object3D).quaternion.set(1, 0, 0, 0);
        splat = mesh;
        scene.add(mesh);

        try {
          await mesh.initialized;
        } catch (err) {
          if (cancelled) return;
          throw err;
        }
        if (cancelled) return;
        attachControls(mesh);
      } catch (err) {
        if (cancelled) return;
        window.clearTimeout(timeoutId);
        const aborted =
          (err as DOMException | undefined)?.name === "AbortError";
        const status = (err as Error & { status?: number })?.status;
        const message = aborted
          ? "The 3D scene took too long to download — your connection may be slow or the file is still being mirrored to storage."
          : err instanceof Error
          ? err.message
          : "Unknown error while loading the 3D scene.";
        setState({ kind: "error", message, status });
        onLoadComplete?.();
      }
    })();

    return teardown;
  }, [splatUrl, retryNonce, onLoadStart, onLoadComplete]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 z-0"
      role="application"
      aria-label={`3D viewer: ${roomLabel}`}
    >
      {state.kind === "fetching" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-24">
          <div className="rounded-full bg-black/55 px-4 py-2 text-xs text-white/80 backdrop-blur-md border border-white/10">
            Loading {roomLabel} · {Math.round(state.progress * 100)}%
          </div>
        </div>
      )}
      {state.kind === "decoding" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-24">
          <div className="rounded-full bg-black/55 px-4 py-2 text-xs text-white/80 backdrop-blur-md border border-white/10">
            Preparing {roomLabel}…
          </div>
        </div>
      )}
      {state.kind === "error" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="max-w-md rounded-2xl border border-white/10 bg-zinc-950/90 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-300">
              !
            </div>
            <h3 className="mb-1 text-base font-semibold text-white">
              Couldn’t load {roomLabel}
            </h3>
            <p className="mb-4 text-sm leading-relaxed text-white/60">
              {state.status === 404
                ? "The 3D environment file isn’t available at its expected URL yet. It may still be uploading from the spatial AI engine."
                : state.status === 403
                ? "The 3D world file isn’t public. Open the Supabase Storage “tours” bucket and make sure it’s set to public, with CORS allowing your site origin."
                : state.message}
            </p>
            <button
              onClick={() => setRetryNonce((n) => n + 1)}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SparkSplatViewer;
