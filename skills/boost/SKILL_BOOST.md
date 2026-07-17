# 技能：Boost（加速）

## 基本信息

| 属性 | 值 |
|------|-----|
| 技能名称 | boost |
| 调用方式 | `me.boost()` |
| 持续时间 | 6 帧 |
| 冷却时间 | 31 帧 |
| 消耗 | 无额外消耗，仅需冷却完毕 |

## 技能效果

激活后在 6 帧内，每次执行的 `me.go()` 命令可移动最多 2 格，而非默认的 1 格。如果第二格有障碍物（墙壁或敌方坦克），则提前停止。

## 使用条件

使用前必须检查以下条件：

1. `me.skill` 存在且 `me.skill.type === "boost"`
2. `me.skill.remainingCooldownFrames === 0`（冷却已结束）
3. 建议在需要快速移动（拾星、逃跑、追击）时激活

## 代码示例

```javascript
function onIdle(me, enemy, game) {
  // 检查 boost 是否可用
  if (me.skill &&
      me.skill.type === "boost" &&
      me.skill.remainingCooldownFrames === 0) {

    // 有星星时激活 boost 快速拾取
    if (game.star) {
      me.boost();
      me.go(2); // boost 期间每次 go 可移动 2 格
      return;
    }

    // 被追击时激活 boost 逃跑
    if (enemy.tank) {
      var dist = Math.abs(me.tank.position[0] - enemy.tank.position[0]) +
                 Math.abs(me.tank.position[1] - enemy.tank.position[1]);
      if (dist < 3) {
        me.boost();
        me.go(2); // 快速拉开距离
        return;
      }
    }
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

- **快速拾星**：星星出现时激活 boost，比敌方更快到达星星位置
- **紧急脱战**：被敌方追击时激活 boost，迅速拉开距离脱离危险
- **追击敌方**：敌方逃跑时激活 boost 追击，保持火力压制
- **战略转移**：需要从地图一侧快速转移到另一侧时使用
- **配合 cloak**：boost + cloak 组合可实现高速隐身移动
- **配合 go(2)**：boost 期间 `me.go(2)` 可排队 2 次移动，每次移动 2 格，单帧最多移动 4 格

## 注意事项

- boost 只影响 `me.go()` 的移动距离，不影响 `me.turn()` 和 `me.fire()`
- 如果前方有墙壁，第二格移动会被阻挡，只移动 1 格
- 6 帧持续时间内可多次执行 `go()`，每次都能享受加速效果
- 31 帧冷却中等偏长，需在关键时刻使用
- boost 期间移动速度快，但也更容易撞入敌方火力范围，需注意路径安全
- boost 不影响 `me.go(2)` 的排队机制，`go(2)` 仍排队两个 go 命令，但每个 go 可移动 2 格
- 在复杂地形中使用 boost 需谨慎，高速移动可能导致撞墙浪费加速帧
