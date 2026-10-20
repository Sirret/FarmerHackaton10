// Prefix internal links and asset paths with the GitHub Pages base path.
// Always use href('/kafo') instead of a bare '/kafo'.
export function href(path = '/') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}
