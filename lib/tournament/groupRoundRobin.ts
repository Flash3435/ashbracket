/**
 * Single round-robin pairings for 4 teams (6 matches), standard schedule order.
 */
export function groupRoundRobinPairings<T>(teams: [T, T, T, T]): [T, T][] {
  const [a, b, c, d] = teams;
  return [
    [a, b],
    [c, d],
    [a, c],
    [b, d],
    [a, d],
    [b, c],
  ];
}
