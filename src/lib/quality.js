// Data-quality checks (spec §8.11). Pure: they return flag reasons; actions.js
// writes the flags table and the admin approves or corrects later.

// Expected kg more than this × (beds × kg_per_bed) is "far above capacity".
export const KG_OVER_FACTOR = 1.5;
// Weighed kg this far (as a share) from the estimate is an "estimate gap".
export const ESTIMATE_GAP = 0.3;

/**
 * @param {{ planting: { beds: number, expected_kg: number }, kgPerBed: number, totalBeds: number, otherActiveBeds: number }} p
 * @returns {string[]} flag reasons
 */
export function plantingFlags({ planting, kgPerBed, totalBeds, otherActiveBeds }) {
  const over = planting.expected_kg > planting.beds * kgPerBed * KG_OVER_FACTOR
    || planting.beds + otherActiveBeds > totalBeds;
  return over ? ['kg_over_capacity'] : [];
}

/** Weighed kg vs estimated kg. */
export function deliveryFlags({ expectedKg, weighedKg }) {
  if (!(expectedKg > 0)) return [];
  return Math.abs(weighedKg - expectedKg) / expectedKg > ESTIMATE_GAP ? ['estimate_gap'] : [];
}
