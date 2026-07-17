# 技能：Cloak（隐身）

## 基本信息

| 属性 | 值 |
|------|-----|
| 技能名称 | cloak |
| 调用方式 | `me.cloak()` |
| 持续时间 | 6 帧 |
| 冷却时间 | 35 帧 |
| 消耗 | 无额外消耗，仅需冷却完毕 |

## 技能效果

激活后使己方坦克对敌方脚本不可见，持续 6 帧。在隐身期间，敌方的 `enemy.tank` 将返回 `null`，敌方脚本无法获取你的位置、朝向等信息。

## 使用条件

使用前必须检查以下条件：

1. `me.skill` 存在且 `me.skill.type === "cloak"`
2. `me.skill.remainingCooldownFrames === 0`（冷却已结束）
3. 建议在需要隐蔽行动（拾星、重新定位、伏击）时激活

## 代码示例

```javascript
function onIdle(me, enemy, game) {
  // 需要拾取星星但敌方可能射击时隐身
  if (me.skill &&
      me.skill.type === "cloak" &&
      me.skill.remainingCooldownFrames === 0 &&
      game.star &&
      enemy.tank) {
    me.cloak();
    me.go(2); // 隐身后快速移动拾星
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

- **隐蔽拾星**：在敌方火力覆盖范围内拾取星星时激活，使敌方无法瞄准你
- **重新定位**：被追击或位置不利时隐身移动到更有利的位置
- **伏击准备**：隐身接近敌方，在隐身结束的瞬间开火，打敌方一个措手不及
- **躲避瞄准**：当敌方正在瞄准你时激活，使其失去目标
- **配合 boost**：cloak + boost 组合可实现高速隐身移动，快速穿越战场

## 注意事项

- 隐身只让 `enemy.tank` 返回 null，但敌方子弹仍在飞行，不会因为隐身而消失
- 敌方的 `enemy.bullet` 检测不受影响，敌方仍能看到你的子弹
- 6 帧持续时间较短，35 帧冷却较长，需精确把握使用时机
- 隐身期间你仍可正常行动（移动、转向、射击），但射击会暴露位置
- 如果站在草地上，隐身结束后草地仍提供额外隐蔽
- cloak 与 stun/freeze 的配合：先隐身接近再控制，可实现完美伏击
