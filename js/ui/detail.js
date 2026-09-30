/**
 * 计算过程明细渲染：按步骤分组展示推导式与舍入节点
 */

const KIND_NAMES = { calc: '计算', round: '舍入', fee: '杂费', total: '合计' };

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtVal(v) {
  if (v == null) return '';
  const r = Math.round(v * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(Math.round(r * 100) / 100);
}

/** 值 + 单位（如 "1225 km"、"1.3 元"），value 为空时返回空串 */
function fmtValUnit(s) {
  if (s.value == null) return '';
  return `${fmtVal(s.value)}${s.unit ? ' ' + s.unit : ''}`;
}

export function renderDetail(box, trace) {
  if (!trace || !trace.steps.length) {
    box.innerHTML = '<p class="muted">填写参数后此处展示逐步推导过程。</p>';
    return;
  }
  // 按组聚合
  const groups = [];
  let cur = null;
  for (const s of trace.steps) {
    if (!cur || cur.name !== s.group) {
      cur = { name: s.group, steps: [] };
      groups.push(cur);
    }
    cur.steps.push(s);
  }

  box.innerHTML = groups.map(g => `
    <div class="dgroup">
      <h3>${esc(g.name)}</h3>
      <table class="dtable">
        <thead><tr><th style="width:180px">项目</th><th>计算式 / 说明</th><th style="width:110px;text-align:right">结果</th></tr></thead>
        <tbody>
          ${g.steps.map(s => `
            <tr>
              <td><span class="dot ${s.kind}" title="${KIND_NAMES[s.kind] || s.kind}"></span>${esc(s.label)}</td>
              <td class="expr">${esc(s.expr)}${s.note ? ` <span class="muted">（${esc(s.note)}）</span>` : ''}
                <button class="copy-btn" data-copy="${esc(s.label + '：' + s.expr + (s.value != null ? ' = ' + fmtValUnit(s) : ''))}">复制</button></td>
              <td class="num">${fmtValUnit(s)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

export function bindCopy(box) {
  box.addEventListener('click', e => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    navigator.clipboard && navigator.clipboard.writeText(btn.dataset.copy).then(() => {
      const old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = old; }, 1200);
    });
  });
}
