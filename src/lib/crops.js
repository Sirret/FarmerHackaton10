/**
 * IndexedDB returns crop_calendar rows by key (alphabetical). Menus need the fixed
 * order from sort_order (1 Tomato, 2 Onion, 3 Pepper, 4 Okra): USSD keys depend on it.
 * Sorts in place and returns the array.
 */
export function sortCrops(rows) {
  return rows.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.crop.localeCompare(b.crop));
}
