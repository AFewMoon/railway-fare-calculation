// SPDX-License-Identifier: MIT
// Copyright (c) 2026 AFewMoon

/**
 * 表单联动逻辑：下拉选项、运价区段编辑、快捷方案预设、参数收集
 */
import { SEATS, LEVELS, TICKETS, SEG_MODES } from '../engine/index.js';

/** 快捷方案预设 */
export const PRESETS = {
  standard: { label: '标准国铁', rows: () => [
    { name: '全程（国铁标准）', km: 1208, mode: 'standard' } ] },
  hejiu: { label: '非标准分段（合九线·例1）', rows: () => [
    { name: '区段一', km: 19, mode: 'standard', prorate: true },
    { name: '区段二', km: 137, mode: 'standard', prorate: true } ] },
  shichang: { label: '石长线（900km+1/2）', rows: () => [
    { name: '石门县北-捞刀河（非标准）', km: 184, mode: 'km900', u: 0.5 },
    { name: '国铁区段', km: 155, mode: 'standard' } ] },
  jingjiu: { label: '京九/广梅汕（例6）', rows: () => [
    { name: '深圳-常平（900km+1/2）', km: 57, mode: 'km900', u: 0.5 },
    { name: '常平-龙川（广梅汕 900km+7/20）', km: 213, mode: 'km900', u: 0.35 } ] },
  pingguang: { label: '京广坪广段（软席）', rows: () => [
    { name: '坪石-广州（900km+1/2，软席）', km: 308, mode: 'km900', u: 0.5 },
    { name: '长沙-坪石（国铁）', km: 399, mode: 'standard' } ] },
  ningrong: { label: '宁蓉线（900km+1/2）', rows: () => [
    { name: '宁蓉线非标准段', km: 100, mode: 'km900', u: 0.5 },
    { name: '国铁区段', km: 300, mode: 'standard' } ] },
  pingnan: { label: '平南线（例4）', rows: () => [
    { name: '深圳西-平湖（国铁×3，卧铺×1.5）', km: 35, mode: 'times', factor: '3', berthFactor: '1.5', prorate: true },
    { name: '平湖-广州（×1.5 再 ×1.3）', km: 127, mode: 'times', factor: '1.5,1.3', berthFactor: '1.5' } ] },
  hainan: { label: '海南（例8）', rows: () => [
    { name: '茂名-塘口（×1.5，卧铺×3）', km: 80, mode: 'times', factor: '1.5', berthFactor: '3', prorate: true },
    { name: '塘口-三亚（×1.5，卧铺×3）', km: 681, mode: 'times', factor: '1.5', berthFactor: '3', prorate: true },
    { name: '其余国铁里程', km: 2669, mode: 'standard' } ] },
  dacheng: { label: '达成线（例9）', rows: () => [
    { name: '达成线区段（单位里程票价）', km: 186, mode: 'dacheng' },
    { name: '其余国铁里程', km: 482, mode: 'standard' } ] },
  qingzang: { label: '青藏加价（例10）', rows: () => [
    { name: '国铁（含青藏段合并里程）', km: 1972, mode: 'standard' },
    { name: '青藏线席别加价（格尔木-拉萨）', km: 1142, mode: 'qz' } ] },
};

export class FormCtl {
  constructor(onChange) {
    this.onChange = onChange;
    this.$ = id => document.getElementById(id);
  }

  init() {
    // 下拉选项
    const seatSel = this.$('seatSel');
    seatSel.innerHTML = Object.entries(SEATS)
      .map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    seatSel.value = 'yz';

    const levelSel = this.$('levelSel');
    levelSel.innerHTML = Object.entries(LEVELS)
      .map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
    levelSel.value = 'kuaisu';

    const ticketSel = this.$('ticketSel');
    ticketSel.innerHTML = Object.entries(TICKETS)
      .map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');

    // 预设 chips
    const chips = this.$('presetChips');
    chips.innerHTML = Object.entries(PRESETS)
      .map(([k, p]) => `<button type="button" class="chip" data-preset="${k}">${p.label}</button>`).join('');
    chips.addEventListener('click', e => {
      const btn = e.target.closest('.chip');
      if (btn) this.applyPreset(btn.dataset.preset);
    });

    // 页头快捷标签
    document.querySelectorAll('#modeTabs .tab[data-preset]').forEach(t => {
      t.addEventListener('click', () => this.applyPreset(t.dataset.preset));
    });

    // 空调类型
    this.$('acRadios').addEventListener('change', () => {
      const v = document.querySelector('input[name="ac"]:checked').value;
      this.$('acRateField').hidden = v !== 'custom';
      this.changed();
    });

    this.$('addSeg').addEventListener('click', () => {
      this.addRow({ name: '', km: 100, mode: 'standard' });
      this.changed();
    });

    this.$('segRows').addEventListener('input', () => this.changed());
    this.$('segRows').addEventListener('change', e => {
      if (e.target.dataset.f === 'mode') this.refreshRow(e.target.closest('.seg-row'));
      this.changed();
    });
    this.$('segRows').addEventListener('click', e => {
      const del = e.target.closest('.del');
      if (del) { del.closest('.seg-row').remove(); this.changed(); }
    });

    ['seatSel', 'levelSel', 'ticketSel', 'sdSel', 'acRate'].forEach(id => {
      this.$(id).addEventListener('change', () => this.changed());
    });

    this.applyPreset('standard', true);
  }

