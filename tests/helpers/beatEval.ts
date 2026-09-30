// 拍の検出の評価（一般的な F 値: 正解から ±tolerance 秒以内の検出を正解とし、1対1で対応させる）

export function beatFMeasure(detected: number[], truth: number[], tolerance = 0.07) {
  const used = new Set<number>();
  let hit = 0;
  for (const t of truth) {
    let best = -1;
    let bestD = tolerance;
    detected.forEach((d, i) => {
      const dist = Math.abs(d - t);
      if (!used.has(i) && dist <= bestD) {
        bestD = dist;
        best = i;
      }
    });
    if (best >= 0) {
      used.add(best);
      hit++;
    }
  }
  const precision = detected.length ? hit / detected.length : 0;
  const recall = truth.length ? hit / truth.length : 0;
  const f = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { f, precision, recall };
}

/** 検出した拍と正解の拍の時刻のずれの中央値（秒、正なら検出が遅い） */
export function medianOffset(detected: number[], truth: number[], tolerance = 0.07): number {
  const diffs: number[] = [];
  for (const t of truth) {
    let best: number | null = null;
    for (const d of detected) if (Math.abs(d - t) <= tolerance && (best === null || Math.abs(d - t) < Math.abs(best))) best = d - t;
    if (best !== null) diffs.push(best);
  }
  diffs.sort((a, b) => a - b);
  return diffs.length ? diffs[Math.floor(diffs.length / 2)] : NaN;
}
