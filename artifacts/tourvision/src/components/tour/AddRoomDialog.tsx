import { useCallback, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { filesToPendingPhotos, type PendingPhoto } from "@/hooks/use-pending-tour";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface AddRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (photos: PendingPhoto[]) => Promise<void>;
}

export default function AddRoomDialog({
  open,
  onOpenChange,
  loading,
  onSubmit,
}: AddRoomDialogProps) {
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    const converted = await filesToPendingPhotos(arr);
    setPhotos((prev) => {
      const names = new Set(prev.map((p) => p.name));
      return [...prev, ...converted.filter((c) => !names.has(c.name))];
    });
  }, []);

  const handleClose = (next: boolean) => {
    if (loading) return;
    if (!next) setPhotos([]);
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!photos.length || loading) return;
    await onSubmit(photos);
    setPhotos([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-[#121212] border-white/15 text-white">
        <DialogHeader>
          <DialogTitle>Add a room</DialogTitle>
          <DialogDescription className="text-white/55">
            Upload one or more photos of the same space. We will name the room
            with AI and build a 360° panorama (about 1–2 minutes).
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="w-full min-h-[120px] rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center gap-2 text-white/70 hover:bg-white/5 hover:border-white/35 transition-colors disabled:opacity-50"
        >
          <ImagePlus className="w-8 h-8 text-white/40" />
          <span className="text-sm">Choose photos</span>
        </button>

        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
            {photos.map((p) => (
              <div
                key={p.name}
                className="relative aspect-square rounded-md overflow-hidden border border-white/15"
              >
                <img
                  src={p.dataUrl}
                  alt={p.name}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  disabled={loading}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 flex items-center justify-center"
                  onClick={() =>
                    setPhotos((prev) => prev.filter((x) => x.name !== p.name))
                  }
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <Button
          className="w-full bg-white text-black hover:bg-white/90 font-semibold"
          disabled={loading || photos.length === 0}
          onClick={() => void handleSubmit()}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing & building 360°…
            </>
          ) : (
            `Generate room (${photos.length || 0} photo${photos.length === 1 ? "" : "s"})`
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
