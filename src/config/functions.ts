// firebase/functions se baja la primera vez que se llama una Cloud Function,
// no al abrir la vista de casas (solo lo usan el Sync del Calendar y su panel de pruebas).
export async function callable(name: string) {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  return httpsCallable(getFunctions(), name);
}
