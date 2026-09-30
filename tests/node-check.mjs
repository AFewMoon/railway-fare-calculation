/**
 * Node 快速回归脚本（开发期校验，不部署）
 * 运行：node tests/node-check.mjs
 */
import { calculate } from '../js/engine/index.js';
import { CASES } from './cases.js';

let pass = 0, fail = 0, approx = 0;
for (const c of CASES) {
  const r = calculate(c.p);
  const got = r.total;
  const ok = Math.abs(got - c.expect) < 0.001;
  if (ok) pass++;
  else if (c.approx) approx++;
  else fail++;
  console.log(`${ok ? '✓' : (c.approx ? '≈' : '✗')} [${c.id} ${c.desc}] 期望 ${c.expect} → 实际 ${got}` +
    (!ok && c.approx ? `（偏差 ${-(c.expect - got)}）` : ''));
  if (!ok && !c.approx) {
    r.trace.steps.forEach(s => console.log(`    ${s.group} | ${s.label} | ${s.expr} | ${s.value}`));
  }
}
console.log(`\n通过 ${pass} / 失败 ${fail} / 参考偏差 ${approx}`);
