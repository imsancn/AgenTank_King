# AgenTank King

> AgenTank 坦克大战 AI 策略仓库 — 目录化技能管理

## 项目简介

本仓库是 [AgenTank](https://agentank.ai/) 坦克大战游戏的 AI 策略代码库。AgenTank 是一款 agent-first 的坦克对战游戏：玩家创建坦克外壳，将指南和密钥交给 AI agent，由 agent 编写 JavaScript 策略进行自动对战。

## 目录结构

```
AgenTank_King/
├── README.md                      # 本文件
├── LICENSE
├── docs/
│   ├── 01-官方规则手册.md          # JS 合约、地图规则、技能系统、炸弹机制、API、示例
│   └── 02-更新日志.md              # 按影响重要度排序的更新索引
└── skills/
    ├── shield/
    │   └── SKILL_SHIELD.md
    ├── freeze/
    │   └── SKILL_FREEZE.md
    ├── stun/
    │   └── SKILL_STUN.md
    ├── overload/
    │   └── SKILL_OVERLOAD.md
    ├── cloak/
    │   └── SKILL_CLOAK.md
    ├── poison/
    │   └── SKILL_POISON.md
    ├── teleport/
    │   ├── SKILL_TELEPORT.md
    │   ├── TANK_NEZHA.md           # [哪吒](https://agentank.ai/share/tanks/tnk_B5IlUSsEDr0DjhtlE) · Platinum II
    │   └── nezha_base.js           # 哪吒 v81 坦克 AI 代码
    └── boost/
        └── SKILL_BOOST.md
```

## 技能体系总览

> 技能参数可能随版本调整，最新值请查阅 [官方技能页面](https://agentank.ai/about?lang=zh&tab=skills)

| 技能 | 中称 | 目录 | 类型 | 效果 | 持续 | 冷却 | 已实现 |
|------|------|------|------|------|------|------|--------|
| Shield | 护盾 | `skills/shield/` | 防御 | 最多挡 2 发子弹 | 4 帧 | 25 帧 | — |
| Cloak | 隐身 | `skills/cloak/` | 防御 | 对敌方脚本不可见 | 6 帧 | 35 帧 | — |
| Freeze | 冻结 | `skills/freeze/` | 控制 | 完全冻结敌方 | 2 帧 | 34 帧 | — |
| Stun | 扰乱 | `skills/stun/` | 控制 | 扰乱敌方操控 | 6 帧 | 25 帧 | — |
| Poison | 毒素 | `skills/poison/` | 控制 | 减缓敌方行动节奏 | 4 帧 | 25 帧 | — |
| Overload | 过载 | `skills/overload/` | 进攻 | 下次射击发射双发子弹 | 10 帧内射击 | 32 帧 | — |
| Boost | 加速 | `skills/boost/` | 进攻 | 每步可移动 2 格 | 6 帧 | 31 帧 | — |
| Teleport | 瞬移 | `skills/teleport/` | 进攻 | 瞬间移动到指定坐标 | 瞬时 | 40 帧 | [哪吒](https://agentank.ai/share/tanks/tnk_B5IlUSsEDr0DjhtlE) · Platinum II |

## 快速开始

1. **阅读规则手册**：查看 [`docs/01-官方规则手册.md`](docs/01-官方规则手册.md)
2. **选择技能**：进入 `skills/` 下对应技能目录，阅读 `SKILL_*.md`
3. **编写策略代码**：基于技能说明编写 `onIdle` 函数
4. **测试与发布**：通过 AgenTank API 模拟测试，验证后发布

## 开发规范

- 技能说明文件统一命名为 `SKILL_<NAME>.md`，放在 `skills/<name>/` 目录下
- 坦克档案等补充文件放在对应技能目录中
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
