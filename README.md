# dsh-gemini-quota-widget

把 [gemini-quota-widget](https://github.com/smiththomson580-star/gemini-quota-widget) 移植并扩展为 **DeepSeek Harness（DSH）Web / 桌面端插件**：在页面右下角放置可互动猫娘挂件，支持 **DSH 账户余额与轮次花费**、**Gemini 5 小时 / 每周剩余额度实时同步**、**自定义立绘裁剪管理**、**完成提示音效** 与 **趣味陪伴互动**。

## 主要功能

- **气泡双视图切换**（设置菜单 →「额度」→「气泡显示设置」）
  - **DSH 余额**：优先读取 DSH 当前登录账号余额，未登录时回退 `DEEPSEEK_API_KEY`（密钥仅由 DSH 凭据服务解析，不经过插件）；支持「对话完显示 DSH 余额花费」轮次结束弹窗。
  - **Gemini 额度**：展示 5 小时与每周剩余百分比及重置倒计时；支持「对话完显示 Gemini 5h 剩余」轮次结束弹窗。
- **多种 Gemini 额度数据源**（设置菜单 →「额度」→「Gemini 官方剩余额度」）
  - **agy 查询**（默认）：直接同步本地 `agy-link` 当前活跃账号的 5 小时与每周剩余额度。
  - **其他查询方式**：内置独立 **RT 登录**（粘贴 Refresh Token）与 **OAuth 登录**，支持单独刷新或「设为主数据源」，互不覆盖。
- **数据与预警**
  - 支持分别设置 Gemini 5h 预警（%）、Gemini 周预警（%）与 DSH 余额预警（元），低于阈值时亮角标并可触发主动提醒。
- **外观与自定义立绘**（设置菜单 →「外观」）
  - 挂件大小、立绘不透明度、主题配色（星糖丁香 / 奶油蜜桃 / 夜猫蓝紫）、位置锁定、悬停轻透、轻量省电模式、老板键 `Alt + H`。
  - **本地自定义立绘**：支持导入 WebP / PNG / JPG（单张最大 **10 MB**），内置 **1:1 比例交互裁剪器**（拖拽平移、滚轮/滑块缩放），导入后自动存入下拉菜单，支持切换、改名、重新裁剪与删除。
- **声音与提示**（设置菜单 →「声音」）
  - **按压音效**与音色选择（星光铃音 / 小黄鸭 / Q弹气泡）。
  - **互动 / 计时 / DSH 完成提示**：支持 `经验球叮咚`、`清脆铃音 A`、`和弦音`、`静音仅冒泡`，统一由「提示音量」与「气泡停留（秒）」控制。
- **互动与陪伴工具**（设置菜单 →「互动」「台词」「工具」）
  - 5 阶段羁绊好感度、摸摸头 / 小鱼干投喂 / 逗猫棒抓星星 / 打盹、满好感舞蹈、快捷互动栏、自定义台词本、猫猫番茄钟，以及陪伴偏好导入/导出。

## 目录结构

- `lib/index.js`：DSH 宿主插件路由（余额、额度聚合、`agy-link` 同步与独立 RT / OAuth 查询）
- `build/build-widget.mjs`、`build/dsh-bridge.js`：前端挂件构建脚本与 DSH 桥接层
- `assets/gemini-widget.js`：构建后的前端挂件产物
- `cordis.patch.yml`、`package.json`：DSH 插件清单与注入配置

## 安装与构建

在 DSH 中安装本插件目录，刷新页面（`Ctrl + R`）即可生效。

如需从上游源码重新构建前端产物：

```bash
node build/build-widget.mjs <上游 gemini-quota-widget-main 路径>
```

## 许可

MIT。上游 `gemini-quota-widget` © smiththomson580-star and contributors；交互设计参考 MeteorNOX/DeepSeek-Balance-Whale-Widget。构建产物保留第三方依赖许可声明。
