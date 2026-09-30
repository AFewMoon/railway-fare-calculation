/**
 * 票价计算引擎 - 统一入口
 * calculate(params) → { total, items, trace, warnings }
 */
import { SEATS, LEVELS, TICKETS, roundHalfUp, ceilTo, floorTo, createTrace, SEG_MODES } from './util.js';
import { stdSegment } from './standard.js';
import { km900Segment, timesSegment } from './nonstandard.js';
import { dachengSegment, qzSegment } from './special.js';
import { sleeperDiscountFare, applyHalf } from './discount.js';

export { SEATS, LEVELS, TICKETS, SEG_MODES };

/**
 * @param {object} p
 *  km: 全程里程（分段里程之和）
 *  seatKey, level, ac, acRate, ticket, sleeperDiscount
 *  segments: [{name, km, mode, u, factor, berthFactor, prorate}]
 */
export function calculate(p) {
  const trace = createTrace();
  const warnings = [];
  const seatDef = SEATS[p.seatKey] || SEATS.yz;
  const ctx = {
    seatKey: p.seatKey,
    level: p.level,
    ac: !!p.ac,
    acRate: p.ac ? (p.acRate ?? 0.5) : null,
  };

  const segs = (p.segments || []).filter(s => s.km > 0);
  if (!segs.length) {
    return { ok: false, error: '请至少输入一个里程大于 0 的计价区段。', total: 0, items: null, trace, warnings };
  }
  const totalKm = segs.reduce((s, x) => s + Number(x.km || 0), 0);

  trace.add('全程', '运价区段', segs.map(s =>
    `${s.name || SEG_MODES[s.mode].name} ${s.km}km`).join(' + '), totalKm, 'calc');

  // ── 逐段计算 ──
  const parts = [];
  segs.forEach((seg, i) => {
    const group = `区段${i + 1}：${seg.name || ''}（${SEG_MODES[seg.mode].name} ${seg.km}km）`;
    let r;
    switch (seg.mode) {
      case 'km900':   r = km900Segment(seg, ctx, trace, { group }); break;
      case 'times':   r = timesSegment(seg, ctx, trace, { group }); break;
      case 'dacheng': r = dachengSegment(seg, ctx, trace, { group }); break;
      case 'qz':      r = qzSegment(seg, ctx, trace, { group }); break;
      default:        r = stdSegment(seg, ctx, trace, {
        group,
        addInsurance: true,   // 国铁标准段保险计入客票（先加后扣）
      });
    }
    parts.push(r);
  });

  const sum = key => parts.reduce((s, x) => s + (x[key] || 0), 0);
  const seatRawTotal = sum('seatRaw');

  let fares = {
    seat: sum('seat'),
    speed: sum('speed'),
    acTicket: sum('acTicket'),
    berth: sum('berth'),
    extra: sum('extra'),
  };

  // ── 短途卧铺折扣 ──
  if (p.sleeperDiscount && p.sleeperDiscount !== 'none') {
    fares.berth = sleeperDiscountFare(p.sleeperDiscount, fares.seat, totalKm, trace);
  }

  // ── 半价优惠 ──
  let halfApplied = false;
  if (p.ticket !== 'full') {
    const half = applyHalf(fares, p.ticket, !seatDef.soft);
    if (half.applied) {
      fares = half;
      halfApplied = true;
      trace.add('半价优惠', TICKETS[p.ticket].name,
        '客票、加快、空调票减半' + (p.ticket === 'veteran' ? '，卧铺票亦减半' : '，卧铺票全额'),
        null, 'calc');
    } else {
      warnings.push('学生票仅对硬席列车适用，当前为软席，未执行半价优惠。');
    }
  }

  // ── 保险（先加后扣；扣除额） ──
  const ins = ceilTo(seatRawTotal * 0.02, 0.1);
  trace.add('保险', '保险费（按全程客票基价计）',
    `ceil0.1(${seatRawTotal.toFixed(5)}×0.02)`, ins, 'round');
  const dedFull = Math.max(ceilTo(ins, 0.5), 0.5);
  const ded = halfApplied ? Math.max(floorTo(dedFull / 2, 0.5), 0) : dedFull;
  trace.add('保险', '扣除保险',
    halfApplied
      ? `floor0.5(全价扣除 ${dedFull} 元 ÷ 2)（半价票，可为 0）`
      : `max(ceil0.5(保险 ${ins} 元), 0.5)（起价五角，不足按五角扣）`,
    ded, 'round');

  // ── 杂费 ──
  // 软票费：优惠后客票 ≤5 元收 0.5，否则 1 元；半价票减半但最少 0.5
  let softTicket = fares.seat <= 5 ? 0.5 : 1;
  let softNote = `客票 ${fares.seat} 元 ${fares.seat <= 5 ? '≤' : '>'} 5 元`;
  if (halfApplied) {
    softTicket = Math.max(softTicket * 0.5, 0.5);
    softNote += '（半价票减半，最少五角）';
  }
  trace.add('杂费', '软票费', softNote, softTicket, 'fee');

  // 候车室空调费：硬席且（全程 >200km 或执行 900km 运价）；半价票 0.5 元
  const any900 = segs.some(s => s.mode === 'km900');
  let waitingAC = 0;
  if (!seatDef.soft && (totalKm > 200 || any900)) {
    waitingAC = halfApplied ? 0.5 : 1;
    trace.add('杂费', '候车室空调费',
      `硬席，全程 ${totalKm}km${any900 ? '，执行 900km 运价必收' : ''}${halfApplied ? '（半价 0.5 元）' : ''}`,
      waitingAC, 'fee');
  }

  // 卧铺订票费
  const bookingFee = fares.berth > 0 ? 10 : 0;
  if (bookingFee) trace.add('杂费', '卧铺订票费', '有卧铺时收取', bookingFee, 'fee');

  // ── 合计 ──
  const total = roundHalfUp(
    fares.seat + fares.speed + fares.acTicket + fares.berth + fares.extra
    + softTicket + waitingAC + bookingFee - ded, 2);

  trace.add('合计', '总票价',
    `${fares.seat}+${fares.speed}+${fares.acTicket}+${fares.berth}` +
    (fares.extra ? `+${fares.extra}` : '') +
    `+${softTicket}${waitingAC ? `+${waitingAC}` : ''}${bookingFee ? `+${bookingFee}` : ''}−${ded}`,
    total, 'total');

  return {
    ok: true,
    total,
    items: {
      seat: fares.seat,
      speed: fares.speed,
      acTicket: fares.acTicket,
      berth: fares.berth,
      extra: fares.extra,
      softTicket,
      waitingAC,
      bookingFee,
      insurance: ins,
      deduct: ded,
      halfApplied,
      billingKmTotal: totalKm,
    },
    trace,
    warnings,
  };
}
