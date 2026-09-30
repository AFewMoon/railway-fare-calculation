/**
 * 铁路票价计算引擎 - 基础工具
 * 舍入规则、常量、明细记录器
 */

/** 四舍五入（half up），digits 为保留小数位 */
export function roundHalfUp(x, digits = 0) {
  const f = Math.pow(10, digits);
  return Math.floor(x * f + 0.5 + 1e-9) / f;
}

/** 保留 5 位小数四舍五入（文档中加快/卧铺/空调费率先按 5 位舍入） */
export function round5(x) {
  return roundHalfUp(x, 5);
}

/** 向上取整到 step 的整数倍（如保险费按 0.1 元向上取整） */
export function ceilTo(x, step) {
  return Math.ceil(x / step - 1e-9) * step;
}

/** 向下取整到 step 的整数倍 */
export function floorTo(x, step) {
  return Math.floor(x / step + 1e-9) * step;
}

/** 金额显示：最多 1 位小数，去除多余 0 */
export function fmtYuan(x) {
  if (!isFinite(x)) return '—';
  const r = Math.round(x * 10) / 10;
  return (Number.isInteger(r) ? r.toString() : r.toFixed(1));
}

/**
 * 分项基价表（元/km）
 * 依据：标准票价文档《铁路标准票价计算方法》
 */
export const RATES = {
  baseSeat: 0.05861,          // 硬座客票基价率
  softSeatMult: 2,            // 软座 = 硬座 ×2
  speedBase: 0.01172,         // 普快加快（= round5(0.05861×0.2)）
  acBase: 0.01465,            // 空调票（= round5(0.05861×0.25)）
  berths: {
    yw_shang: 0.06447,        // 硬卧上
    yw_zhong: 0.07033,        // 硬卧中
    yw_xia: 0.07619,          // 硬卧下
    rw_shang: 0.10257,        // 软卧上
    rw_xia: 0.11429,          // 软卧下
    gr_shang: 0.12308,        // 高软上
    gr_xia: 0.13480,          // 高软下
  },
  // 硬包（包房）= 硬卧中/下 加成 30%
  baoMult: { yb_shang: ['yw_zhong', 1.3], yb_xia: ['yw_xia', 1.3] },
};

/**
 * 席别定义（供引擎与界面共用）
 * soft: 是否软席（软席不收候车室空调费；学生票仅硬席）
 * mult: 客票席别倍率（相对硬座基价率）
 */
export const SEATS = {
  yz:        { name: '硬座',     mult: 1,    soft: false, berth: false },
  rz:        { name: '软座',     mult: 2,    soft: true,  berth: false },
  yw_shang:  { name: '硬卧（上铺）', mult: 1, soft: false, berth: true,  berthKey: 'yw_shang' },
  yw_zhong:  { name: '硬卧（中铺）', mult: 1, soft: false, berth: true,  berthKey: 'yw_zhong' },
  yw_xia:    { name: '硬卧（下铺）', mult: 1, soft: false, berth: true,  berthKey: 'yw_xia' },
  yb_shang:  { name: '硬包（上铺）', mult: 1, soft: false, berth: true,  berthKey: 'yb_shang' },
  yb_xia:    { name: '硬包（下铺）', mult: 1, soft: false, berth: true,  berthKey: 'yb_xia' },
  rw_shang:  { name: '软卧（上铺）', mult: 2, soft: true,  berth: true,  berthKey: 'rw_shang' },
  rw_xia:    { name: '软卧（下铺）', mult: 2, soft: true,  berth: true,  berthKey: 'rw_xia' },
  gr_shang:  { name: '高软（上铺）', mult: 2, soft: true,  berth: true,  berthKey: 'gr_shang' },
  gr_xia:    { name: '高软（下铺）', mult: 2, soft: true,  berth: true,  berthKey: 'gr_xia' },
};

/** 车次等级定义 */
export const LEVELS = {
  putong: { name: '普客（无加快）', speedX: 0 },
  pukuai: { name: '普快', speedX: 1 },
  kuaisu: { name: '快速', speedX: 2 },
  tekuai: { name: '特快', speedX: 2 },
};

/** 票种定义 */
export const TICKETS = {
  full:    { name: '全价票', half: false },
  student: { name: '学生票（硬席）', half: true },
  child:   { name: '儿童票', half: true },
  veteran: { name: '伤残军人票', half: true },
};

/**
 * 明细记录器：逐步记录每一条计算式、中间值与舍入节点
 */
export function createTrace() {
  const steps = [];
  return {
    steps,
    add(group, label, expr, value, kind = 'calc', note = '', unit = '元') {
      steps.push({ group, label, expr, value, kind, note, unit });
      return value;
    },
  };
}

/** 运价模式定义（分段编辑器用） */
export const SEG_MODES = {
  standard: { name: '国铁标准运价' },
  km900:    { name: '900km 运价（差价+上浮）' },
  times:    { name: '国铁价乘数上浮（如平南×3、广深双浮）' },
  dacheng:  { name: '达成线单位里程票价' },
  qz:       { name: '青藏线席别加价（与国铁合并里程）' },
};

/** 青藏线加价率（元/km），按席别自动匹配 */
export const QZ_ADD = {
  yz: 0.00, rz: 0.09,
  yw_shang: 0.10, yw_zhong: 0.10, yw_xia: 0.10,
  yb_shang: 0.10, yb_xia: 0.10,
  rw_shang: 0.16, rw_xia: 0.16, gr_shang: 0.16, gr_xia: 0.16,
};

/** 达成线单位里程票价（元/(人·km)） */
export const DACHENG = {
  seat:    { normal: 0.10, ac: 0.125, softNormal: 0.20, softAc: 0.25 },
  berth: {
    yw_shang: { normal: 0.12, ac: 0.17 }, yw_zhong: { normal: 0.13, ac: 0.18 }, yw_xia: { normal: 0.14, ac: 0.19 },
    yb_shang: { normal: 0.13, ac: 0.18 }, yb_xia:   { normal: 0.14, ac: 0.19 },
    rw_shang: { normal: 0.15, ac: 0.24 }, rw_xia:   { normal: 0.17, ac: 0.25 },
    gr_shang: { normal: 0.17, ac: 0.25 }, gr_xia:   { normal: 0.17, ac: 0.25 },
  },
  speedNormal: 0.02,  // 普快加快
  acTicket: 0.02,     // 空调票（100km 起步）
  berthStart: 100,    // 卧铺/空调起步里程
};
