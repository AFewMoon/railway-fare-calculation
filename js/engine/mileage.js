/**
 * 计费里程换算与递远递减
 * 计费里程：取里程所在计费区间的两端数字平均值
 */
import { roundHalfUp } from './util.js';

/** 计费区间档位：里程上限 → [区间宽度, 区间锚点] */
const BANDS = [
  [200, 10, 0], [400, 20, 200], [700, 30, 400], [1100, 40, 700], [1600, 50, 1100],
  [2200, 60, 1600], [2900, 70, 2200], [3700, 80, 2900], [4600, 90, 3700], [Infinity, 100, 4600],
];

/**
 * 计费里程换算（区间以下限为锚点，取所在区间两端均值）
 * 例：23→25、126→125、765→760、900→880、905→920、1208→1225
 */
export function billingKm(dist) {
  if (!(dist >= 1)) return 0;
  const band = BANDS.find(([limit]) => dist <= limit);
  const [, L, anchor] = band;
  const lower = anchor + Math.floor((dist - 1 - anchor) / L) * L;   // 区间下端
  return lower + L / 2;                                             // 两端均值
}

/** 递远递减折扣档（依据基价率的里程分段） */
export const TIERS = [
  { to: 200, rate: 1.0 }, { to: 500, rate: 0.9 }, { to: 1000, rate: 0.8 },
  { to: 1500, rate: 0.7 }, { to: 2500, rate: 0.6 }, { to: Infinity, rate: 0.5 },
];

/** 分解为 [ {km, rate} ] 各档实际里程 */
export function tierBreakdown(km) {
  const out = [];
  let from = 0;
  for (const t of TIERS) {
    if (km <= from) break;
    const seg = Math.min(km, t.to) - from;
    out.push({ km: seg, rate: t.rate });
    from = t.to;
  }
  return out;
}

/** 递远递减加权里程（Σ km×折扣率），即客票计算的等效里程 */
export function tierUnits(km) {
  return tierBreakdown(km).reduce((s, t) => s + t.km * t.rate, 0);
}

/** 加快/卧铺/空调票率按 5 位舍入后 × 各档里程（各自独立累加） */
export function tierUnitsR5(km, rate5) {
  return tierBreakdown(km).reduce((s, t) => s + rate5 * t.km * t.rate, 0);
}

/** 起步里程约束（客票/空调 20km，加快 100km，卧铺 400km） */
export function withStart(billKm, startKm) {
  return Math.max(billKm, startKm);
}

export { roundHalfUp };
