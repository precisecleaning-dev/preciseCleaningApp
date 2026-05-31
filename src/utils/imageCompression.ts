/**
 * Utility para comprimir imágenes antes de subirlas
 * Mantiene buena calidad visual mientras reduce drasticamente el tamaño
 */

export interface CompressionOptions {
  maxWidth?: number;        // Máximo ancho/alto en pixeles (default: 1920)
  quality?: number;          // Calidad JPEG 0-1 (default: 0.85)
  maxSizeMB?: number;        // Tamaño máximo objetivo en MB (default: 1)
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  quality: 0.85,
  maxSizeMB: 1
};

/**
 * Comprime una imagen usando Canvas API
 * @param file - Archivo de imagen original
 * @param options - Opciones de compresión
 * @returns Nuevo File comprimido (siempre JPEG)
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Si no es una imagen, devolver tal cual
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const originalSize = file.size / 1024 / 1024; // MB
  console.log(`📷 Original: ${file.name} (${originalSize.toFixed(2)} MB)`);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image'));

      img.onload = () => {
        // Calcular nuevas dimensiones manteniendo aspect ratio
        let { width, height } = img;
        if (width > height) {
          if (width > opts.maxWidth) {
            height = Math.round((height * opts.maxWidth) / width);
            width = opts.maxWidth;
          }
        } else {
          if (height > opts.maxWidth) {
            width = Math.round((width * opts.maxWidth) / height);
            height = opts.maxWidth;
          }
        }

        // Crear canvas y dibujar imagen redimensionada
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Mejorar calidad del redimensionado
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a JPEG con compresión
        let currentQuality = opts.quality;

        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob'));
                return;
              }

              const sizeMB = blob.size / 1024 / 1024;

              // Si todavía pesa mucho y la calidad es alta, intentar bajarla
              if (sizeMB > opts.maxSizeMB && currentQuality > 0.5) {
                currentQuality -= 0.1;
                tryCompress();
                return;
              }

              // Crear nuevo nombre con extensión .jpg
              const originalName = file.name.replace(/\.[^/.]+$/, '');
              const newName = `${originalName}.jpg`;

              const compressedFile = new File([blob], newName, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });

              const finalSize = compressedFile.size / 1024 / 1024;
              const reduction = ((1 - finalSize / originalSize) * 100).toFixed(1);
              console.log(`✅ Compressed: ${compressedFile.name} (${finalSize.toFixed(2)} MB) - ${reduction}% smaller, quality: ${currentQuality.toFixed(2)}`);

              resolve(compressedFile);
            },
            'image/jpeg',
            currentQuality
          );
        };

        tryCompress();
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Comprime múltiples imágenes en paralelo
 */
export async function compressImages(
  files: File[],
  options: CompressionOptions = {}
): Promise<File[]> {
  return Promise.all(files.map(file => compressImage(file, options)));
}