/** Shrink photos before API upload (Vercel serverless body limit ~4.5MB). */
export async function compressDataUrlForUpload(
  dataUrl: string,
  fileName: string,
  opts?: { maxEdge?: number; quality?: number },
): Promise<{ dataUrl: string; name: string }> {
  const maxEdge = opts?.maxEdge ?? 1920;
  const quality = opts?.quality ?? 0.82;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height, 1));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const baseName = fileName.replace(/\.[^.]+$/, "") || "photo";
      resolve({
        dataUrl: canvas.toDataURL("image/jpeg", quality),
        name: `${baseName}.jpg`,
      });
    };
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = dataUrl;
  });
}
