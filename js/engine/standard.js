/**
 * 标准票价引擎（国铁标准运价）
 * 实现分项基价、递远递减、新空调上浮、快速加快“先浮动、后舍入、再翻番”。
 */
import { RATES, SEATS, LEVELS, roundHalfUp, round5, createTrace } from './util.js';
import { billingKm, tierUnits, tierUnitsR5, withStart } from './mileage.js';

/** 新空调上浮默认 50% */
export const AC_RATE_DEFAULT = 0.5;

/** 卧铺不足起步里程的折算比例（非标准分段计价时适用） */
export function berthProrate(km) {
  if (km <= 100) return 0.25;
  if (km <= 200) return 0.5;
  if (km <= 300) return 0.75;
  return 1;
}

/**
 * 计算单个“国铁标准运价”分段的各分项票价（已含新空调/快速上浮链）。
 * @param {object} seg  {km, mode:'standard', prorate}
 * @param {object} ctx  {seatKey, level, ac, acRate}
 * @param {object} trace 明细记录器
 * @param {object} opt  {addInsurance:boolean, group:string}
 * @returns {object} {seat, speed, acTicket, berth, extra, seatRaw}
 */
export function stdSegment(seg, ctx, trace, opt = {}) {
  const group = opt.group || `标准运价 ${seg.km}km`;
  const seatDef = SEATS[ctx.seatKey];
  const level = LEVELS[ctx.level];
  const acRate = ctx.ac ? ctx.acRate : null;
  const B = billingKm(seg.km);
  const startKm = 20;
  const res = { seat: 0, speed: 0, acTicket: 0, berth: 0, extra: 0, seatRaw: 0 };

  trace.add(group, '计费里程', `实际 ${seg.km}km → 计费里程`, B, 'calc');

  const units = tierUnits(withStart(B, startKm));   // 客票起步里程 20km
  const seatRaw = RATES.baseSeat * units;      // 硬座率运价（保险计价基础）
  res.seatRaw = seatRaw;

  // ── 客票 ──
  let seatRawWith = seatDef.mult * seatRaw;
  if (opt.addInsurance) {
    const ins = Math.ceil(seatRaw * 0.02 * 10 - 1e-9) / 10;
    seatRawWith += ins;
    trace.add(group, '保险费（计入客票）', `ceil(${seatRaw.toFixed(5)}×0.02, 0.1元)`, ins, 'round');
  }
  let seat = roundHalfUp(seatRawWith);
  trace.add(group, `客票（${seatDef.name}）`,
    `round(${seatRawWith.toFixed(5)})`, seat, 'round');
  if (acRate != null) {
    seat = roundHalfUp(seat * (1 + acRate));
    trace.add(group, '客票新空调上浮', `round(${(seat / (1 + acRate)).toFixed(1)}×${(1 + acRate)})`,
      seat, 'round');
  }
  res.seat = seat;

  // ── 加快票 ──
  if (level.speedX > 0) {
    const speedStart = withStart(B, 100);
    let sp = roundHalfUp(tierUnitsR5(speedStart, RATES.speedBase));
    trace.add(group, '普快加快票',
      `round(0.01172×加权里程(${speedStart}km))`, sp, 'round');
    if (acRate != null) {
      sp = roundHalfUp(sp * (1 + acRate));
      trace.add(group, '加快票新空调上浮（先浮动）', `round(前值×${1 + acRate})`, sp, 'round');
    }
    if (level.speedX === 2) {
      sp = sp * 2;
      trace.add(group, ctx.level === 'tekuai' ? '特快加快（再翻番）' : '快速加快（再翻番）',
        `前值×2`, sp, 'round');
    }
    res.speed = sp;
  }

  // ── 空调票 ──
  if (acRate != null) {
    const unitsAC = tierUnitsR5(withStart(B, startKm), RATES.acBase);
    let acRaw = Math.max(roundHalfUp(unitsAC), 1);   // 先取整，起步票价 1 元
    trace.add(group, '空调票（未上浮）',
      `max(round(0.01465×加权里程(${B}km)), 1元)`, acRaw, 'round');
    const act = roundHalfUp(acRaw * (1 + acRate));
    trace.add(group, '空调票上浮', `round(${acRaw}×${1 + acRate})`, act, 'round');
    res.acTicket = act;
  }

  // ── 卧铺票 ──
  if (seatDef.berth) {
    const rateBase = RATES.baoMult[seatDef.berthKey]
      ? RATES.berths[RATES.baoMult[seatDef.berthKey][0]] * RATES.baoMult[seatDef.berthKey][1]
      : RATES.berths[seatDef.berthKey];
    const rate5 = round5(rateBase);
    const berthStart = withStart(B, 400);
    let berth = roundHalfUp(tierUnitsR5(berthStart, rate5) * (acRate != null ? (1 + acRate) : 1));
    const expr = `round(round5(${rate5})×加权里程(${berthStart}km)${acRate != null ? `×${1 + acRate}` : ''})`;
    if (seg.prorate && seg.km < 400) {
      const frac = berthProrate(seg.km);
      berth = roundHalfUp(berth * frac * 2) / 2;    // 保留 0.5 元精度
      trace.add(group, '卧铺票（起步价折算）',
        `${expr} × ${frac}（${seg.km}km 折算档）`, berth, 'round');
    } else {
      trace.add(group, '卧铺票', expr, berth, 'round');
    }
    res.berth = berth;
  }

  return res;
}
