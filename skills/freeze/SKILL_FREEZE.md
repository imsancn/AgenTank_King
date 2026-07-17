# 技能：Freeze（冻结）

## 基本信息

| 属性 | 值 |
|------|-----|
| 技能名称 | freeze |
| 调用方式 | `me.freeze()` |
| 持续时间 | 2 帧 |
| 冷却时间 | 34 帧 |
| 消耗 | 无额外消耗，仅需冷却完毕 |

## 技能效果

激活后冻结敌方坦克，使其在 2 帧内完全无法行动。敌方已排队但尚未执行的命令会在冻结结束后继续执行。

## 使用条件

使用前必须检查以下条件：

1. `me.skill` 存在且 `me.skill.type === "freeze"`
2. `me.skill.remainingCooldownFrames === 0`（冷却已结束）
3. 需要敌方坦克存在于视野内（`enemy.tank` 不为 null）

## 代码示例

```javascript
function onIdle(me, enemy, game) {
  // 敌方在视野内且 freeze 可用时施放
  if (me.skill &&
      me.skill.type === "freeze" &&
      me.skill.remainingCooldownFrames === 0 &&
      enemy.tank) {
    me.freeze();
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

- **打断节奏**：在敌方正在连续移动或转向时施放，打乱其行动节奏
- **争取射击窗口**：冻结后敌方 2 帧无法动，可利用这段时间瞄准射击
- **星点争夺**：当敌方靠近星星时冻结，抢先拾取
- **逃生手段**：被追击时冻结敌方，争取逃脱时间
- **配合射击**：freeze 后预判敌方位置射击，因为冻结后敌方位置固定

## 注意事项

- 冻结只持续 2 帧，时间很短，需精确把握时机
- 冷却时间 34 帧较长，不能频繁使用
- 冻结不会取消敌方已排队的命令，只是延迟执行
- 如果敌方处于隐身（cloak）状态，需先确认其位置才能有效施放
- freeze 是控制类技能，不直接造成伤害，需配合其他行动才能产生击杀
