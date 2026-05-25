import { useState } from "react";
import PannellumViewer from "@/components/tour/PannellumViewer";
import { getApiUrl } from "@/lib/runtime-api";
import { Button } from "@/components/ui/button";

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200";

const ROOM_TYPES = [
  "Living Room",
  "Kitchen",
  "Master Bedroom",
  "Bedroom",
  "Bathroom",
  "Dining Room",
];

export default function TestPanoramaPage() {
  const [imageUrl, setImageUrl] = useState(DEFAULT_IMAGE);
  const [roomType, setRoomType] = useState("Living Room");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panoramaUrl, setPanoramaUrl] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setPanoramaUrl(null);

    try {
      const res = await fetch(getApiUrl("/api/test-panorama"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, roomType }),
      });
      const body = (await res.json()) as {
        panoramaUrl?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      if (!body.panoramaUrl) {
        throw new Error("No panorama URL returned");
      }
      setPanoramaUrl(body.panoramaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col">
      <div className="border-b border-white/10 p-4 space-y-3 max-w-xl w-full mx-auto">
        <h1 className="text-lg font-semibold">Panorama pipeline test</h1>
        <label className="block text-xs text-white/60">Image URL</label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className="w-full h-10 rounded-md border border-white/20 bg-white/5 px-3 text-sm"
        />
        <label className="block text-xs text-white/60">Room type</label>
        <select
          value={roomType}
          onChange={(e) => setRoomType(e.target.value)}
          className="w-full h-10 rounded-md border border-white/20 bg-white/5 px-3 text-sm"
        >
          {ROOM_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Generating… (30–60s)" : "Generate Panorama"}
        </Button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div className="flex-1 min-h-[60vh] relative">
        {panoramaUrl ? (
          <PannellumViewer
            rooms={[
              {
                roomType,
                panoramaUrl,
                floorNumber: 1,
              },
            ]}
            isFreetier
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
            {loading
              ? "Calling OpenAI…"
              : "Generate a panorama to preview it here"}
          </div>
        )}
      </div>
    </div>
  );
}
