/**
 * 特殊线路运价：达成线单位里程票价、青藏线席别加价
 */
import { SEATS, LEVELS, roundHalfUp, DACHENG, QZ_ADD } from './util.js';
import { billingKm, withStart } from './mileage.js';

/**
 * 达成线单位里程票价（不可递远递减，与国铁分段计价）
 * 卧铺票、空调票 100km 起步。
 */
export function dachengSegment(seg, ctx, trace, opt = {}) {
  const group = opt.group || `达成线 ${seg.km}km`;
  const seatDef = SEATS[ctx.seatKey];
  const level = LEVELS[ctx.level];
  const B = billingKm(seg.km);
  const res = { seat: 0, speed: 0, acTicket: 0, berth: 0, extra: 0, seatRaw: 0 };

  trace.add(group, '计费里程', `实际 ${seg.km}km → 计费里程 ${B}km（单位里程票价，无递远递减）`, B, 'calc');

  // 客票
  const seatRate = seatDef.soft
    ? (ctx.ac ? DACHENG.seat.softAc : DACHENG.seat.softNormal)
    : (ctx.ac ? DACHENG.seat.ac : DACHENG.seat.normal);
  res.seat = roundHalfUp(seatRate * B);
  trace.add(group, `客票（${seatDef.name}）`, `round(${seatRate}×${B})`, res.seat, 'round');

  // 加快票
  if (level.speedX > 0) {
    let sp = roundHalfUp(DACHENG.speedNormal * B);
    trace.add(group, '普快加快票', `round(0.02×${B})`, sp, 'round');
    if (level.speedX === 2) {
      sp = sp * 2;
      trace.add(group, '快速/特快加快（二倍）', '前值×2', sp, 'round');
    }
    res.speed = sp;
  }

  // 空调票（100km 起步）
  if (ctx.ac) {
    res.acTicket = roundHalfUp(DACHENG.acTicket * withStart(B, DACHENG.berthStart));
    trace.add(group, '空调票', `round(0.02×max(${B}, 100))`, res.acTicket, 'round');
  }

  // 卧铺票（100km 起步）
  if (seatDef.berth) {
    const rates = DACHENG.berth[seatDef.berthKey] || DACHENG.berth.yw_xia;
    const rate = ctx.ac ? rates.ac : rates.normal;
    res.berth = roundHalfUp(rate * withStart(B, DACHENG.berthStart));
    trace.add(group, '卧铺票', `round(${rate}×max(${B}, 100))`, res.berth, 'round');
  }

  return res;
}

/**
 * 青藏线席别加价（格尔木-拉萨及拉日、拉林铁路，里程与国铁合并计算，加价单列）
 */
export function qzSegment(seg, ctx, trace, opt = {}) {
  const group = opt.group || `青藏加价 ${seg.km}km`;
  const addRate = QZ_ADD[ctx.seatKey] ?? 0;
  const B = billingKm(seg.km);
  const extra = roundHalfUp(addRate * B * 10) / 10;
  trace.add(group, '席别加价',
    `${addRate} 元/km × 计费里程 ${B}km（里程已并入国铁段）`, extra, 'calc');
  return { seat: 0, speed: 0, acTicket: 0, berth: 0, extra, seatRaw: 0 };
}
