# AgenTank King

> AgenTank 坦克大战 AI 策略仓库 — 基于官方技能体系的分支化开发与文档管理

## 项目简介

本仓库是 [AgenTank](https://agentank.ai/) 坦克大战游戏的 AI 策略代码库。AgenTank 是一款 agent-first 的坦克对战游戏：玩家创建坦克外壳，将指南和密钥交给 AI agent，由 agent 编写 JavaScript 策略进行自动对战。

仓库采用**分支化技能管理**模式，每个技能拥有独立分支，包含该技能的完整说明文档和策略代码。

## 技能体系总览

AgenTank 共有 8 个技能，分为三大类：

### 防御型

| 技能 | 分支 | 效果 | 持续 | 冷却 |
|------|------|------|------|------|
| Shield（护盾） | `skill/shield` | 生成护盾，最多挡 2 发子弹 | 4 帧 | 25 帧 |
| Cloak（隐身） | `skill/cloak` | 对敌方脚本不可见 | 6 帧 | 35 帧 |

### 控制型

| 技能 | 分支 | 效果 | 持续 | 冷却 |
|------|------|------|------|------|
| Freeze（冻结） | `skill/freeze` | 完全冻结敌方，无法行动 | 2 帧 | 34 帧 |
| Stun（扰乱） | `skill/stun` | 扰乱敌方操控，指令随机化 | 6 帧 | 25 帧 |
| Poison（毒素） | `skill/poison` | 减缓敌方行动节奏 | 4 帧 | 25 帧 |

### 进攻型

| 技能 | 分支 | 效果 | 持续 | 冷却 |
|------|------|------|------|------|
| Overload（过载） | `skill/overload` | 下次射击发射双发子弹 | 10 帧内射击 | 32 帧 |
| Boost（加速） | `skill/boost` | 每步可移动 2 格 | 6 帧 | 31 帧 |
| Teleport（瞬移） | `skill/teleport` | 瞬间移动到指定坐标 | 瞬时 | 40 帧 |

## 分支结构

```
main          ← 主分支，通用说明与分支引导
├── skill/shield     ← 护盾技能：SKILL_SHIELD.md
├── skill/freeze     ← 冻结技能：SKILL_FREEZE.md
├── skill/stun       ← 扰乱技能：SKILL_STUN.md
├── skill/overload   ← 过载射击技能：SKILL_OVERLOAD.md
├── skill/cloak      ← 隐身技能：SKILL_CLOAK.md
├── skill/poison     ← 毒素技能：SKILL_POISON.md
├── skill/teleport   ← 瞬移技能：SKILL_TELEPORT.md
└── skill/boost      ← 加速技能：SKILL_BOOST.md
```

## 各分支引导

### `skill/shield` — 护盾

防御型技能。激活后生成护盾，最多持续 4 帧，可阻挡 2 发子弹。适合在敌方火力压制下保命或安全拾星。25 帧冷却使其成为使用频率较高的防御手段。

- 文档：`SKILL_SHIELD.md`
- 核心价值：吸收关键子弹，保护坦克存活
- 推荐场景：敌方射击时、星点争夺、被 overload 双发瞄准

### `skill/freeze` — 冻结

控制型技能。完全冻结敌方 2 帧，使其无法执行任何动作。冷却 34 帧较长，需精确把握时机。适合打断敌方节奏、争取射击窗口。

- 文档：`SKILL_FREEZE.md`
- 核心价值：完全停止敌方行动，创造击杀窗口
- 推荐场景：敌方正在移动、争抢星星、需要固定敌方位置瞄准

### `skill/stun` — 扰乱

控制型技能。扰乱敌方操控 6 帧，使转向和移动指令被随机化。6 帧持续时间长但效果不确定，适合干扰敌方走位和瞄准。25 帧冷却较短。

- 文档：`SKILL_STUN.md`
- 核心价值：长时间扰乱操控，干扰精准走位
- 推荐场景：敌方复杂走位、正在瞄准、狭窄地形

### `skill/overload` — 过载射击

进攻型技能。激活后下次射击发射双发子弹，需在 10 帧内完成射击。32 帧冷却较长，是唯一的进攻型技能，也是破盾利器。

- 文档：`SKILL_OVERLOAD.md`
- 核心价值：双发子弹提升命中率和火力压制
- 推荐场景：已瞄准敌方、破除 shield 护盾、关键击杀

### `skill/cloak` — 隐身

防御型技能。激活后 6 帧内对敌方脚本不可见，敌方 `enemy.tank` 返回 null。35 帧冷却较长，适合隐蔽拾星、重新定位、伏击准备。

- 文档：`SKILL_CLOAK.md`
- 核心价值：完全隐蔽，干扰敌方决策
- 推荐场景：拾星隐蔽、逃脱追击、伏击接近

### `skill/poison` — 毒素

控制型技能。减缓敌方行动节奏 4 帧，降低其命令执行频率。25 帧冷却较短，适合消耗战和持续施压。

- 文档：`SKILL_POISON.md`
- 核心价值：持续减速压制，积累行动优势
- 推荐场景：消耗战、抢星减速、配合射击提高命中

### `skill/teleport` — 瞬移

进攻型技能。瞬间移动到指定坐标，是唯一需要传参的技能。40 帧冷却最长，但战略价值极高。注意落点距敌方 4 格内会触发 2 帧开火锁定。

- 文档：`SKILL_TELEPORT.md`
- 核心价值：瞬间转移，战略级位置变换
- 推荐场景：抢星、紧急脱战、战略转移、规避子弹

### `skill/boost` — 加速

进攻型技能。6 帧内每次 `go()` 移动 2 格。31 帧冷却中等，适合快速拾星、追击或逃脱。

- 文档：`SKILL_BOOST.md`
- 核心价值：双倍移速，快速占位
- 推荐场景：快速拾星、追击/逃脱、战略转移

## 快速开始

1. **选择技能分支**：根据你的坦克配置选择对应技能分支
   ```bash
   git checkout skill/shield  # 以护盾为例
   ```
2. **阅读技能文档**：查看分支下的 `SKILL_*.md` 文件了解详细参数和策略
3. **编写策略代码**：基于技能说明编写 `onIdle` 函数
4. **测试与发布**：通过 AgenTank API 模拟测试，验证后发布

## 技能选择速查

| 你需要... | 推荐技能 | 理由 |
|----------|---------|------|
| 保命防弹 | shield | 唯一能挡子弹的技能 |
| 完全冻住敌人 | freeze | 2 帧完全停止，最硬控制 |
| 干扰敌方走位 | stun | 6 帧长扰乱，冷却短 |
| 提升火力 | overload | 唯一双发子弹，破盾利器 |
| 隐蔽行动 | cloak | 6 帧隐身，干扰敌方决策 |
| 持续减速压制 | poison | 4 帧减速，冷却最短之一 |
| 瞬间转移 | teleport | 战略级位移，抢星脱战 |
| 加速移动 | boost | 双倍移速，快速占位 |

## 开发规范

- 每个技能分支只包含该技能相关的文档和代码
- 技能说明文件统一命名为 `SKILL_<NAME>.md`
- 代码须定义 `function onIdle(me, enemy, game)` 作为入口
- 提交信息使用 `docs:` / `feat:` / `fix:` 前缀

## 官方文档

本仓库 `docs/` 目录整理了 AgenTank 官方文档，按重要顺序排列：

| 文档 | 说明 |
|------|------|
| [官方规则手册](docs/01-官方规则手册.md) | 核心循环、地图规则、JS 合约、技能系统、炸弹机制、Agent API、代码示例、最佳实践、Gold V 认证 |
| [更新日志](docs/02-更新日志.md) | 2026-05-10 至 2026-06-27 全部 16 条更新，按时间和影响重要度双重排序 |

## 相关链接

- [AgenTank 官网](https://agentank.ai/)
- [Agent Guide](https://agentank.ai/agent-guide)
- [对战回放](https://agentank.ai/history)
- [技能规则页面](https://agentank.ai/about?lang=zh&tab=skills)
- [官方更新页面](https://agentank.ai/updates?lang=zh)

## 许可证

Apache License 2.0
