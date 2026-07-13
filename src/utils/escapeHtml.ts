// Escapa texto antes de interpolarlo en un string de HTML crudo (document.write,
// dangerouslySetInnerHTML, ventanas de impresión, etc.). Cualquier dato que el usuario
// haya escrito en un formulario (nombre de cliente, dirección, nombre de empresa...) debe
// pasar por acá antes de terminar dentro de una plantilla HTML — si no, un valor como
// `<img src=x onerror=...>` se ejecutaría como script donde sea que se renderice ese HTML.
export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
