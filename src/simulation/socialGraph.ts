// ─────────────────────────────────────────────────────────────────────────────
// Social Graph – Barabási-Albert scale-free network
// Generuje graf społeczny dla populacji agentów.
// Każdy agent ma listę "obserwowanych" (followings) z preferencyjnym dołączaniem.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a Barabási-Albert graph for `n` agents.
 * Returns a Map<personaId, Set<personaId>> — who each agent follows.
 *
 * Parameters:
 *   m0 = initial clique size (default 5)
 *   m  = new edges per added node (default 3)
 */
export function buildSocialGraph(
  personaIds: string[],
  m0 = 5,
  m = 3
): Map<string, Set<string>> {
  const n = personaIds.length;
  const follows = new Map<string, Set<string>>();
  for (const id of personaIds) follows.set(id, new Set());

  if (n <= 1) return follows;

  // Degree tracker (undirected base, then we derive directed follows)
  const degree = new Map<string, number>();
  for (const id of personaIds) degree.set(id, 0);

  // ── Phase 1: initial clique of m0 nodes ──────────────────────────────────
  const clique = personaIds.slice(0, Math.min(m0, n));
  for (let i = 0; i < clique.length; i++) {
    for (let j = i + 1; j < clique.length; j++) {
      addEdge(follows, degree, clique[i], clique[j]);
    }
  }

  // ── Phase 2: preferential attachment ─────────────────────────────────────
  for (let i = clique.length; i < n; i++) {
    const newNode = personaIds[i];
    const targets = preferentialSample(
      personaIds.slice(0, i),
      degree,
      Math.min(m, i)
    );
    for (const target of targets) {
      addEdge(follows, degree, newNode, target);
    }
  }

  return follows;
}

function addEdge(
  follows: Map<string, Set<string>>,
  degree: Map<string, number>,
  a: string,
  b: string
) {
  // Directed: both follow each other (undirected edge → bidirectional follow)
  follows.get(a)!.add(b);
  follows.get(b)!.add(a);
  degree.set(a, (degree.get(a) ?? 0) + 1);
  degree.set(b, (degree.get(b) ?? 0) + 1);
}

/**
 * Sample `k` distinct nodes from `candidates` with probability ∝ degree.
 * Falls back to uniform if all degrees are 0.
 */
function preferentialSample(
  candidates: string[],
  degree: Map<string, number>,
  k: number
): string[] {
  const pool = [...candidates];
  const selected: string[] = [];

  for (let pick = 0; pick < k && pool.length > 0; pick++) {
    const weights = pool.map((id) => (degree.get(id) ?? 0) + 1); // +1 so no zero-weight
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    let chosen = pool[pool.length - 1];
    for (let j = 0; j < pool.length; j++) {
      rand -= weights[j];
      if (rand <= 0) {
        chosen = pool[j];
        break;
      }
    }
    selected.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }

  return selected;
}
