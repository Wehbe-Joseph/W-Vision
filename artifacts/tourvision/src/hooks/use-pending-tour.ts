const KEY = "wvision_pending_tour";

export interface PendingPhoto {
  name: string;
  dataUrl: string;
  size: number;
}

export interface PendingTour {
  url?: string;
  photos?: PendingPhoto[];
}

export function savePendingTour(data: PendingTour) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function loadPendingTour(): PendingTour | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingTour) : null;
  } catch {
    return null;
  }
}

export function clearPendingTour() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

export function hasPendingTour(): boolean {
  const t = loadPendingTour();
  return !!(t?.url || (t?.photos && t.photos.length > 0));
}

export async function filesToPendingPhotos(files: File[]): Promise<PendingPhoto[]> {
  return Promise.all(
    files.slice(0, 20).map(
      (file) =>
        new Promise<PendingPhoto>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) =>
            resolve({ name: file.name, dataUrl: e.target!.result as string, size: file.size });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        }),
    ),
  );
}
