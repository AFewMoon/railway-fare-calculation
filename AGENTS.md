# AGENTS.md

给在本仓库里干活的智能体看的操作说明。面向人的介绍看 [README.md](./README.md)。

## 项目速览

纯静态站点，无构建、无依赖、无框架。原生 HTML + 原生 ES Modules + 单一 `css/style.css`（文件顶部 `@import` 了 Tailwind CDN 与 Noto Sans SC）。

```
index.html      计算器主页
guide.html      操作说明页（逐个控件讲用法）
tests/test.html 浏览器案例回归页
css/style.css   唯一样式表
js/main.js      入口：收集参数 → 引擎 → 渲染
js/ui/          form.js（表单与预设）、detail.js（明细渲染）
js/engine/      util.js / mileage.js / standard.js / nonstandard.js / special.js / discount.js / index.js
tests/          cases.js（案例基准）、node-check.mjs（Node 回归脚本）
```

页面之间的导航全部走相对链接（`index.html`、`guide.html`、`tests/test.html`、`css/style.css`），改路径时注意本地 `http.server` 与 GitHub Pages 两种访问方式都要能用。

## 常用命令

```powershell
npm test                                    # node tests/node-check.mjs，标准案例严格比对
python -m http.server 8123                  # 本地预览（ES Modules 必须走 HTTP）
```

`npm test` 的期望结果是 `通过 10 / 失败 0 / 参考偏差 8`。参考偏差项来自历史票价表的查表基准，属已知现象，不要试图把它们「修」成严格相等。

## 推送远端

远端是 `origin` = `https://github.com/AFewMoon/railway-fare-calculation.git`，工作分支 `main`。

**流程：先直连，连不上再走 127.0.0.1:7890，两种方式都不许留下状态。**

1. 直连推送：

```powershell
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 push origin main
```

低速阈值的两个参数只在连接建立之后、传输中途卡死时才管用。TCP 阶段就连不上时它救不了场，一样会等满约 21 秒，再报 `Failed to connect to github.com:443 after ... ms`。

GitHub 的 443 端口在本机时通时不通。**同一台机器上直连失败一次、紧接着重试就通**的情况出现过，所以失败后值得再试一遍；两次都不行就别耗着，走代理。

2. 直连确实不通时，用一次性代理。必须用 `-c` 做命令级覆盖，**不要动 `git config`**（不写本地、不写全局）：

```powershell
git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push origin main
```

这条走过，7890 上是通的，能正常推上去。代理只用在这一条命令里，命令结束就没了，不会有任何文件被改写。

3. 推送后核验状态已清干净：

```powershell
git config --show-origin --get-regexp proxy      # 期望：无任何输出
[Environment]::GetEnvironmentVariable('HTTPS_PROXY')   # 期望：空
git --no-pager status -sb                        # 期望：## main...origin/main，无 ahead
git --no-pager log --oneline -1 origin/main      # 期望：就是刚推的那个 commit
```

只读地检查 `git config` 是允许的，改它不行。若确实需要临时设 `HTTPS_PROXY` / `ALL_PROXY` 环境变量，必须在**同一条命令内**用完就清（`Remove-Item Env:HTTPS_PROXY`），不要跨命令留在 shell 里。

## 本机环境踩过的坑

- **判断 push 成败看结果行，不看红字**。PowerShell 会把 git 写在 stderr 的进度输出（`To https://...`）当成 `NativeCommandError` 报出来，但退出码其实是 0。真正的成功标志是出现 `f23b72e..0fcb9a4  main -> main` 这一行。
- **PowerShell 会把双引号吃掉**。向 `node -e` 直接传带引号的脚本会被剥成裸字符串并报语法错。用 `--%` 停止后续解析：
  ```powershell
  node --% --input-type=module -e "import {calculate} from './js/engine/index.js'; console.log(1)"
  ```
- **不要用 `Get-Content` 读文件**（会被安全策略拦下）。读文件用 read_file 工具，或让 Node 来读。
- **布局核验用无头 Edge 截图**，路径在本机是 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，配 `--headless=new --screenshot=<路径> --window-size=W,H --virtual-time-budget=4000`。带 `#fragment` 的 URL 会截出一张空白图，需要看页面深处的内容时，改用锚点外的办法（例如把窗口调高）。
- **临时文件要删干净**。截图之类的东西放工作区之后必须删除，用的本地服务器也要停掉（`netstat -ano | Select-String ':8123\s'` 找 PID，再 `Stop-Process`）。
- `.codebuddy/` 目录是项目数据，不是缓存，**不要删**。

## 代码约定

- **引擎是纯函数**：`calculate(params)` 只依赖入参，返回 `{ ok, total, items, trace, warnings }`，不碰 DOM、不读全局。要展示中间过程就往 `trace` 里记一步（`trace.add(group, label, expr, value, kind, note, unit)`），界面负责渲染。
- **字段名与界面文案解耦**。内部字段名（如 `prorate`）不必跟着界面改；改展示文字时只动 `form.js` 的模板、`guide.html` 的说明与文档措辞，别顺手改字段名，否则会波及 `PRESETS`、`collect()`、引擎与 `cases.js`。
- 改 `js/ui/form.js` 里区段行的结构时，注意 `refreshRow()` 靠 `row.querySelector('[data-f="prorate"]').closest('.chk-mini')` 定位显隐容器，`data-f` 属性、`.chk-mini` 类名与 `label` 的包裹层级都不能动。
- 区段行的网格是固定列宽（`.seg-row` 的 `grid-template-columns`）。想往窄列里塞更长的文字，先把中文按 1em/字 估算宽度，别指望它会自己换行，`.chk-mini` 上有 `white-space: nowrap`。

## 改动之后的连带检查

- 动了引擎或案例：跑 `npm test`，确认仍是 10 / 0 / 8。
- 动了界面控件（名称、显隐、行为）：同步 `guide.html` 里对应的字段说明、方案一览标记、外观示意与常见疑问。那里是静态抄写的界面现状，不跟着改就会和实际界面对不上。
- 动了页面结构或新增页面：跑一次标签配平与锚点自检（数 `<tag` 与 `</tag>`，再确认 `href="#x"` 都有对应的 `id`）。
- 动了大段中文说明：按 humanizer-zh 的路子过一遍，去掉破折号衔接、「属于……的手段/表现」这类套话与模板化排比，但不要改动任何技术事实。
