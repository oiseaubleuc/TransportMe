/**
 * Optimale volgorde van meerdere ritten: kortste totale weg.
 * Gebruikt greedy "dichtstbijzijnde volgende rit" (minimale extra km).
 */

/** Haversine-afstand in km tussen twee punten { lat, lng } */
export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Math.round(R * c);
}

/**
 * Bouw afstandsmatrix (in km) tussen alle locaties.
 * locations: array van { id, lat, lng } (id optioneel)
 * matrixFn: async (locations) => number[][] of null voor Haversine
 */
export function buildDistanceMatrix(locations, matrixFn) {
  const n = locations.length;
  if (n === 0) return Promise.resolve([]);

  if (matrixFn) {
    return matrixFn(locations).then((matrix) => {
      const out = Array(n)
        .fill(0)
        .map(() => Array(n).fill(Infinity));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          out[i][j] = matrix[i]?.[j] ?? (i === j ? 0 : Infinity);
        }
      }
      return out;
    }).catch(() => buildDistanceMatrixHaversine(locations));
  }
  return Promise.resolve(buildDistanceMatrixHaversine(locations));
}

function buildDistanceMatrixHaversine(locations) {
  const n = locations.length;
  const matrix = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = i === j ? 0 : haversineKm(locations[i], locations[j]);
    }
  }
  return matrix;
}

/**
 * Bereken optimale volgorde van ritten (greedy).
 * - startIndex: index in locations van startpunt (waar je vertrekt)
 * - ritten: array van { fromId, toId, fromName, toName, defaultKm, ... }
 * - locations: array van { id, lat, lng } met id = ziekenhuis-id
 * - distMatrix: number[][] afstand in km tussen location-i en location-j (index = positie in locations)
 * - locationIndexById: { [id]: index }
 *
 * Greedy: start bij startIndex. Herhaal: kies de rit die de minste extra km toevoegt
 * (afstand van huidige positie naar rit.from + rit.defaultKm). Huidige positie = rit.to.
 */
export function computeOptimalOrder(startIndex, ritten, locations, distMatrix, locationIndexById) {
  const n = locations.length;
  if (n === 0 || !distMatrix?.length) return { order: [], totalRitKm: 0, totalConnectingKm: 0, totalKm: 0 };

  const getIdx = (id) => locationIndexById[id] ?? -1;
  const dist = (i, j) => {
    if (i < 0 || j < 0) return Infinity;
    return distMatrix[i]?.[j] ?? Infinity;
  };

  let order = [];
  let totalRitKm = 0;
  let totalConnectingKm = 0;
  let currentIndex = startIndex;
  const remaining = ritten.map((r, i) => ({ rit: r, index: i }));

  while (remaining.length > 0) {
    let best = null;
    let bestCost = Infinity;
    let bestJ = -1;

    for (let j = 0; j < remaining.length; j++) {
      const { rit } = remaining[j];
      const fromIdx = getIdx(rit.fromId);
      const toIdx = getIdx(rit.toId);
      if (fromIdx < 0 || toIdx < 0) continue;
      const ritKm = rit.defaultKm ?? 0;
      const connectingKm = dist(currentIndex, fromIdx);
      const cost = connectingKm + ritKm;
      if (cost < bestCost) {
        bestCost = cost;
        best = rit;
        bestJ = j;
      }
    }

    if (best == null) break;

    const fromIdx = getIdx(best.fromId);
    const toIdx = getIdx(best.toId);
    const connectingKm = dist(currentIndex, fromIdx);
    const ritKm = best.defaultKm ?? 0;

    totalConnectingKm += connectingKm;
    totalRitKm += ritKm;
    order.push(best);
    remaining.splice(bestJ, 1);
    currentIndex = toIdx;
  }

  return {
    order,
    totalRitKm,
    totalConnectingKm,
    totalKm: totalRitKm + totalConnectingKm,
  };
}
