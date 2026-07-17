# 技能：Poison（毒素）

## 基本信息

| 属性 | 值 |
|------|-----|
| 技能名称 | poison |
| 调用方式 | `me.poison()` |
| 持续时间 | 4 帧 |
| 冷却时间 | 25 帧 |
| 消耗 | 无额外消耗，仅需冷却完毕 |

## 技能效果

激活后减缓敌方坦克的行动节奏，持续 4 帧。受影响的敌方坦克其 `actionSpeed` 降低，每帧可执行的命令数量减少，整体反应速度变慢。

## 使用条件

使用前必须检查以下条件：

1. `me.skill` 存在且 `me.skill.type === "poison"`
2. `me.skill.remainingCooldownFrames === 0`（冷却已结束）
3. 建议在敌方需要快速行动（拾星、追击、逃跑）时施放

## 代码示例

```javascript
function onIdle(me, enemy, game) {
  // 敌方在视野内且 poison 可用时施放
  if (me.skill &&
      me.skill.type === "poison" &&
      me.skill.remainingCooldownFrames === 0 &&
      enemy.tank) {
    me.poison();
    return;
  }

  // 正常战斗逻辑
  if (enemy.tank) {
    me.fire();
  } else if (game.star) {
    me.go();
  }
}
```

## 使用策略

- **减速压制**：在敌方追击你时施放，使其追击效率大幅下降
- **抢星优势**：双方同时冲向星星时施放 poison，减速的敌方会慢一步
- **持续施压**：25 帧冷却 + 4 帧持续，覆盖率较高，可频繁施压
- **配合射击**：poison 减速后敌方更难躲避子弹，提高射击命中率
- **节奏打乱**：在敌方进行复杂操作链时施放，打乱其操作节奏

## 注意事项

- poison 不会完全停止敌方行动，只是减缓节奏，敌方仍可行动
- 与 freeze 的区别：freeze 完全停止 2 帧，poison 减速 4 帧
- 与 stun 的区别：stun 随机化操控方向，poison 降低行动频率
- poison 适合消耗战，通过持续减速逐步积累优势
- 25 帧冷却较短，是所有控制技能中冷却最短的之一
- poison 对已经排队的命令不产生直接影响，只影响后续命令的执行速度
