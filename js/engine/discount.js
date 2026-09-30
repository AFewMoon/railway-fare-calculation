// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AFewMoon

/**
 * 折扣与优惠：短途卧铺折扣、半价票规则
 */
import { roundHalfUp } from './util.js';

/**
 * 短途卧铺折扣票价（以硬座票价为基准）
 * 硬卧折扣：>200km 158%，≤200km 170%（上中下铺一致）
 * 软卧折扣：>200km 258%，≤200km 270%（上下铺一致）
 */
export function sleeperDiscountFare(kind, seatFare, totalKm, trace) {
  const long = totalKm > 200;
  const ratio = kind === 'hard' ? (long ? 1.58 : 1.70) : (long ? 2.58 : 2.70);
  const fare = roundHalfUp(seatFare * ratio * 2) / 2;
  trace.add('短途卧铺折扣',
    `${kind === 'hard' ? '硬卧' : '软卧'}折扣票价`,
    `round0.5(硬座 ${seatFare} 元 × ${ratio}（${long ? '大于' : '不大于'}200km 档）)`, fare, 'round');
  return fare;
}

/**
 * 半价票优惠（学生/儿童：半价客票、加快、空调，卧铺全额；
 * 伤残军人：卧铺亦半价）。返回各分项折后值。
 */
export function applyHalf(fares, kind, isHardClass) {
  const out = { ...fares };
  // 学生票仅硬席适用
  if (kind === 'student' && !isHardClass) return { ...out, applied: false };
  out.seat = out.seat / 2;
  out.speed = out.speed / 2;
  out.acTicket = out.acTicket / 2;
  if (kind === 'veteran') out.berth = out.berth / 2;
  out.applied = true;
  return out;
}
