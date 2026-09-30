/**
 * 页面入口：参数收集 → 引擎计算 → 结果/明细渲染
 */
import { calculate } from './engine/index.js';
import { FormCtl } from './ui/form.js';
import { renderDetail, bindCopy } from './ui/detail.js';
import { fmtYuan } from './engine/util.js';

const $ = id => document.getElementById(id);
let debounceTimer = null;

const form = new FormCtl(onFormChange);

function onFormChange() {
  if (!$('autoCalc').checked) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(compute, 200);
}

function compute() {
  const params = form.collect();
  $('errBox').hidden = true;
  $('warnBox').hidden = true;

  let res;
  try {
    res = calculate(params);
  } catch (err) {
    $('errBox').textContent = '计算出错：' + err.message;
    $('errBox').hidden = false;
    return;
  }

  if (!res.ok) {
    $('errBox').textContent = res.error;
    $('errBox').hidden = false;
    return;
  }

  // 结果总览
  $('totalNum').textContent = fmtYuan(res.total);
  const it = res.items;
  const badges = [
    ['客票', it.seat], ['加快票', it.speed], ['空调票', it.acTicket],
    ['卧铺票', it.berth], ['席别加价', it.extra],
    ['软票费', it.softTicket], ['候车空调费', it.waitingAC], ['卧铺订票费', it.bookingFee],
  ];
  $('itemBadges').innerHTML = badges
    .filter(([, v]) => v > 0)
    .map(([n, v]) => `<li>${n} ${fmtYuan(v)} 元</li>`)
    .join('') + `<li class="neg">扣保险 −${fmtYuan(it.deduct)} 元</li>`
    + (it.halfApplied ? '<li>半价优惠已生效</li>' : '');

  if (res.warnings.length) {
    $('warnBox').innerHTML = res.warnings.map(esc).join('<br>');
    $('warnBox').hidden = false;
  }

  renderDetail($('detailBox'), res.trace);
}

form.init();
bindCopy($('detailBox'));

$('calcBtn').addEventListener('click', compute);
$('autoCalc').addEventListener('change', () => { if ($('autoCalc').checked) compute(); });

// 首次计算
compute();
