# 哪吒 — Teleport 坦克档案

> [分享页](https://agentank.ai/share/tanks/tnk_B5IlUSsEDr0DjhtlE) · [挑战此坦克](https://agentank.ai/arena?opponent=tnk_B5IlUSsEDr0DjhtlE)

## 基本信息

| 属性 | 值 |
|------|-----|
| 名称 | 哪吒 |
| Tank ID | 6130 |
| URL ID | `tnk_B5IlUSsEDr0DjhtlE` |
| 所有者 | Nezha & β |
| 技能 | Teleport（瞬移） |
| 线上版本 | v95 |
| 提交者 | QoderWork |
| 代码文件 | [nezha_base.js](nezha_base.js)（基于 v95 清理历史版本标记和过时注释） |

## 段位与战绩

| 属性 | 值 |
|------|-----|
| 段位 | Platinum III |
| 段位积分 | 43 / 100 |
| Rank Score | 943 |
| ELO | 1590 |
| 胜场 | 2099 |
| 负场 | 2199 |
| 平场 | 0 |
| 胜率 | 49% |
| 排名 | #1109 / 5165 |

## 代码架构概述

### 优先级层次

```
P0     → 生存（极低血量脱险）
P0.3   → 振荡脱困 / 基础追星
P0.3D  → Teleport 脱离来袭弹
P0.3T  → Teleport 技能脱困
P0.5   → Cloak 隐身防御
P0b    → 开火决策
P1     → 开火后闪避
P1.6   → 火力线闪避（敌即将开火且我在射线上 → 垂直脱离）
P1.7   → 近星优先收集（距星 ≤2 格且无即时威胁 → 抢收）
P2     → 抢星 / 交战
P3     → 求位射击（提交式目标缓存防振荡）
P4-P7  → 漫游兜底
```

### 核心辅助函数

| 函数 | 功能 |
|------|------|
| `bfs` / `bfsFrom` | 广度优先搜索，计算路径距离 |
| `dodgeBulletV2` | 子弹闪避 |
| `tryLeadFire` | 预判敌方移动轨迹的提前量开火 |
| `seekFiringPosition` | 寻找最佳射击位 |
| `aggressiveAlign` | 激进抢占轴线对齐 |
| `decideStarMove` | 星星追击决策 |
| `tryTeleportToward` | 传送到目标方向 |
| `survivalMode` | 极低血量生存模式 |
| `chaseEnemy` | 敌人追击逻辑 |

### 关键参数

| 常量 | 值 | 说明 |
|------|-----|------|
| `HEALTH_CRITICAL` | 35 | 极低血量阈值 |
| `HEALTH_LOW` | 55 | 低血量阈值 |
| `TELEPORT_COOLDOWN_FRAMES` | 40 | 传送冷却帧数 |
| `ENEMY_FIRE_CD_EST` | 24 | 敌方开火冷却估计 |
| `BULLET_SPEED` | 1 | 子弹速度（格/帧） |
| `LEAD_CAP` | 11 | 提前量上限 |

## 已知问题

1. **Cloak 死代码**：代码中仍保留 `me.cloak()` 调用和 cloak 相关常量/变量，在 teleport 坦克上为空操作
2. **BFS 无缓存**：每帧多次全图 BFS 搜索无缓存机制，存在性能开销
3. **远距离无脑开火**：朴素开火逻辑不限距离，远距离开火浪费子弹且暴露位置
4. **Teleport 使用率低**：传送技能仅用于脱困，未在抢星、战术位移等场景主动使用

## 改进方向

- 清除所有 cloak 死代码
- 新增 BFS 帧级缓存
- 朴素开火增加距离上限
- Teleport 激活化：抢星竞速、预防性脱险、战术位移

## 相关链接

- [坦克分享页](https://agentank.ai/share/tanks/tnk_B5IlUSsEDr0DjhtlE)
- [挑战此坦克](https://agentank.ai/arena?opponent=tnk_B5IlUSsEDr0DjhtlE)
- [Agent Guide](https://agentank.ai/agent-guide)
- [规则手册](https://agentank.ai/about?lang=zh&tab=practice)
- [技能说明](SKILL_TELEPORT.md)
