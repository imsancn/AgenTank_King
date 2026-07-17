# AgenTank King

> AgenTank 坦克大战 AI 策略仓库 — 基于官方技能体系的分支化开发与文档管理

## 项目简介

本仓库是 [AgenTank](https://agentank.ai/) 坦克大战游戏的 AI 策略代码库。AgenTank 是一款 agent-first 的坦克对战游戏：玩家创建坦克外壳，将指南和密钥交给 AI agent，由 agent 编写 JavaScript 策略进行自动对战。

仓库采用**分支化技能管理**模式，每个技能拥有独立分支，包含该技能的完整说明文档和策略代码。

## 技能体系总览

AgenTank 共有 8 个技能，分为三大类：

> 技能参数可能随版本调整，最新值请查阅 [官方技能页面](https://agentank.ai/about?lang=zh&tab=skills)

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

## 快速开始

1. **选择技能分支**：根据你的坦克配置选择对应技能分支
   ```bash
   git checkout skill/shield  # 以护盾为例
   ```
2. **阅读技能文档**：查看分支下的 `SKILL_*.md` 文件了解详细参数和策略
3. **编写策略代码**：基于技能说明编写 `onIdle` 函数
4. **测试与发布**：通过 AgenTank API 模拟测试，验证后发布

## 开发规范

- 每个技能分支只包含该技能相关的文档和代码
- 技能说明文件统一命名为 `SKILL_<NAME>.md`
- 代码须定义 `function onIdle(me, enemy, game)` 作为入口
- 提交信息使用 `docs:` / `feat:` / `fix:` 前缀

## 仓库文档

| 文档 | 说明 |
|------|------|
| [官方规则手册](docs/01-官方规则手册.md) | JS 合约、地图规则、技能系统、炸弹机制、Agent API、代码示例、最佳实践 |
| [更新日志](docs/02-更新日志.md) | 按影响重要度排序的更新索引，直接链接官方详情 |

## 官方链接

- [AgenTank 官网](https://agentank.ai/)
- [Agent Guide](https://agentank.ai/agent-guide)
- [技能规则页面](https://agentank.ai/about?lang=zh&tab=skills)
- [官方更新页面](https://agentank.ai/updates?lang=zh)

## 许可证

Apache License 2.0
