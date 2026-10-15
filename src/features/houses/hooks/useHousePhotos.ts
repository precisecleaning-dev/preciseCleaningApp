// src/features/houses/hooks/useHousePhotos.ts
// ⭐ Fotos Before/After que se están capturando en el detalle o en el
//    formulario de una casa: archivos nuevos (ya comprimidos), sus vistas
//    previas y lo que queda fuera del reporte. Cada pantalla tiene las suyas.
//    Extraído de HousesView sin cambiar la lógica.
import { useState } from "react";
import { compressImage } from "../../../utils/imageCompression";
import type { PhotoConfig } from "../../../services/photoConfigService";

interface HousePhotosInit {
  /** Vistas previas iniciales (el formulario arranca con las guardadas). */
  before: string[];
  after: string[];
  /** Fotos marcadas "fuera del reporte". */
  beforeExcluded: string[];
  afterExcluded: string[];
}

export function useHousePhotos(photoConfig: PhotoConfig, init: HousePhotosInit) {
  const [beforePhotoURLs, setBeforePhotoURLs] = useState<string[]>(init.before);
  const [afterPhotoURLs, setAfterPhotoURLs] = useState<string[]>(init.after);
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);
  const [beforeExcluded, setBeforeExcluded] = useState<string[]>(init.beforeExcluded);
  const [afterExcluded, setAfterExcluded] = useState<string[]>(init.afterExcluded);
  const [isCompressing, setIsCompressing] = useState(false);

  const addPhotoFiles = async (
    files: FileList | File[] | null,
    type: "before" | "after",
  ) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setIsCompressing(true);
    try {
      const compressed = await Promise.all(
        arr.map((f) =>
          compressImage(f, {
            quality: photoConfig.compressionQuality,
            maxWidth: photoConfig.maxImageWidth,
            maxSizeMB: photoConfig.maxSizeMB,
          }),
        ),
      );
      const fileUrls = compressed.map((f) => URL.createObjectURL(f));
      if (type === "before") {
        setBeforeFiles((p) => [...p, ...compressed]);
        setBeforePhotoURLs((p) => [...p, ...fileUrls]);
      } else {
        setAfterFiles((p) => [...p, ...compressed]);
        setAfterPhotoURLs((p) => [...p, ...fileUrls]);
      }
    } catch (e) {
      console.error(e);
      alert("Error al procesar las imágenes. Intenta de nuevo.");
    } finally {
      setIsCompressing(false);
    }
  };

  const toggleReportPhoto = (url: string, type: "before" | "after") => {
    const setter = type === "before" ? setBeforeExcluded : setAfterExcluded;
    setter((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  };

  return {
    beforePhotoURLs, setBeforePhotoURLs, afterPhotoURLs, setAfterPhotoURLs,
    beforeFiles, setBeforeFiles, afterFiles, setAfterFiles,
    beforeExcluded, setBeforeExcluded, afterExcluded, setAfterExcluded,
    isCompressing, addPhotoFiles, toggleReportPhoto,
  };
}
