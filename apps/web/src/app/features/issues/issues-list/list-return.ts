/**
 * Recuerda desde qué bandeja (vista, búsqueda, filtros y orden) se abrió una novedad y en qué
 * posición estaba la lista, para que «Volver a Novedades» y el botón Atrás devuelvan al mismo
 * lugar. Se guarda en sessionStorage: dura lo que la pestaña y no se comparte entre cuentas.
 */
const URL_KEY = 'sigproh:issues-return-url';
const SCROLL_KEY = 'sigproh:issues-scroll';

export interface ListReturn {
  path: string;
  queryParams: Record<string, string>;
}

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: se vuelve a la bandeja general
  }
}

/** Guarda la URL de la bandeja y su desplazamiento antes de abrir un caso. */
export function rememberList(url: string, scrollY: number): void {
  if (!url.startsWith('/issues') || url.startsWith('/issues/')) return;
  write(URL_KEY, url);
  write(SCROLL_KEY, JSON.stringify({ url, y: Math.round(scrollY) }));
}

/** Destino de «Volver a Novedades»; si se entró directo al caso, la bandeja general. */
export function listReturnUrl(): ListReturn {
  const url = read(URL_KEY);
  if (!url) return { path: '/issues', queryParams: {} };
  const parsed = new URL(url, 'http://local');
  return { path: '/issues', queryParams: Object.fromEntries(parsed.searchParams.entries()) };
}

/** Posición guardada para esa URL exacta de la bandeja (se consume una sola vez). */
export function takeScroll(url: string): number | null {
  const raw = read(SCROLL_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as { url: string; y: number };
    if (saved.url !== url) return null;
    write(SCROLL_KEY, '');
    return saved.y;
  } catch {
    return null;
  }
}
