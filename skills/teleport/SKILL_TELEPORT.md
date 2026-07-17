# 技能：Teleport（瞬移）

## 基本信息

| 属性 | 值 |
|------|-----|
| 技能名称 | teleport |
| 调用方式 | `me.teleport(x, y)` |
| 持续时间 | 瞬时 |
| 冷却时间 | 40 帧 |
| 消耗 | 无额外消耗，仅需冷却完毕 |

## 技能效果

激活后瞬间将坦克移动到指定的有效空地坐标 `(x, y)`。瞬移是唯一需要传参的技能，目标坐标必须是地图上的空地（`.`）。

### 特殊机制

- **无效目标**：如果目标坐标是墙壁（`x`）或被占用，瞬移失败但仍消耗冷却
- **落点暴露**：成功的瞬移会短暂暴露落点位置给敌方脚本，即使落在草地上也会被看到
- **近距离开火锁定**：如果落点距离敌方 4 格以内，己方接下来 2 帧无法开火；距离超过 4 格则无此限制

## 使用条件

使用前必须检查以下条件：

1. `me.skill` 存在且 `me.skill.type === "teleport"`
2. `me.skill.remainingCooldownFrames === 0`（冷却已结束）
3. 目标坐标 `(x, y)` 必须是有效的空地

## 代码示例

```javascript
function onIdle(me, enemy, game) {
  // 检查 teleport 是否可用
  if (me.skill &&
      me.skill.type === "teleport" &&
      me.skill.remainingCooldownFrames === 0) {

    // 瞬移到远离敌方的安全位置
    if (enemy.tank) {
      var ex = enemy.tank.position[0];
      var ey = enemy.tank.position[1];
      // 选择距离敌方超过 4 格的位置，避免开火锁定
      var safeX = ex > 5 ? 1 : 8;
      var safeY = ey > 5 ? 1 : 8;
      me.teleport(safeX, safeY);
      return;
    }

    // 瞬移到星星位置
    if (game.star) {
      me.teleport(game.star[0], game.star[1]);
      return;
    }
  }

  // 正常战斗逻辑
  if (enemy.tank) {
    me.fire();
  } else {
    me.go();
  }
}
```

## 使用策略

- **远距脱战**：被追击时瞬移到远离敌方 4 格以上的位置，避免开火锁定惩罚
- **抢星神技**：星星出现时直接瞬移到星星位置，比移动快得多
- **战略转移**：从地图一侧瞬间转移到另一侧，出其不意
- **规避子弹**：预判敌方子弹轨迹后瞬移躲避
- **远离敌方**：落点距离敌方超过 4 格可避免 2 帧开火锁定，保持战斗力

## 注意事项

- teleport 是所有技能中冷却最长的（40 帧），使用需谨慎
- 目标坐标必须有效，无效目标会白白浪费 40 帧冷却
- 落地在敌方 4 格以内会被开火锁定 2 帧，这在战斗中非常致命
- 成功瞬移后即使落在草地上也会短暂暴露位置，无法完全隐蔽
- 瞬移到星星位置后需要确认是否真的拾取成功
- teleport 是唯一需要参数的技能，需正确传入 `[x, y]` 坐标
- 瞬移后应立即评估新位置的安全性和战术价值
