# 技能：Overload（过载射击）

## 基本信息

| 属性 | 值 |
|------|-----|
| 技能名称 | overload |
| 调用方式 | `me.overload()` |
| 持续时间 | 必须在 10 帧内完成射击 |
| 冷却时间 | 32 帧 |
| 消耗 | 无额外消耗，仅需冷却完毕 |

## 技能效果

激活后为下一次成功射击装填双发子弹。激活后必须在 10 帧内完成射击，否则过载效果消失。射击成功时同时发射两发子弹，大幅提升火力覆盖和命中概率。

## 使用条件

使用前必须检查以下条件：

1. `me.skill` 存在且 `me.skill.type === "overload"`
2. `me.skill.remainingCooldownFrames === 0`（冷却已结束）
3. 当前没有活跃的子弹在飞行（因为 `me.fire()` 仅在没有活跃子弹时才生效）
4. 建议在已瞄准敌方或即将瞄准时激活

## 代码示例

```javascript
function onIdle(me, enemy, game) {
  // 检查是否已瞄准敌方且 overload 可用
  if (me.skill &&
      me.skill.type === "overload" &&
      me.skill.remainingCooldownFrames === 0 &&
      enemy.tank) {

    // 检查是否同列或同行（已瞄准）
    var aligned = me.tank.position[0] === enemy.tank.position[0] ||
                  me.tank.position[1] === enemy.tank.position[1];

    if (aligned) {
      me.overload();
      me.fire(); // 过载后立即射击，发射双发子弹
      return;
    }
  }

  // 正常战斗逻辑
  if (enemy.tank) {
    me.fire();
  } else {
    me.turn("right");
  }
}
```

## 使用策略

- **瞄准后激活**：最佳策略是先转向瞄准敌方，确认对齐后再激活 overload 并射击
- **火力压制**：双发子弹可覆盖更大区域，增加命中概率
- **破盾利器**：shield 最多挡 2 发子弹，overload 的双发恰好可破盾
- **时间窗口**：10 帧内必须射击，需提前做好瞄准准备
- **冷却管理**：32 帧冷却较长，应在关键时刻使用

## 注意事项

- overload 只武装下一发子弹，如果射击失败（如已有活跃子弹），过载效果保留但不消耗
- 必须在 10 帧内射击，超时后过载效果消失并进入冷却
- 双发子弹从同一位置发射，方向相同，不会分散
- 如果被 freeze 或 stun 打断无法在 10 帧内射击，过载会被浪费
- overload 是唯一的进攻型技能，适合激进打法
- 激活 overload 后应立即排射击命令，避免浪费宝贵的 10 帧窗口
