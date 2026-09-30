// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AFewMoon

/**
 * 非标准运价引擎
 * 1) 900km 运价：f(900+dist) − f(900)，先差价→非标准上浮→舍入→新空调上浮→舍入→快速翻番
 * 2) 乘数上浮：在国铁票价基础上按系数链上浮（平南线×3、广深先1/2再3/10、海南等）
 */
import { RATES, SEATS, LEVELS, roundHalfUp, round5 } from './util.js';
import { billingKm, tierUnits, tierUnitsR5, withStart } from './mileage.js';
import { stdSegment, berthProrate } from './standard.js';

const KM900 = 900;

/**
 * 900km 运价分段
 * @param {object} seg {km, mode:'km900', u: 非标准上浮率(如0.5、0.35、0.2)}
 */
export function km900Segment(seg, ctx, trace, opt = {}) {
  const group = opt.group || `900km运价 ${seg.km}km`;
  const seatDef = SEATS[ctx.seatKey];
  const level = LEVELS[ctx.level];
  const acRate = ctx.ac ? ctx.acRate : null;
  const u = 1 + (seg.u ?? 0.5);

  const Bu = billingKm(KM900 + seg.km);
  const dUnits = tierUnits(Bu) - tierUnits(KM900);
  const res = { seat: 0, speed: 0, acTicket: 0, berth: 0, extra: 0, seatRaw: 0 };

  trace.add(group, '计费里程（差价法）',
    `计费(${KM900 + seg.km}km)=${Bu}km − 计费(${KM900}km)=${KM900}km → 加权里程差`, dUnits, 'calc', '', 'km');
  res.seatRaw = RATES.baseSeat * dUnits;

  // 客票：差价 → 舍入 → ×(1+u) → 舍入 → 新空调 → 舍入
  let seat = roundHalfUp(seatDef.mult * RATES.baseSeat * dUnits);
  trace.add(group, '客票差价', `round(${seatDef.mult}×0.05861×加权里程差)`, seat, 'round');
  seat = roundHalfUp(seat * u);
  trace.add(group, '客票非标准上浮', `round(前值×${u})`, seat, 'round');
  if (acRate != null) {
    seat = roundHalfUp(seat * (1 + acRate));
    trace.add(group, '客票新空调上浮', `round(前值×${1 + acRate})`, seat, 'round');
  }
  res.seat = seat;

  // 加快票
  if (level.speedX > 0) {
    let sp = roundHalfUp(tierUnitsR5(Bu, RATES.speedBase) - tierUnitsR5(KM900, RATES.speedBase));
    trace.add(group, '加快票差价', 'round(0.01172×加权里程差)', sp, 'round');
    sp = roundHalfUp(sp * u);
    trace.add(group, '加快票非标准上浮', `round(前值×${u})`, sp, 'round');
    if (acRate != null) {
      sp = roundHalfUp(sp * (1 + acRate));
      trace.add(group, '加快票新空调上浮（先浮动、后舍入）', `round(前值×${1 + acRate})`, sp, 'round');
    }
    if (level.speedX === 2) {
      sp = sp * 2;
      trace.add(group, '快速/特快加快（再翻番）', '前值×2', sp, 'round');
    }
    res.speed = sp;
  }

  // 空调票
  if (acRate != null) {
    let acv = Math.max(roundHalfUp(tierUnitsR5(Bu, RATES.acBase) - tierUnitsR5(KM900, RATES.acBase)), 1);
    trace.add(group, '空调票差价（起步1元）', 'max(round(0.01465×加权里程差), 1元)', acv, 'round');
    acv = roundHalfUp(acv * u);
    trace.add(group, '空调票非标准上浮', `round(前值×${u})`, acv, 'round');
    acv = roundHalfUp(acv * (1 + acRate));
    trace.add(group, '空调票新空调上浮', `round(前值×${1 + acRate})`, acv, 'round');
    res.acTicket = acv;
  }

  // 卧铺票（900km 以上不涉及起步里程）
  if (seatDef.berth) {
    const rateBase = RATES.baoMult[seatDef.berthKey]
      ? RATES.berths[RATES.baoMult[seatDef.berthKey][0]] * RATES.baoMult[seatDef.berthKey][1]
      : RATES.berths[seatDef.berthKey];
    const rate5 = round5(rateBase);
    let berth = roundHalfUp(tierUnitsR5(Bu, rate5) - tierUnitsR5(KM900, rate5));
    trace.add(group, '卧铺票差价', `round(round5(${rate5})×加权里程差)`, berth, 'round');
    berth = roundHalfUp(berth * u);
    trace.add(group, '卧铺票非标准上浮', `round(前值×${u})`, berth, 'round');
    if (acRate != null) {
      berth = roundHalfUp(berth * (1 + acRate));
      trace.add(group, '卧铺票新空调上浮', `round(前值×${1 + acRate})`, berth, 'round');
    }
    res.berth = berth;
  }

  return res;
}

/**
 * 乘数上浮分段：先按国铁标准运价计算，再依次乘以系数链（每乘一次四舍五入）
 * @param {object} seg {km, mode:'times', factor:'1.5' 或 '1.5,1.3', berthFactor:'1.5', prorate}
 */
export function timesSegment(seg, ctx, trace, opt = {}) {
  const factors = String(seg.factor || '1').split(',').map(Number).filter(x => x > 0);
  const berthFactors = String(seg.berthFactor || seg.factor || '1').split(',').map(Number).filter(x => x > 0);
  const group = opt.group || `乘数上浮 ${seg.km}km`;

  // 先按标准运价计算（不计入保险）
  const res = stdSegment(seg, ctx, trace, { ...opt, group: `${group}（基础国铁运价）`, addInsurance: false });

  const applyChain = (v, chain, label) => {
    let x = v;
    for (const f of chain) {
      x = roundHalfUp(x * f);
      trace.add(group, label, `round(前值×${f})`, x, 'round');
    }
    return x;
  };

  res.seat = applyChain(res.seat, factors, '客票乘数上浮');
  if (res.speed > 0) res.speed = applyChain(res.speed, factors, '加快票乘数上浮');
  if (res.acTicket > 0) res.acTicket = applyChain(res.acTicket, factors, '空调票乘数上浮');

  if (res.berth > 0) {
    if (seg.prorate && seg.km < 400) {
      const frac = berthProrate(seg.km);
      res.berth = roundHalfUp(res.berth * frac * 2) / 2;
      trace.add(group, '卧铺票起步折算', `前值×${frac}（${seg.km}km 折算档）`, res.berth, 'round');
    }
    res.berth = applyChain(res.berth, berthFactors, '卧铺票乘数上浮');
  }

  return res;
}