  changed() { this.onChange && this.onChange(); }

  applyPreset(key, silent) {
    const p = PRESETS[key];
    if (!p) return;
    const box = this.$('segRows');
    box.innerHTML = '';
    p.rows().forEach(r => this.addRow(r));
    document.querySelectorAll('#presetChips .chip').forEach(c =>
      c.classList.toggle('on', c.dataset.preset === key));
    if (!silent) this.changed();
  }

  addRow(r) {
    const row = document.createElement('div');
    row.className = 'seg-row';
    row.innerHTML = `
      <input data-f="name" placeholder="区段名称（可选）" value="${r.name || ''}" />
      <input data-f="km" type="number" min="1" step="1" value="${r.km ?? 100}" />
      <select data-f="mode" class="wide">
        ${Object.entries(SEG_MODES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
      </select>
      <input data-f="extraA" placeholder="上浮率 0.5" />
      <input data-f="extraB" placeholder="卧铺系数" />
      <label class="chk-mini"><input type="checkbox" data-f="prorate" ${r.prorate ? 'checked' : ''} />折算</label>
      <button type="button" class="del" title="删除">✕</button>`;
    row.querySelector('[data-f="mode"]').value = r.mode || 'standard';
    if (r.u != null) row.querySelector('[data-f="extraA"]').value = r.u;
    if (r.factor != null) row.querySelector('[data-f="extraA"]').value = r.factor;
    if (r.berthFactor != null) row.querySelector('[data-f="extraB"]').value = r.berthFactor;
    this.$('segRows').appendChild(row);
    this.refreshRow(row);
  }

  /** 按模式显/隐动态字段 */
  refreshRow(row) {
    const mode = row.querySelector('[data-f="mode"]').value;
    const a = row.querySelector('[data-f="extraA"]');
    const b = row.querySelector('[data-f="extraB"]');
    const prorate = row.querySelector('[data-f="prorate"]').closest('.chk-mini');
    a.hidden = !(mode === 'km900' || mode === 'times');
    b.hidden = mode !== 'times';
    prorate.style.visibility = (mode === 'times' || mode === 'standard') ? 'visible' : 'hidden';
    a.placeholder = mode === 'km900' ? '上浮率 0.5' : '系数 1.5,1.3';
  }

  /** 收集参数 */
  collect() {
    const acVal = document.querySelector('input[name="ac"]:checked').value;
    const segments = [...document.querySelectorAll('.seg-row')].map(row => {
      const g = f => row.querySelector(`[data-f="${f}"]`);
      const mode = g('mode').value;
      const seg = {
        name: g('name').value.trim(),
        km: Number(g('km').value),
        mode,
        prorate: g('prorate').checked,
      };
      if (mode === 'km900') seg.u = Number(g('extraA').value);
      if (mode === 'times') {
        seg.factor = g('extraA').value || '1';
        seg.berthFactor = g('extraB').value || seg.factor;
      }
      return seg;
    });
    return {
      km: segments.reduce((s, x) => s + (x.km || 0), 0),
      seatKey: this.$('seatSel').value,
      level: this.$('levelSel').value,
      ac: acVal !== 'none',
      acRate: acVal === 'custom' ? Number(this.$('acRate').value) : 0.5,
      ticket: this.$('ticketSel').value,
      sleeperDiscount: this.$('sdSel').value,
      segments,
    };
  }
}
