// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AFewMoon

/**
 * 窄屏把多列表格降级为纵向卡片后，用 data-label 补回列名，供 td::before 读取。
 * 幂等：已带 data-label 的单元格不被覆盖；明细表（自身是网格排版）与无表头的表跳过。
 */
export function applyTableLabels(root = document) {
  for (const table of root.querySelectorAll('table.dtable')) {
    if (table.classList.contains('detail-table')) continue;
    const labels = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
    if (!labels.length) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      [...row.children].forEach((td, i) => {
        if (labels[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', labels[i]);
      });
    }
  }
}
