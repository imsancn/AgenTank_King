// ===== 全局配置 =====
var CLOAK_COOLDOWN_FRAMES = 35;
var HEALTH_CRITICAL = 35;          // 提前进入生存，避免一发入魂
var HEALTH_LOW = 55;               // 低血量阈值同步上调
var STAR_CHASE_DIST = 15;          // 路径感知中距追上限(BFS 步); 现由 decideStarMove 使用
var FRAME_TIMEOUT_WARNING = 480;
var ENEMY_FIRE_CD_EST = 24;        // 敌方开火冷却估计帧数，用于激进压上窗口
var POST_FIRE_DODGE_FRAMES = 2;    // 开火后这几帧优先闪避回击
// --- 捡星调参---
var STAR_OPP_DIST = 4;             // opportunistic 顺手捡半径(BFS 步): 极近星零风险高收益
var STAR_CHASE_BFS = 15;           // 方向安全中距追上限(BFS 步), 替代原曼哈顿 15
var STAR_RACE_DIST = 25;           // 超时冲刺抢星上限(BFS 步)
var STAR_LANE_PENALTY = 2;         // 星处于敌即时火力线内时, 安全判定需更近(额外扣减容忍)
var STAR_CLOAK_THREAT = 9;         // 抢争夺中的星且敌在此距离内→主动隐身安全收星
var CLOAK_HOLD_THREAT = 5;         // 隐身中: 星在敌火力线+敌≤此距离→不追星, 转向敌人预瞄(避免踏入贴脸秒杀区, 修 vs 捶壮壮)
// --- 传送抢星 / 草丛埋伏调参 ---
var AMBUSH_LEAD_MIN = 1;           // 埋伏: 仅当领先(starLead>=此值)且无战斗窗口时才进入草丛蹲守
var AMBUSH_GRASS_SCAN = 6;         // 埋伏: 搜索半径内最近草丛('o')作为蹲守点(曼哈顿, 控制搜索开销)

// ===== 状态追踪 =====
var lastCloakFrame = -9999;
var lastDodgeFrame = -9999;
var lastFireFrame = -9999;
var lastEnemyPos = null;
var lastEnemyFireFrame = -9999;    // 敌方上次开火帧
var enemyBulletPrev = null;        // 上帧是否看到敌方子弹
var enemyHistory = [];
var patrolDir = null;
var patrolFrame = 0;
var myStars = 0;
var enemyStars = 0;
var lastStarPos = null;
var lastMovePos = [-1, -1];
var stuckCounter = 0;
var lastTeleportFrame = -9999;   // teleport 技能冷却追踪(skillType=teleport, 修 me.cloak() 空调用致 skillUsed=0)
var TELEPORT_COOLDOWN_FRAMES = 40;
var oscHistory = [];             // 最近位置历史(用于反两格振荡检测)
var oscStreak = 0;               // 跨帧累积两格振荡计数, 用于触发 Teleport 深度脱困
var oscBreakDir = null;          // 脱困锁定的方向
var oscBreakUntil = -1;          // 脱困锁定截止帧
var fireSeekTarget = null;       // 提交的射击目标格 [x,y]
var fireSeekPosKey = -1;         // 上次计算目标时自己的格子 key (mx*1000+my)
var fireSeekFrame = -9999;       // 上次计算目标时的帧号
var FIRE_SEEK_STALE = 20;        // 敌方移动导致射线失效时，超过此帧数强制重算
var alignAxisChoice = null;      // 'x' | 'y' — 激进抢轴线的缓存选择(防振荡,非缓存具体格子)
var alignAxisFrame = -9999;
var alignLastEx = -9999, alignLastEy = -9999;
var lastDefenseFrame = -9999;    // 上次防御性脱轴帧
var CLOAK_THREAT_DIST = 10;      // 敌人在此曼哈顿距离内视为可"对齐即射"威胁
var alignedFirePriority = false;  // 对齐开火优先级: 已对齐但朝向不对时, 强制转向开火而非执行P3逻辑

// ===== 转向 hysteresis（根治转向 wiggle: 原地 left/right 甩头, turns≫moves）=====
// 根因: stuckCounter 只在"停同一格"累加, 而真 wiggle 会偶尔走一步(moves>0)使位置微变清空计数,
//       致 teleport 脱困(>8)/强制脱困(>5)永不触发。wiggle 本质在"朝向层": 每帧 desired-facing
//       在相反 cardinal 间翻转, 永不前进。此处为 turnTo 注入转向锁, 跨帧翻转达阈值即锁定一个方向,
//       坚定转到位并前进, 从根打断甩头。锁仅数帧且不影响已验证的 teleport 脱困/对齐/捡星。
var _curFrame = 0;               // 当前帧(供 turnTo 读取, 避免改函数签名)
var _lastTurnTarget = null;      // 上一帧 turnTo 的目标朝向
var _lastTurnFrame = -999;       // 上一帧 turnTo 的帧号
var _wiggleStreak = 0;           // 连续跨帧相反翻转计数
var _dirLockDir = null;          // 锁定中的朝向
var _dirLockUntil = -1;          // 锁定截止帧
var WIGGLE_LOCK_THRESHOLD = 3;   // 连续翻转达此帧数即锁方向
var WIGGLE_LOCK_FRAMES = 6;      // 锁定持续帧数
var WIGGLE_WINDOW = 4;            // 翻转计数窗口: 允许穿插≤此帧空转仍累计(治无动作帧打断锁)
function isOppositeDir(a, b) {
  if (!a || !b) return false;
  return (a === 'up' && b === 'down') || (a === 'down' && b === 'up') ||
         (a === 'left' && b === 'right') || (a === 'right' && b === 'left');
}

// ===== 进攻 overhaul 常量 =====
var BULLET_SPEED = 1;             // 子弹速度(格/帧), 由回放实测中位数=1.0
var LEAD_CLOSE_DIST = 3;          // ≤此距离视为近身, 提前量≈0, 直接打当前位置
var LEAD_CAP = 11;                // 提前量上限(帧)

// ===== 安全访问工具 =====
function safePos(e) {
  try {
    if (!e || !e.tank || !e.tank.position) return null;
    var p = e.tank.position;
    if (!Array.isArray(p) || p.length < 2) return null;
    return [p[0], p[1]];
  } catch (e) { return null; }
}
function safeDir(e) {
  try { return (e && e.tank && e.tank.direction) ? e.tank.direction : null; } catch (e) { return null; }
}
function safeStatus(e) {
  try { return e && e.status ? e.status : {}; } catch (e) { return {}; }
}
function safeBullet(e) {
  try {
    if (!e || !e.bullet) return null;
    var b = e.bullet;
    if (!b.position || !b.direction) return null;
    return b;
  } catch (e) { return null; }
}
function safeSkill(e) {
  try {
    if (!e) return null;
    if (e.skill) return e.skill;
    if (e.tank && e.tank.skill) return e.tank.skill;
    if (typeof e.cloak === 'function') return { remainingCooldownFrames: 0 };
    return null;
  } catch (e) { return null; }
}
function safeHealth(me) {
  try { if (me && me.tank && typeof me.tank.health === 'number') return me.tank.health; } catch (e) {}
  return 100;
}

// ===== 主入口 =====
function onIdle(me, enemy, game) {
  try { return _onIdle(me, enemy, game); }
  catch (e) { try { me.go(); } catch (e2) {} }
}

function _onIdle(me, enemy, game) {
  var myPos = safePos(me);
  if (!myPos) return;
  var mx = myPos[0], my = myPos[1];
  var dir = safeDir(me) || 'right';
  var frame = game.frames || 0;
  var hp = safeHealth(me);
  var isTimeout = frame > FRAME_TIMEOUT_WARNING;
  var map = game.map;

  // 每局重置敌方开火追踪(避免跨局串味): 用 frame===0 判定新一局开始
  if (frame === 0) { lastEnemyFireFrame = -9999; enemyBulletPrev = null; }
  // 转向 hysteresis: 记录当前帧; 新一局重置转向锁状态(避免跨局串味)
  _curFrame = frame;
  if (frame === 0) { _wiggleStreak = 0; _dirLockDir = null; _dirLockUntil = -1; _lastTurnTarget = null; _lastTurnFrame = -999; }

  // 反打转检测
  if (mx === lastMovePos[0] && my === lastMovePos[1]) stuckCounter++;
  else { stuckCounter = 0; lastMovePos = [mx, my]; }

  // 反两格振荡检测: stuckCounter 只在"停同一格"累加, 无法捕获 A<->B 来回跳。
  // 这里维护最近位置历史, 检测 A->B->A 的 ping-pong 模式。
  oscHistory.push([mx, my]);
  if (oscHistory.length > 4) oscHistory.shift();
  var oscDetected = false;
  if (oscHistory.length >= 3) {
    var _p1 = oscHistory[oscHistory.length - 1];
    var _p2 = oscHistory[oscHistory.length - 2];
    var _p3 = oscHistory[oscHistory.length - 3];
    if (_p1[0] === _p3[0] && _p1[1] === _p3[1] && !(_p1[0] === _p2[0] && _p1[1] === _p2[1])) {
      oscDetected = true;
    }
  }

  // 跨帧累积振荡计数: A<->B ping-pong 时+1, 否则衰减; 深度振荡触发 Teleport 脱困
  if (oscDetected) oscStreak++; else if (oscStreak > 0) oscStreak--;
  if (frame === 0) oscStreak = 0;

  // 追踪开火（我方）
  if (me.bullet) lastFireFrame = frame;

  // 更新敌人追踪
  var enemyPos = safePos(enemy);
  if (enemyPos) {
    enemyHistory.push({ x: enemyPos[0], y: enemyPos[1], frame: frame });
    if (enemyHistory.length > 12) enemyHistory.shift();
    lastEnemyPos = enemyPos;
  } else {
    enemyHistory = [];
  }

  // 敌方开火节奏追踪
  var eBullet = safeBullet(enemy);
  if (eBullet && !enemyBulletPrev) lastEnemyFireFrame = frame;
  enemyBulletPrev = eBullet;

  // 星星收集追踪
  var star = game.star;
  if (star && Array.isArray(star) && star.length >= 2) {
    lastStarPos = [star[0], star[1]];
  } else if (lastStarPos) {
    var sx = lastStarPos[0], sy = lastStarPos[1];
    var myDist = Math.abs(mx - sx) + Math.abs(my - sy);
    var eDist = enemyPos ? Math.abs(enemyPos[0] - sx) + Math.abs(enemyPos[1] - sy) : 999;
    if (myDist <= 1) myStars++;
    else if (eDist <= 1) enemyStars++;
    lastStarPos = null;
  }

  var enemyHasStarAdvantage = enemyStars > myStars;
  var starLead = myStars - enemyStars;            // >0 我领先, <0 敌领先
  var enemyVisible = enemyPos && !safeStatus(enemy).cloaked;
  var enemyDist = enemyPos ? (Math.abs(enemyPos[0] - mx) + Math.abs(enemyPos[1] - my)) : 999;
  var enemyFireCdRemain = frame - lastEnemyFireFrame;
  var enemyCanFireSoon = enemyFireCdRemain < ENEMY_FIRE_CD_EST;
  var enemyFacingDir = enemyPos ? safeDir(enemy) : null;

  // 每帧重置对齐开火优先级
  alignedFirePriority = false;

  // === P0: 生存（极低血量）===
  if (hp <= HEALTH_CRITICAL) {
    if (survivalMode(me, enemy, game, mx, my, dir, hp, frame, map)) return;
  }

  // === P0.3T: Teleport 技能脱困（修复头号败因「转向 wiggle」）===
  // 观测: skillType=teleport 但线上代码只调 me.cloak()(空操作)→ 全部对局 skillUsed=0;
  //       败局主导模式为原地甩头(turns≫moves, 如 tn95/mv2), 转向层反复翻转 desired-facing 致永不前进。
  // 修复: 深度卡死(stuckCounter>8, 即持续原地不动而空转)且传送就绪时, 直接传送到生产性目标,
  //       把「空转的 turns」变为「真实位移」, 从根上打断 wiggle 死锁, 同时激活闲置技能。
  //       仅在深卡死+冷却就绪时触发; 传送在冷却/未深卡死时完全不介入 → 对基线零行为改变。
  {
    var tSkill = safeSkill(me);
    var tReady = tSkill && tSkill.remainingCooldownFrames === 0
                 && (tSkill.type === 'teleport' || typeof me.teleport === 'function');
    var tCdOk = frame - lastTeleportFrame >= TELEPORT_COOLDOWN_FRAMES;
    if (tReady && tCdOk && (stuckCounter > 6 || oscStreak >= 5)) {
      var _tgx, _tgy;
      if (star && Array.isArray(star) && star.length >= 2 && typeof star[0] === 'number') { _tgx = star[0]; _tgy = star[1]; }
      else if (enemyPos) { _tgx = enemyPos[0]; _tgy = enemyPos[1]; }
      else { _tgx = Math.floor(mapWidth(map) / 2); _tgy = Math.floor(mapHeight(map) / 2); }
      if (tryTeleportToward(me, mx, my, _tgx, _tgy, enemyPos, eBullet, map)) {
        lastTeleportFrame = frame; stuckCounter = 0; oscHistory = []; oscStreak = 0; return;
      }
    }
  }

  // === P0.3D: Teleport 脱离来袭弹（修复 v5 沙盒验证到的「撞弹 crash」败局）===
  // 观测: 沙盒基线 30 场有 5 败且全部 reason=crashed; 复盘见坦克在敌弹所在列/行内原地左右甩头、
  //       未横向脱离弹道即被命中(如 game0: 敌弹沿列7上行, 我停[7,7]逐帧左右摆头, f55 中弹 crash)。
  // 修复: 真实来袭弹即将命中我/下一格(bulletThreat, 5 帧内)且 Teleport 就绪时, 直接传送到
  //       「垂直于弹道」的安全格(脱离子弹当前列/行、不在其未来弹道上), 把「挨弹 crash」转为位移脱险;
  //       同时激活闲置 Teleport 技能(skill.type=teleport, 原 P0.5 的 me.cloak() 对本坦克为空操作)。
  //       仅在此即死威胁窗口+冷却就绪时介入 → 对常规(无即死弹)行为零改变。复用已验证 tryTeleportToward 落点校验。
  {
    var tSkillD = safeSkill(me);
    var tReadyD = tSkillD && tSkillD.remainingCooldownFrames === 0
                  && (tSkillD.type === 'teleport' || typeof me.teleport === 'function');
    var tCdOkD = frame - lastTeleportFrame >= TELEPORT_COOLDOWN_FRAMES;
    if (tReadyD && tCdOkD && eBullet && bulletThreat(eBullet, mx, my, dir, map)) {
      if (tryTeleportAway(me, mx, my, enemyPos, eBullet, map)) {
        lastTeleportFrame = frame; stuckCounter = 0; oscHistory = []; return;
      }
    }
  }

  // 反打转强制脱困
  if (stuckCounter > 5) {
    patrolDir = null;
    if (star && Array.isArray(star) && star.length >= 2) {
      if (moveToward(me, mx, my, dir, star[0], star[1], map)) return;
    }
    if (enemyPos) {
      // 贴脸时不走敌人位置，改用随机方向打破模式
      var _stuckDist = Math.abs(enemyPos[0] - mx) + Math.abs(enemyPos[1] - my);
      if (_stuckDist > 2) {
        if (moveToward(me, mx, my, dir, enemyPos[0], enemyPos[1], map)) return;
      } else {
        var breakDirs = ['up', 'down', 'left', 'right'];
        for (var _bi = 0; _bi < 4; _bi++) {
          var _bd = breakDirs[(frame + _bi) % 4];
          if (canMoveTo(mx, my, _bd, map)) {
            if (dir !== _bd) turnTo(me, dir, _bd);
            else me.go();
            return;
          }
        }
      }
    }
    var breakDirs = ['up', 'down', 'left', 'right'];
    for (var bi = 0; bi < 4; bi++) {
      var bd = breakDirs[(frame + bi) % 4];
      if (canMoveTo(mx, my, bd, map)) {
        if (dir !== bd) turnTo(me, dir, bd);
        else me.go();
        return;
      }
    }
  }


  // === P0: 子弹躲避（任何模式都优先躲子弹）===
  // 去掉调用处冷却门控: 即时命中(mustDodge)必须每帧可评估, 不被 lastDodgeFrame 压制;
  //       冷却防振荡改由 dodgeBulletV2 内部仅对非即时"逼近中"应用。
  if (eBullet) {
    if (dodgeBulletV2(me, eBullet, mx, my, dir, frame, map)) return;
  }

  // === P0.4: 反两格振荡脱困（核心修复 classic 大图空转输星战）===
  // 检测到 A<->B 来回时, 锁定一个垂直于来回轴的方向强制脱离几帧,
  // 打破 BFS 在等价最短路间的反复横跳。躲弹已在本段之前处理并返回,
  // 故此处不再因"敌方有子弹"而让路(否则防守型对手持续开火会让脱困永不触发)。
  if (oscDetected) {
    oscBreakUntil = frame + 6;
    var _axisDx = Math.abs(oscHistory[oscHistory.length - 1][0] - oscHistory[oscHistory.length - 2][0]);
    var _cands = (_axisDx > 0) ? ['up', 'down'] : ['left', 'right'];   // 横向来回→纵向脱困, 反之亦然
    oscBreakDir = null;
    for (var _oi = 0; _oi < _cands.length; _oi++) {
      if (canMoveTo(mx, my, _cands[_oi], map)) { oscBreakDir = _cands[_oi]; break; }
    }
    if (!oscBreakDir) {
      var _alld = ['up', 'down', 'left', 'right'];
      for (var _ai = 0; _ai < 4; _ai++) {
        if (canMoveTo(mx, my, _alld[_ai], map)) { oscBreakDir = _alld[_ai]; break; }
      }
    }
  }
  // 深度走廊振荡: moveToward 在等价最短路间反复横跳且垂直两侧是墙, oscBreakDir 逃不掉,
  //   Teleport 又因 stuckCounter 只数"同格"从不触发 -> 400+帧空转(classic 复盘实证)。
  //   持续振荡(oscStreak>=6)时优先用 Teleport 直接跳向星/敌/中心, 把空转变为真实位移。
  if (oscStreak >= 6) {
    var _osT = safeSkill(me);
    var _osReady = _osT && _osT.remainingCooldownFrames === 0
                   && (_osT.type === 'teleport' || typeof me.teleport === 'function')
                   && (frame - lastTeleportFrame >= TELEPORT_COOLDOWN_FRAMES);
    if (_osReady) {
      var _oGx, _oGy;
      if (star && Array.isArray(star) && star.length >= 2 && typeof star[0] === 'number') { _oGx = star[0]; _oGy = star[1]; }
      else if (enemyPos) { _oGx = enemyPos[0]; _oGy = enemyPos[1]; }
      else { _oGx = Math.floor(mapWidth(map) / 2); _oGy = Math.floor(mapHeight(map) / 2); }
      if (tryTeleportToward(me, mx, my, _oGx, _oGy, enemyPos, eBullet, map)) {
        lastTeleportFrame = frame; stuckCounter = 0; oscHistory = []; oscStreak = 0; return;
      }
    }
    // Teleport 冷却中: 强制锁定垂直脱困方向前进(不再先跑 moveToward 重陷振荡)
    if (oscBreakDir) {
      if (dir === oscBreakDir) me.go(); else turnTo(me, dir, oscBreakDir);
      return;
    }
  }
  if (frame < oscBreakUntil) {
    // 脱困期间强制朝星(productive 目标)推进, 直接压制"朝星 vs 朝敌"的互相拉扯;
    // 无星时退而取垂直于来回轴的可走方向脱离。
    if (oscBreakDir) {
      if (dir === oscBreakDir) me.go();
      else turnTo(me, dir, oscBreakDir);
      return;
    }
    if (star && Array.isArray(star) && star.length >= 2) {
      if (moveToward(me, mx, my, dir, star[0], star[1], map)) return;
    }
  }

  // === P0.5: 防御性 + 预防性隐身（保命躲子弹 / 提前打断敌人瞄准）===
  // 触发: ①已有敌弹 ②敌已在我行/列且弹药就绪→提前隐身打断其瞄准(在子弹诞生前)
  //       ③低血受压。前提: 我不会因此放弃必胜射击窗口(iCanFireNow 时不触发)
  {
    var mySkillD = safeSkill(me);
    var amCloakedD = safeStatus(me).cloaked === true;
    var cloakReadyD = mySkillD && mySkillD.remainingCooldownFrames === 0 && !amCloakedD;
    var cloakCdOkD = frame - lastCloakFrame >= CLOAK_COOLDOWN_FRAMES;
    if (cloakReadyD && cloakCdOkD) {
      var iCanFireNow = enemyVisible && (mx === enemyPos[0] || my === enemyPos[1])
                        && isLineClear(mx, my, enemyPos[0], enemyPos[1], map)
                        && !me.bullet && !safeStatus(me).fireLocked;
      var enemyOnMyAxis = enemyVisible && (enemyPos[0] === mx || enemyPos[1] === my);
      var enemyOffCd = (frame - lastEnemyFireFrame) >= ENEMY_FIRE_CD_EST;
      var enemyThreat = enemyVisible && enemyDist <= CLOAK_THREAT_DIST;
      // 已对齐且有清晰射线 = 必胜射击窗口, 绝不在此隐身(否则会"对齐即隐身"导致0开火死循环)
      var alignedAndClear = enemyVisible && (mx === enemyPos[0] || my === enemyPos[1])
                            && isLineClear(mx, my, enemyPos[0], enemyPos[1], map);
      // 战略隐身抢星: 正在争夺中的星(我到星不比敌远)+敌在威胁范围内→隐身安全收星
      // (敌人看不到我无法瞄准; 十连败中 cloak 0 触发, 此处激活闲置技能。开心果靠技能抢星制胜)
      var starContest = false;
      if (star && Array.isArray(star) && star.length >= 2 && typeof star[0] === 'number') {
        var me2star = Math.abs(mx - star[0]) + Math.abs(my - star[1]);
        var en2star = enemyPos ? (Math.abs(enemyPos[0] - star[0]) + Math.abs(enemyPos[1] - star[1])) : 999;
        starContest = (me2star <= en2star + 2) && me2star <= 8;
      }
      // star-cloak 优先覆盖: 正争夺中的星 + 敌在威胁射程(≤STAR_CLOAK_THREAT)→即使对齐+射线清也隐身
      // (覆盖 "!alignedAndClear" 强制开火假设: 敌近身能 stun/射时, "我能开火"不成立——会被先手控杀)。
      // 修 mimo: Beita 对齐列4+敌dist9 抢星, 该开火却0开火(未诊断), 被stun锁控点杀。隐身=敌无法瞄准→无法stun。
      // 修复: 如果已对齐+射线清+iCanFireNow → 不要隐身! 先开火再考虑其他。
      // — Nezha 对齐 King 但被 starCloakUrgent 触发隐身, 错过必胜射击。
      var starCloakUrgent = starContest && enemyVisible && enemyDist <= STAR_CLOAK_THREAT;
      if (starCloakUrgent && alignedAndClear && iCanFireNow) {
        // 已对齐可开火 → 不要隐身, 交给 P0b 开火
        starCloakUrgent = false;
      }
      if (starCloakUrgent
          || (!iCanFireNow && !alignedAndClear && (eBullet
          || (enemyThreat && enemyOnMyAxis && enemyOffCd && enemyAligningToMe(enemyPos[0], enemyPos[1], mx, my))
          || (hp <= HEALTH_LOW && enemyVisible)))) {
        try { me.cloak(); lastCloakFrame = frame; } catch (e) {}
        return;
      }
    }
  }

  // === P0.6: 隐身生效中 → 趁敌人看不到我，脱离子弹路径 / 拉距离 / 顺手白嫖 ===
  if (safeStatus(me).cloaked === true) {
    if (eBullet && dodgeBulletV2(me, eBullet, mx, my, dir, frame, map)) return;
    var canFireNow = enemyVisible && !me.bullet && !safeStatus(me).fireLocked
                     && aimDirCheck(mx, my, enemyPos[0], enemyPos[1])
                     && isLineClear(mx, my, enemyPos[0], enemyPos[1], map);
    if (!canFireNow && enemyPos) {
      // 隐身抢星前先查"贴脸秒杀区": 星在敌火力线上(starInLane) + 敌近身(≤CLOAK_HOLD_THREAT) + 敌正朝该线
      //   → 绝不踏入此星(走进去=送同帧秒杀, vs 捶壮壮 f18 正因此被点杀)。改为转向敌人预瞄"看不见的第一枪"。
      //   手册铁律#6: 从敌无法定位处取胜; 蹲点打第一枪, 静止胜于走位。敌远或星不在敌火力线时仍安全收星。
      var starLethal = false;
      if (star && Array.isArray(star) && star.length >= 2 && typeof star[0] === 'number'
          && enemyVisible && enemyFacingDir) {
        starLethal = starInLane(star[0], star[1], enemyPos[0], enemyPos[1], enemyFacingDir, map)
                     && enemyDist <= CLOAK_HOLD_THREAT;
      }
      if (starLethal) {
        var faceDir = getDirection(mx, my, enemyPos[0], enemyPos[1]);
        if (faceDir && dir !== faceDir) { turnTo(me, dir, faceDir); return; }
        return;  // 已面向敌人→静待蹲点: 敌进通道即由 P0b 开火, 不送对齐
      }
      // 隐身中正争夺星(≤8格)→优先朝星移动安全收星(隐身=敌人看不到我), 而非 retreatAndFlank 远离
      if (star && Array.isArray(star) && star.length >= 2 && typeof star[0] === 'number') {
        var ms2 = Math.abs(mx - star[0]) + Math.abs(my - star[1]);
        if (ms2 <= 8 && moveToward(me, mx, my, dir, star[0], star[1], map)) return;
      }
      if (retreatAndFlank(me, mx, my, dir, enemyPos[0], enemyPos[1], enemyDist, map)) return;
    }
  }

  // === P0b: 已对齐且有清晰射线 → 安全开火（近身/逼角/静止才打, 远处动靶交走位压近）===
  if (enemyVisible && !me.bullet && !safeStatus(me).fireLocked && enemyPos) {
    var _pvel = estimateEnemyVelocity();
    if (_pvel.has && !_pvel.teleported && (_pvel.vx !== 0 || _pvel.vy !== 0)) {
      var _pex = enemyPos[0] + _pvel.vx, _pey = enemyPos[1] + _pvel.vy;
      var _pdist = Math.abs(_pex - mx) + Math.abs(_pey - my);
      if (_pdist >= 2 && (mx === _pex || my === _pey) && isValidPos(_pex, _pey, map)
          && !isWall(_pex, _pey, map) && isLineClear(mx, my, _pex, _pey, map)) {
        var _pad = aimDirCheck(mx, my, _pex, _pey);
        if (_pad) {
          if (dir === _pad) { me.fire(); lastFireFrame = frame; return; }
          else { turnTo(me, dir, _pad); return; }
        }
      }
    }
  }
  if (enemyVisible && !me.bullet && !safeStatus(me).fireLocked) {
    if (tryLeadFire(me, mx, my, dir, enemyPos[0], enemyPos[1], frame, map)) return;
  }

  // === P1: 开火后闪避（躲避回击，避免成靶子）===
  if (frame - lastFireFrame <= POST_FIRE_DODGE_FRAMES && enemyVisible && (eBullet || enemyDist <= 2)) {
    if (postFireDodge(me, mx, my, dir, enemyPos, frame, map)) return;
  }

  // === P2: 敌人有星优势 → 抢星遏制优先, 否则消灭敌人 ===
  if (enemyHasStarAdvantage && enemyVisible) {
    // 我离星更近则先抢星断敌(直接消解劣势), 比强行交战更稳
    if (star && Array.isArray(star) && star.length >= 2) {
      if (decideStarMove(me, mx, my, dir, star, enemyPos, enemyVisible, enemyCanFireSoon, enemyFacingDir, starLead, frame, map, isTimeout)) return;
    }
    if (combatMasterV2(me, enemy, game, mx, my, dir, hp, enemyPos, eBullet, isTimeout, frame, map, enemyCanFireSoon)) return;
    if (chaseEnemy(me, mx, my, dir, enemyPos, map)) return;
  }

  // === P2.5: 敌方为"被动控星型"(本局从未开火) → 抢星优先于抢轴对齐 ===
  // 修复致命弱点: 面对 crimson 这类从不放炮的防守型对手, 原 P3 会一直追对齐而放弃抢星, 输掉纯星战。
  //        判定: lastEnemyFireFrame 仍为初值(-9999) 即本局敌人从未开火(被动), 此时抢星优先。
  //        战斗型对手(开过火) enemyIsCombatant=true → 此块不触发, 保持原 P3 行为, 对 nova/azure 零回退。
  var enemyIsCombatant = (lastEnemyFireFrame !== -9999);
  if (!enemyIsCombatant && enemyVisible && star && Array.isArray(star) && star.length >= 2) {
    if (decideStarMove(me, mx, my, dir, star, enemyPos, false, false, null, starLead, frame, map, isTimeout)) return;
  }

  // === P2.6: 落后或平手(抢星遏制) → 抢星优先于纯交战追击 ===
  // 修复 v8+ 6 连败共性: 每场 stars=0 且 shots=0-1, 关键败因为"平手/落后时仍全程追对齐放弃抢星, 输掉星战"。
  //   原 P2 仅 enemyHasStarAdvantage(enemyVisible 才触发) + P2.5 仅 enemyNeverFired 才抢星; 平手 0-0 且敌为战斗型(会开火)时
  //   落入 P3 纯交战追击, 从不争星 → 敌顺手收星致 stars=0 败。
  // 触发: starLead <= 0(落后/平) 且 星存在。门控: P0b 清晰开火窗口已在上方 return(交火优先, 不抢星);
  //   否则复用 decideStarMove 既有方向安全/火力线/可达性校验 —— 不争星(敌更近/不安全/在敌火力线)时 decideStarMove 返回 false,
  //   行为回退至原 P3; 已领先(starLead>0)时本块根本不触发 → 对 nova/azure/crimson 基线零改变。
  if (starLead <= 0 && star && Array.isArray(star) && star.length >= 2) {
    if (decideStarMove(me, mx, my, dir, star, enemyPos, enemyVisible, enemyCanFireSoon, enemyFacingDir, starLead, frame, map, isTimeout)) return;
  }

  // === P3: 敌人可见 → 抢先手交战（核心修复：优先于捡星）===
  // Star-rush override: if star exists and I am closer, skip P3 combat and collect star
  if (star && Array.isArray(star) && star.length >= 2 && typeof star[0] === 'number') {
      var _my2star = Math.abs(mx - star[0]) + Math.abs(my - star[1]);
      var _en2star = enemyPos ? (Math.abs(enemyPos[0] - star[0]) + Math.abs(enemyPos[1] - star[1])) : 999;
      // If I am significantly closer to star (by 3+ cells), go for it instead of P3 combat
      // 安全门: 敌人贴脸(<3格)时不低头冲星, 交给下方 P3 交战/规避; 冲星致碰撞是近期首要败因
      var _enManStar = enemyPos ? (Math.abs(mx - enemyPos[0]) + Math.abs(my - enemyPos[1])) : 999;
      if (_my2star < _en2star && _my2star <= 10 && starLead >= 0 && _enManStar >= 2) {
          if (decideStarMove(me, mx, my, dir, star, enemyPos, enemyVisible, enemyCanFireSoon, enemyFacingDir, starLead, frame, map, isTimeout)) return;
      }
  }
  if (enemyVisible) {
    // 对齐开火优先级: 如果已在 P0b 设置了 alignedFirePriority，
    // 跳过 P3 的 seekFiringPosition/aggressiveAlign/combatMasterV2，避免它们覆盖 P0b 的 turnTo→fire 序列
    if (!alignedFirePriority) {
    // 3a: 战斗大师（开火 + 护盾/控制特例）。已对齐即射由 P0b 处理
    if (combatMasterV2(me, enemy, game, mx, my, dir, hp, enemyPos, eBullet, isTimeout, frame, map, enemyCanFireSoon)) return;
    // 3b: 清晰射线 BFS 求位(保证能开火,墙挡时自动改选有清晰射线的格子);失败则激进抢轴[A]
    if (seekFiringPosition(me, mx, my, dir, enemyPos[0], enemyPos[1], map, frame)) return;
    if (aggressiveAlign(me, mx, my, dir, enemyPos[0], enemyPos[1], map, frame)) return;
    }
    // 3c: 防御性脱离(安全网: 仅真实来袭弹)[C/D] — 对齐即射的预防交给 P0.5 隐身,避免误伤抢手节奏
    if (defensiveReposition(me, mx, my, dir, enemyPos, hp, frame, map)) return;
    // 3d: 兜底朝敌人走（ 添加距离保护）
    var _p3Dist = Math.abs(enemyPos[0] - mx) + Math.abs(enemyPos[1] - my);
    if (_p3Dist > 2) {
      if (chaseEnemy(me, mx, my, dir, enemyPos, map)) return;
    } else {
      // 贴脸(<=2): 能对齐先开火抢先手; 否则侧向脱离破 wiggle 死锁
      if (!me.bullet && !safeStatus(me).fireLocked
          && (mx === enemyPos[0] || my === enemyPos[1])
          && isLineClear(mx, my, enemyPos[0], enemyPos[1], map)) {
        var _cqDir = aimDirCheck(mx, my, enemyPos[0], enemyPos[1]);
        if (_cqDir) {
          if (dir === _cqDir) { me.fire(); lastFireFrame = frame; return; }
          else { turnTo(me, dir, _cqDir); return; }
        }
      }
      var _awayDir = getDirection(enemyPos[0], enemyPos[1], mx, my);
      if (_awayDir && canMoveTo(mx, my, _awayDir, map)) {
        if (dir !== _awayDir) turnTo(me, dir, _awayDir);
        else me.go();
        return;
      }
      // 后退被墙挡 → 侧向脱离, 绝不原地空转甩头
      var _sideDirs = (mx === enemyPos[0]) ? ['left', 'right'] : ['up', 'down'];
      if (mx !== enemyPos[0] && my !== enemyPos[1]) _sideDirs = ['up', 'down', 'left', 'right'];
      for (var _si = 0; _si < _sideDirs.length; _si++) {
        if (canMoveTo(mx, my, _sideDirs[_si], map)) {
          if (dir !== _sideDirs[_si]) turnTo(me, dir, _sideDirs[_si]);
          else me.go();
          return;
        }
      }
    }
  }

  // === P4: 星星收集（decideStarMove 集中决策：方向安全/路径成本/抢断/超时）===
  if (star && Array.isArray(star) && star.length >= 2) {
    if (decideStarMove(me, mx, my, dir, star, enemyPos, enemyVisible, enemyCanFireSoon, enemyFacingDir, starLead, frame, map, isTimeout)) return;
  }

  // === P5.5: 草丛埋伏（阶段②）===
  // 触发: 已领先(starLead>=AMBUSH_LEAD_MIN) 且 P4 未接管(无值得追的星或已收) 且 敌无即时威胁。
  //   - 敌不可见(enemyVisible=false): 直接埋伏(读不到我更好, 蹲草丛巩固隐蔽)。
  //   - 敌可见但较远(enemyDist>CLOAK_THREAT_DIST 即无对齐即射威胁): 也可埋伏拉开身位。
  // 保护 vs Random / 战斗局: 未领先(starLead<AMBUSH_LEAD_MIN) 或 敌近(可交战)时本块不触发, 走后续 P6/P7/交战逻辑。
  if (starLead >= AMBUSH_LEAD_MIN && !me.bullet) {
    var ambushSafe = !enemyVisible || (enemyDist > CLOAK_THREAT_DIST && !enemyCanFireSoon);
    if (ambushSafe) {
      if (moveToAmbushGrass(me, mx, my, dir, map, enemyPos, enemyFacingDir, frame)) return;
    }
  }

  // === P6: 敌方隐身应对（敌不可见时 decideStarMove 走安全路径收星, 不再无距离上限漫游）===
  if (!enemyPos) {
    // 草丛/隐身伏击规避: 敌不可见但可能藏草丛沿同行/列开火, 若我落在潜在伏击线上先垂直脱离(保命优先于抢星)
    if (avoidGrassAmbush(me, mx, my, dir, lastEnemyPos, map, frame)) return;
    if (star && Array.isArray(star) && star.length >= 2) {
      if (decideStarMove(me, mx, my, dir, star, null, false, false, null, starLead, frame, map, isTimeout)) return;
    }
    // [anti-osc] 仅当无星可争时才追最后敌踪: 否则"朝星 vs 朝敌"互相拉扯会造成两格振荡,
    // 交给上方 decideStarMove 与 P7 漫游即可, 不再与捡星逻辑抢优先级。
    if (lastEnemyPos && !(star && Array.isArray(star) && star.length >= 2)) {
      var d = Math.abs(lastEnemyPos[0] - mx) + Math.abs(lastEnemyPos[1] - my);
      if (d > 2 && moveToward(me, mx, my, dir, lastEnemyPos[0], lastEnemyPos[1], map)) return;
    }
  }

  
    // Close-range safety: maintain escape routes
    if (enemyVisible && enemyDist <= 5) {
        var allDirs = [{dx:0,dy:-1},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:0}];
        var safeMoves = [];
        for (var v7d = 0; v7d < allDirs.length; v7d++) {
            var v7nx = mx + allDirs[v7d].dx;
            var v7ny = my + allDirs[v7d].dy;
            if (v7nx >= 0 && v7nx < map[0].length && v7ny >= 0 && v7ny < map.length) {
                if (map[v7ny][v7nx] !== '#' && map[v7ny][v7nx] !== 'o') {
                    var v7esc = 0;
                    for (var v7e = 0; v7e < 4; v7e++) {
                        var v7enx = v7nx + allDirs[v7e].dx;
                        var v7eny = v7ny + allDirs[v7e].dy;
                        if (v7enx >= 0 && v7enx < map[0].length && v7eny >= 0 && v7eny < map.length) {
                            if (map[v7eny][v7enx] !== '#' && map[v7eny][v7enx] !== 'o') v7esc++;
                        }
                    }
                    if (v7esc >= 2) safeMoves.push(allDirs[v7d]);
                }
            }
        }
        if (safeMoves.length > 0 && hp <= HEALTH_LOW) {
            for (var v7p = 0; v7p < safeMoves.length; v7p++) {
                var v7vm = safeMoves[v7p];
                var v7nnx = mx + v7vm.dx;
                var v7nny = my + v7vm.dy;
                var v7newDist = enemyPos ? Math.abs(enemyPos[0] - v7nnx) + Math.abs(enemyPos[1] - v7nny) : 999;
                var v7oldDist = enemyPos ? Math.abs(enemyPos[0] - mx) + Math.abs(enemyPos[1] - my) : 999;
                if (v7newDist > v7oldDist) {
                    if (dir !== v7vm) turnTo(me, dir, getDirection(mx, my, v7nnx, v7nny));
                    else me.go();
                    return true;
                }
            }
        }
    }
// === P7: 战术漫游（敌人不可见时）===
  if (!enemyVisible) {
    tacticalWander(me, mx, my, dir, frame, map, enemyPos);
  } else {
    // 敌人可见但以上都未命中：继续激进抢轴
    if (enemyPos && aggressiveAlign(me, mx, my, dir, enemyPos[0], enemyPos[1], map, frame)) return;
    // 最终 fallback 也要检查距离，避免 crash
    if (enemyPos) {
      var _finalDist = Math.abs(enemyPos[0] - mx) + Math.abs(enemyPos[1] - my);
      if (_finalDist > 2) {
        if (moveToward(me, mx, my, dir, enemyPos[0], enemyPos[1], map)) return;
      } else {
        // 太近，后退
        var _retDir = getDirection(enemyPos[0], enemyPos[1], mx, my);
        if (_retDir && canMoveTo(mx, my, _retDir, map)) {
          if (dir !== _retDir) turnTo(me, dir, _retDir);
          else me.go();
          return;
        }
      }
    }
    smartPatrol(me, mx, my, dir, frame, map);
  }
}

// =================================================================
// ===== P0: 子弹躲避 V2 ============================================
// =================================================================
function dodgeBulletV2(me, bullet, mx, my, dir, frame, map) {
  var bx = bullet.position[0], by = bullet.position[1];
  var bdir = bullet.direction;

  var ddx = 0, ddy = 0;
  if (bdir === 'up') ddy = -1;
  else if (bdir === 'down') ddy = 1;
  else if (bdir === 'left') ddx = -1;
  else if (bdir === 'right') ddx = 1;

  var bulletSpeed = BULLET_SPEED;   // 实测子弹=1格/帧, 原先写死2导致闪避预判偏差
  var frames = [];
  for (var i = 0; i <= 12; i++) {
    var px = bx + ddx * i;
    var py = by + ddy * i;
    var arriveFrame = Math.ceil(i / bulletSpeed);
    frames.push([px, py, arriveFrame]);
  }

  var hitFrame = -1;
  for (var i = 0; i <= 6; i++) {
    if (frames[i][0] === mx && frames[i][1] === my) {
      hitFrame = frames[i][2]; break;
    }
  }

  var myNext = nextPos(mx, my, dir);
  var hitNext = false;
  for (var i = 0; i <= 4; i++) {
    if (frames[i][0] === myNext[0] && frames[i][1] === myNext[1]) {
      hitNext = true; break;
    }
  }

  var mustDodge = (hitFrame >= 0) || hitNext;
  var approaching = false;
  var minFrames = 99;

  if (mustDodge) {
    minFrames = hitFrame >= 0 ? hitFrame : 1;
  } else {
    for (var i = 6; i <= 12; i++) {
      if (frames[i][0] === mx && frames[i][1] === my) {
        approaching = true;
        minFrames = frames[i][2];
        break;
      }
    }
  }

  if (!mustDodge && !approaching) return false;

  // 冷却仅约束非即时"逼近中"(approaching)的闪避以防振荡;
  //       即时命中(mustDodge, 子弹路径将在我当前/下一格命中)无视冷却必闪——
  //       否则 曾因 lastDodgeFrame 2 帧冷却压制了救命闪避, 被 MTFish 关键命中。
  if (!mustDodge && frame <= lastDodgeFrame) return false;

  function turnCost(targetDir) {
    var rt = rightTurns(dir, targetDir);
    if (rt === 0) return 0;
    if (rt === 1 || rt === 3) return 1;
    return 2;
  }

  var perpDirs = (ddx !== 0) ? ['up', 'down'] : ['left', 'right'];

  function isSafe(cx, cy) {
    return isValidPos(cx, cy, map) && !isWall(cx, cy, map);
  }

  var candidates = [];
  for (var pi = 0; pi < perpDirs.length; pi++) {
    var pd = perpDirs[pi];
    var np = nextPos(mx, my, pd);
    var cost = turnCost(pd) + 1;
    var safe = isSafe(np[0], np[1]);
    var space = safe ? countOpenSpace(np[0], np[1], pd, map, 6) : 0;
    candidates.push({ dir: pd, cost: cost, safe: safe, space: space });
  }
  candidates.sort(function(a, b) {
    if (a.cost !== b.cost) return a.cost - b.cost;
    return b.space - a.space;
  });

  for (var ci = 0; ci < candidates.length; ci++) {
    var c = candidates[ci];
    if (c.safe && (approaching || c.cost <= minFrames)) {
      if (dir === c.dir) me.go();
      else turnTo(me, dir, c.dir);
      lastDodgeFrame = frame + 2;
      return true;
    }
  }

  var diagTargets = [];
  for (var pi = 0; pi < perpDirs.length; pi++) {
    var pdd = perpDirs[pi];
    var pdVec = [0, 0];
    if (pdd === 'up') pdVec[1] = -1;
    else if (pdd === 'down') pdVec[1] = 1;
    else if (pdd === 'left') pdVec[0] = -1;
    else if (pdd === 'right') pdVec[0] = 1;
    var ax = mx + pdVec[0] + ddx, ay = my + pdVec[1] + ddy;
    var bbx = mx + pdVec[0] - ddx, bby = my + pdVec[1] - ddy;
    var targets = [[ax, ay], [bbx, bby]];
    for (var ti = 0; ti < targets.length; ti++) {
      var tx = targets[ti][0], ty = targets[ti][1];
      if (isSafe(tx, ty)) {
        diagTargets.push({ firstDir: pdd, cost: turnCost(pdd) + 1 });
      }
    }
  }
  diagTargets.sort(function(a, b) { return a.cost - b.cost; });
  for (var di = 0; di < diagTargets.length; di++) {
    var dt = diagTargets[di];
    if (approaching || dt.cost <= minFrames) {
      if (dir === dt.firstDir) me.go();
      else turnTo(me, dir, dt.firstDir);
      lastDodgeFrame = frame + 2;
      return true;
    }
  }

  var revDir = reverseDir(dir);
  var revPos = nextPos(mx, my, revDir);
  if (isSafe(revPos[0], revPos[1])) {
    var backCost = 2 + 1;
    if (approaching || backCost <= minFrames) {
      turnTo(me, dir, revDir);
      lastDodgeFrame = frame + 2;
      return true;
    }
  }

  var f0Hit = (frames[0][0] === mx && frames[0][1] === my);
  if (!f0Hit) return true;

  if (lastEnemyPos) {
    var eDir = getDirection(mx, my, lastEnemyPos[0], lastEnemyPos[1]);
    if (eDir && dir !== eDir) turnTo(me, dir, eDir);
  }
  return true;
}

// =================================================================
// ===== P1: 开火后横向闪避 =========================================
// =================================================================
function postFireDodge(me, mx, my, dir, enemyPos, frame, map) {
  var ex = enemyPos[0], ey = enemyPos[1];
  var dx = ex - mx, dy = ey - my;

  var perpDirs;
  if (Math.abs(dx) >= Math.abs(dy)) {
    perpDirs = ['up', 'down'];
  } else {
    perpDirs = ['left', 'right'];
  }

  function turnCost(targetDir) {
    var rt = rightTurns(dir, targetDir);
    if (rt === 0) return 0;
    if (rt === 1 || rt === 3) return 1;
    return 2;
  }

  var best = null, bestCost = 99;
  for (var i = 0; i < perpDirs.length; i++) {
    var pd = perpDirs[i];
    var np = nextPos(mx, my, pd);
    if (!isValidPos(np[0], np[1], map) || isWall(np[0], np[1], map)) continue;
    var cost = turnCost(pd);
    if (cost < bestCost) { bestCost = cost; best = pd; }
  }

  if (best) {
    if (dir === best) me.go();
    else turnTo(me, dir, best);
    return true;
  }
  return false;
}

// =================================================================
// ===== P2 追击 ===================================================
// =================================================================
function chaseEnemy(me, mx, my, dir, enemyPos, map) {
  var ex = enemyPos[0], ey = enemyPos[1];
  // 距离保护：太近时不走向敌人，避免 crash
  var _ceDist = Math.abs(ex - mx) + Math.abs(ey - my);
  if (_ceDist <= 1) return false;
  if (moveToward(me, mx, my, dir, ex, ey, map)) return true;
  var targetDir = getDirection(mx, my, ex, ey);
  if (canMoveTo(mx, my, targetDir, map)) {
    if (dir !== targetDir) turnTo(me, dir, targetDir);
    else me.go();
    return true;
  }
  var sides = getSideDirections(targetDir);
  var best = pickBetterSide(mx, my, sides, ex, ey, map);
  if (best) {
    if (dir !== best) turnTo(me, dir, best);
    else me.go();
    return true;
  }
  return false;
}

// =================================================================
// ===== P3: 求位射击（核心，提交式目标缓存防振荡）============
// 用 BFS 找到离自己最近、与敌人同行/同列且有清晰射线的格子，
// 坚定走过去；仅在自己移动到新格子或目标失效时才重算
// =================================================================
function seekFiringPosition(me, mx, my, dir, ex, ey, map, frame) {
  if (mx === ex && my === ey) { fireSeekTarget = null; return false; }

  var posKey = mx * 1000 + my;
  var needRecompute = (fireSeekPosKey !== posKey) || !fireSeekTarget;

  if (!needRecompute) {
    // 校验缓存目标是否仍有效（未被墙挡、对敌人仍有清晰射线、未过期）
    var tx = fireSeekTarget[0], ty = fireSeekTarget[1];
    if (isWall(tx, ty, map) || !isLineClear(tx, ty, ex, ey, map) ||
        (frame - fireSeekFrame > FIRE_SEEK_STALE)) {
      needRecompute = true;
    }
  }

  if (needRecompute) {
    fireSeekTarget = findBestFiringCell(mx, my, ex, ey, map);
    fireSeekPosKey = posKey;
    fireSeekFrame = frame;
  }

  if (!fireSeekTarget) return false;

  // 已到达目标格 → 交由 trySmartFireV2 / 快速开火逻辑开火
  if (mx === fireSeekTarget[0] && my === fireSeekTarget[1]) return false;

  return moveToward(me, mx, my, dir, fireSeekTarget[0], fireSeekTarget[1], map);
}

// 在敌人所在行/列上，用 BFS 距离找最近的、对敌人有清晰射线的格子
function findBestFiringCell(mx, my, ex, ey, map) {
  var bfsResult = bfsFrom(mx, my, map);
  if (!bfsResult) return null;
  var distMap = bfsResult.dist;
  var key = function(x, y) { return x * 1000 + y; };
  var bestPos = null, bestScore = 999999;
  var mw = mapWidth(map), mh = mapHeight(map);
  var vel = estimateEnemyVelocity();
  var esc = enemyEscapeCells(ex, ey, map);

  var consider = function(px, py, axis) {
    if (isWall(px, py, map)) return;
    if (!isLineClear(px, py, ex, ey, map)) return;
    var k = key(px, py);
    if (!distMap.hasOwnProperty(k)) return;
    var myDist = distMap[k];
    var cellToEnemy = Math.abs(px - ex) + Math.abs(py - ey);
    var score = myDist + 2 * cellToEnemy;          // 兼顾可达 + 近身压制
    if (esc <= 1) score -= 40;                      // 逼角: 敌人无处逃, 强力优先
    if (vel.has && !vel.teleported) {               // 轴匹配: 射击轴⊥敌人速度方向才可预判命中
      if (vel.vy !== 0 && axis === 'col') score += 6;   // 敌横向动却选垂直射击(敌会离开列)
      if (vel.vx !== 0 && axis === 'row') score += 6;   // 敌纵向动却选水平射击(敌会离开行)
    }
    if (score < bestScore) { bestScore = score; bestPos = [px, py]; }
  };
  // 敌人所在列（不同行）→ 垂直射击候选
  for (var y = 0; y < mh; y++) { if (y === ey) continue; consider(ex, y, 'col'); }
  // 敌人所在行（不同列）→ 水平射击候选
  for (var x = 0; x < mw; x++) { if (x === ex) continue; consider(x, ey, 'row'); }
  return bestPos;
}

// =================================================================
// ===== : 敌人是否正在对齐/将对齐我（预防性隐身依据）==========
// 已在我行/列, 或历史移动方向指向我的轴 → 视为即将获得对我清晰射线
// =================================================================
function enemyAligningToMe(ex, ey, mx, my) {
  if (ex === mx || ey === my) return true;  // 已对齐
  var eDir = getEnemyMoveDir();
  if (!eDir) return false;
  var dv = dirVec(eDir);
  if (dv[0] !== 0 && Math.sign(dv[0]) === Math.sign(mx - ex)) return true; // 水平逼近我的 x
  if (dv[1] !== 0 && Math.sign(dv[1]) === Math.sign(my - ey)) return true; // 垂直逼近我的 y
  return false;
}
function getEnemyMoveDir() {
  if (enemyHistory.length < 2) return null;
  try {
    var recent = enemyHistory[enemyHistory.length - 1];
    var older = enemyHistory[Math.max(0, enemyHistory.length - 3)];
    if (recent.frame - older.frame < 1) return null;
    var ddx = recent.x - older.x, ddy = recent.y - older.y;
    if (Math.abs(ddx) > Math.abs(ddy) && ddx !== 0) return ddx > 0 ? 'right' : 'left';
    if (Math.abs(ddy) >= Math.abs(ddx) && ddy !== 0) return ddy > 0 ? 'down' : 'up';
  } catch (e) {}
  return null;
}

// =================================================================
// ===== : A 激进抢轴线（每帧朝敌轴移动，轴线选择缓存防振荡）====
// 敌人可见且未对齐时，坚定朝其所在行/列移动以尽快获得射击轴线；
// 仅缓存"选哪条轴(x/y)"，不缓存具体格子——避免 初版的左右横跳
// =================================================================
function aggressiveAlign(me, mx, my, dir, ex, ey, map, frame) {
  // 贴脸时不抢轴，避免 crash
  var _aaDist = Math.abs(ex - mx) + Math.abs(ey - my);
  if (_aaDist <= 2) return false;
  if (mx === ex || my === ey) { alignAxisChoice = null; return false; }
  var needChoice = (!alignAxisChoice)
                || (frame - alignAxisFrame > 15)
                || (Math.abs(ex - alignLastEx) + Math.abs(ey - alignLastEy) > 3);
  if (needChoice) {
    var xClear = countAxisClear(mx, my, ex, 'x', map);
    var yClear = countAxisClear(mx, my, ey, 'y', map);
    alignAxisChoice = (xClear >= yClear) ? 'x' : 'y';
    alignAxisFrame = frame;
    alignLastEx = ex; alignLastEy = ey;
  }
  if (alignAxisChoice === 'x') return moveToAxis(me, mx, my, dir, ex, 'x', map);
  return moveToAxis(me, mx, my, dir, ey, 'y', map);
}

// =================================================================
// ===== : C anti-对齐走位（被对齐威胁且无射击窗口→脱离）========
// 敌人已在我行/列且弹药就绪(或我低血)，而我又无法立即开火 →
// 优先隐身打断其瞄准(P0.5已处理则兜底)；否则垂直脱离其预测射线
// =================================================================
function defensiveReposition(me, mx, my, dir, enemyPos, hp, frame, map) {
  var ex = enemyPos[0], ey = enemyPos[1];
  var dist = Math.abs(ex - mx) + Math.abs(ey - my);
  var enemyAlignedToMe = (ex === mx) || (ey === my);
  // 仅近距离被对齐威胁 / 实际来袭弹才脱离——远距离应优先抢轴线开火(A)，
  // 否则会陷入"永不射击"僵局(实测 首版对 crimson 0 开火→超时负)
  var bulletThreat = !!eBullet;   // 仅真实来袭弹才脱离;对齐即射的预防交给 P0.5 隐身,避免误伤抢手节奏
  if (!bulletThreat) return false;
  // 若我此刻能开火，绝不脱离——交给 P0b/combatMaster 直接击杀
  var iCanFire = (mx === ex || my === ey) && isLineClear(mx, my, ex, ey, map)
                 && !me.bullet && !safeStatus(me).fireLocked;
  if (iCanFire) return false;
  // 1) 隐身打断(若 P0.5 因故未触发，这里兜底)
  var mySkill = safeSkill(me);
  var amC = safeStatus(me).cloaked === true;
  if (mySkill && mySkill.remainingCooldownFrames === 0 && !amC
      && (frame - lastCloakFrame) >= CLOAK_COOLDOWN_FRAMES) {
    try { me.cloak(); lastCloakFrame = frame; } catch (e) {}
    return true;
  }
  // 2) 垂直脱离：敌在我列→横向走；敌在我行→纵向走（必离其轴）
  var perpDirs = (ex === mx) ? ['left', 'right'] : ['up', 'down'];
  var best = pickBetterSide(mx, my, perpDirs, ex, ey, map);
  if (best) {
    lastDefenseFrame = frame;
    if (dir === best) me.go(); else turnTo(me, dir, best);
    return true;
  }
  return false;
}

// =================================================================
// ===== : 已对齐但被墙挡 → 沿轴滑动找清晰射线缺口 =============
// =================================================================
// =================================================================
// ===== P3: 战斗大师 V2（只管开火 + 护盾/控制特例，走位交给 seekFiringPosition）
// =================================================================
function combatMasterV2(me, enemy, game, mx, my, dir, hp, enemyPos, eBullet, isTimeout, frame, map, enemyCanFireSoon) {
  var ex = enemyPos[0], ey = enemyPos[1];
  var dist = Math.abs(ex - mx) + Math.abs(ey - my);
  var eStatus = safeStatus(enemy);

  // 1) 敌人有护盾 → 拉开距离 + 侧绕
  if (eStatus.shielded && dist < 6) {
    return retreatAndFlank(me, mx, my, dir, ex, ey, dist, map);
  }

  // 2) 敌人被控 → 全力输出（直接压上，不在乎走位）
  if (eStatus.frozen || eStatus.stunned) {
    return engageAggressive(me, mx, my, dir, ex, ey, map);
  }

  // 3) 常规射击（对齐直射 + 预测 + 相邻机动）
  var fireResult = trySmartFireV2(me, enemy, mx, my, dir, ex, ey, dist, frame, map);
  if (fireResult) return true;

  // 4) 贴脸且无法射击 → 后撤拉开，避免被转向击杀
  if (dist <= 1) {
    return retreatAndFlank(me, mx, my, dir, ex, ey, dist, map);
  }

  // 5) 低血量 + 远距离 → 保守，交给主循环的星星/隐身逻辑
  if (hp <= HEALTH_LOW && dist >= 6) return false;

  // 注意：本函数不再自行走位（避免与 seekFiringPosition 争用导致振荡），
  // 走位完全由主循环 P3b 的 seekFiringPosition 负责。
  return false;
}

// ===== V15 急迫交战 =============================================
// ===== V14+ 智能射击 ============================================
function trySmartFireV2(me, enemy, mx, my, dir, ex, ey, dist, frame, map) {
  if (me.bullet) return false;
  if (safeStatus(me).fireLocked) return false;

  // 最高优先级 - 安全开火(近身/逼角/静止打当前位置; 远处动靶交给走位压近)
  if (tryLeadFire(me, mx, my, dir, ex, ey, frame, map)) return true;

  // V15 扩展逼近射击（12格内主动机动到射击位）
  if (dist <= 12 && dist >= 1) {
    var primaryAim = [ex, ey];
    var moveOpts = ['up', 'down', 'left', 'right'];
    var bestMove = null, bestScore = -9999;
    for (var mi = 0; mi < moveOpts.length; mi++) {
      var md = moveOpts[mi];
      var np = nextPos(mx, my, md);
      if (!isValidPos(np[0], np[1], map) || isWall(np[0], np[1], map)) continue;
      var ad2 = aimDirCheck(np[0], np[1], primaryAim[0], primaryAim[1]);
      if (!ad2) continue;
      if (!isLineClear(np[0], np[1], primaryAim[0], primaryAim[1], map)) continue;
      var tc = (dir === md) ? 0 : 1;
      var distToAim = Math.abs(np[0] - primaryAim[0]) + Math.abs(np[1] - primaryAim[1]);
      var facingBonus = 0;
      var needFace = aimDirCheck(np[0], np[1], primaryAim[0], primaryAim[1]);
      if (needFace && md === needFace) facingBonus = 2;
      var score = -tc * 2 - distToAim * 3 + facingBonus;
      if (score > bestScore) { bestScore = score; bestMove = md; }
    }
    if (bestMove) {
      if (dir === bestMove) me.go();
      else turnTo(me, dir, bestMove);
      return true;
    }
  }

  // 贴脸兜底（3格内，需有清晰射线）
  if (dist <= 3 && (mx === ex || my === ey)) {
    if (isLineClear(mx, my, ex, ey, map)) {
      var needDir = aimDirCheck(mx, my, ex, ey);
      if (needDir && dir === needDir) { me.fire(); lastFireFrame = frame; return true; }
      if (needDir && dir !== needDir) { turnTo(me, dir, needDir); return true; }
    }
  }

  return false;
}

// ===== V12 敌人预测 =============================================
// ===== 敌人速度估计 + 提前量/近身开火 =======================
// 从 enemyHistory 平滑估计敌人速度(格/帧主轴); 检测传送跳变(单帧位移>2)
function estimateEnemyVelocity() {
  var n = enemyHistory.length;
  if (n < 2) return { vx: 0, vy: 0, teleported: false, has: false };
  var pts = enemyHistory.slice(Math.max(0, n - 4));
  var sx = 0, sy = 0, cnt = 0, teleported = false;
  for (var i = 1; i < pts.length; i++) {
    var dx = pts[i].x - pts[i - 1].x;
    var dy = pts[i].y - pts[i - 1].y;
    if (Math.abs(dx) + Math.abs(dy) > 2) { teleported = true; continue; }   // 传送跳变, 跳过
    sx += dx; sy += dy; cnt++;
  }
  if (cnt === 0) return { vx: 0, vy: 0, teleported: teleported, has: false };
  var vx = sx > 0 ? 1 : (sx < 0 ? -1 : 0);
  var vy = sy > 0 ? 1 : (sy < 0 ? -1 : 0);
  return { vx: vx, vy: vy, teleported: teleported, has: true };
}

// 敌人 (ex,ey) 的"逃生格"数量(相邻可走非墙格) — 越少越被逼角
function enemyEscapeCells(ex, ey, map) {
  if (ex < 0 || ey < 0) return 99;
  var c = 0;
  var dirs = ['up', 'down', 'left', 'right'];
  for (var i = 0; i < 4; i++) {
    var np = nextPos(ex, ey, dirs[i]);
    if (isValidPos(np[0], np[1], map) && !isWall(np[0], np[1], map)) c++;
  }
  return c;
}

// 安全开火决策: 返回 true 表示本帧已行动(开火或转向), 上层应 return
// 开火条件(任一满足即打当前位置):
//  ① 近身(flight≤LEAD_CLOSE_DIST) ② 敌人被逼角 ③ 敌人静止 ④ 敌人刚传送
//  ⑤ 敌人沿射击线"朝我方"移动(必中, 否则其会沿同一直线逃出射程)
// 远处且敌人垂直穿越射击线(将闪避且非朝我) -> 不开火(预判不可靠), 交给走位压近/逼角
function tryLeadFire(me, mx, my, dir, ex, ey, frame, map) {
  if (me.bullet || safeStatus(me).fireLocked) return false;
  var alignedV = (mx === ex);
  var alignedH = (my === ey);
  if (!alignedV && !alignedH) return false;
  if (!isLineClear(mx, my, ex, ey, map)) return false;

  // 标记对齐开火优先级: 已对齐但朝向不对 → 外部逻辑不应打断转向开火
  var needDir = aimDirCheck(mx, my, ex, ey);
  if (needDir && dir !== needDir) {
    alignedFirePriority = true;
  } else {
    alignedFirePriority = false;
  }

  var vel = estimateEnemyVelocity();
  var flight = alignedV ? Math.abs(my - ey) : Math.abs(mx - ex);
  var cornered = enemyEscapeCells(ex, ey, map) <= 1;
  var stationary = !vel.has || (vel.vx === 0 && vel.vy === 0);

  // 敌沿射击线朝我方移动 → 子弹与敌对向相遇, 打当前位置必中
  var approaching = false;
  if (alignedH) {
    // 线为垂直(同y=my): 敌在(ex,my), 沿X(行)移动才算沿线上
    if (vel.vx !== 0 && vel.vy === 0) {
      if ((ex > mx && vel.vx < 0) || (ex < mx && vel.vx > 0)) approaching = true;
    }
  } else {
    // 线为水平(同x=mx): 敌在(mx,ey), 沿Y(列)移动才算沿线上
    if (vel.vy !== 0 && vel.vx === 0) {
      if ((ey > my && vel.vy < 0) || (ey < my && vel.vy > 0)) approaching = true;
    }
  }

  if (flight <= LEAD_CLOSE_DIST || cornered || stationary || vel.teleported || approaching) {
    var ad = aimDirCheck(mx, my, ex, ey);
    if (ad) {
      if (dir === ad) { me.fire(); lastFireFrame = frame; }
      else turnTo(me, dir, ad);
      return true;
    }
    return false;
  }
  // 情形2(兜底压力): 已对齐且射线清, 但敌在闪避且我短时间内压不近 ->
  //   限距内(flight<=LEAD_CAP)必开火: 优先 1 帧提前量, 否则打当前位置。
  //   这是 "对齐即射" 中距压制能力的受限恢复版(限距, 避免远距离无脑喷墙)。
  //   LEAD_CAP 限制最大提前量，避免远距离无效开火
  if (flight <= LEAD_CAP) {
    var lx = ex + vel.vx, ly = ey + vel.vy;
    var onLine = (alignedV && lx === mx && isLineClear(mx, my, mx, ly, map)) ||
                 (alignedH && ly === my && isLineClear(mx, my, lx, my, map));
    if (onLine) {
      var ad2 = aimDirCheck(mx, my, lx, ly);
      if (ad2) {
        if (dir === ad2) { me.fire(); lastFireFrame = frame; }
        else turnTo(me, dir, ad2);
        return true;
      }
    }
    // 提前量不可用(敌垂直离轴) -> 限距内仍打当前位置, 保证有输出不白送
    var adC = aimDirCheck(mx, my, ex, ey);
    if (adC) {
      if (dir === adC) { me.fire(); lastFireFrame = frame; }
      else turnTo(me, dir, adC);
      return true;
    }
  }
  // 朴素开火(用户建议#1): 远处+垂直穿越射击线时, 旧版持枪不发(致 ZiyuGo 128帧仅1开火被动打平被耗时判负)。
  // 现改为"同线+无遮挡即转向开炮"——打当前位置(不限距), 先转向再开炮, 保证有输出避免被动超时负。
  // 权衡: 远距垂直动靶命中率低(可能撞墙), 但"1开火打平输"更糟; 杯赛后据命中率/撞墙率调是否加距离上限。
  var adN = aimDirCheck(mx, my, ex, ey);
  if (adN) {
    if (dir === adN) { me.fire(); lastFireFrame = frame; }
    else turnTo(me, dir, adN);
    return true;
  }
  return false;
}

function aimDirCheck(mx, my, tx, ty) {
  if (mx === tx) return ty < my ? 'up' : ty > my ? 'down' : null;
  if (my === ty) return tx < mx ? 'left' : tx > mx ? 'right' : null;
  return null;
}

// =================================================================
// ===== P5.5 草丛埋伏（阶段②：领先后隐蔽蹲守，敌看不见我）====
// =================================================================
// 战术: 已领先(starLead>=AMBUSH_LEAD_MIN)且当前无星可争、敌无即时威胁时,
//       移动到附近最近草丛('o')蹲守. 站草上时 enemy.tank 对敌隐藏 → 敌方脚本
//       读不到我坐标, 难以瞄准/追击, 我方保住领先并伺机偷袭下一颗星.
// 返回 true 表示已接管本帧行动.
function moveToAmbushGrass(me, mx, my, dir, map, enemyPos, enemyFacingDir, frame) {
  // 已经站在草丛里 → 保持不动(维持隐身), 面向最近的开阔通道以便偷袭
  if (getCell(mx, my, map) === 'o') {
    // 静默蹲守: 不 go 不乱转, 避免暴露/位移离开掩体. 直接消耗本帧(不行动)。
    return true;
  }
  // 从自身 BFS 扩散, 找半径内路径最近的草丛格
  var sf = bfsFrom(mx, my, map);
  if (!sf) return false;
  var best = null, bestD = 999;
  var xMax = map.length;
  for (var gx = 0; gx < xMax; gx++) {
    var col = map[gx];
    if (!col) continue;
    for (var gy = 0; gy < col.length; gy++) {
      if (col[gy] !== 'o') continue;
      var man = Math.abs(gx - mx) + Math.abs(gy - my);
      if (man > AMBUSH_GRASS_SCAN) continue;      // 仅近距草丛(控制开销 + 避免跑太远露头)
      var k = gx * 1000 + gy;
      var d = (sf.dist[k] !== undefined) ? sf.dist[k] : 999;
      if (d < bestD) { bestD = d; best = [gx, gy]; }
    }
  }
  if (best && bestD < 900) {
    return moveTowardThreatAware(me, mx, my, dir, best[0], best[1], map, enemyPos, enemyFacingDir);
  }
  return false;
}

// =================================================================
// ===== P7: 战术漫游（仅敌人不可见时使用）========================
// =================================================================
function tacticalWander(me, enemy, game, mx, my, dir, frame, map, enemyPos) {
  if (enemyPos) {
    // 敌位置已知但不可见(隐身/闪烁): 仍要开火压制, 而非只求位不动手 —— 修复对隐身炮手 shotsFired=0 活靶
    // 已对齐 enemyPos 且射线清晰 → 直接朝敌开火(盲射, 逼敌暴露/打断其节奏); 否则继续求位移动
    if (!me.bullet && !safeStatus(me).fireLocked
        && (mx === enemyPos[0] || my === enemyPos[1])
        && isLineClear(mx, my, enemyPos[0], enemyPos[1], map)) {
      var _fd0 = getDirection(mx, my, enemyPos[0], enemyPos[1]);
      if (_fd0) {
        if (dir === _fd0) { me.fire(); lastFireFrame = frame; return; }
        turnTo(me, dir, _fd0); return;
      }
    }
    seekFiringPosition(me, mx, my, dir, enemyPos[0], enemyPos[1], map);
    return;
  }

  // 敌不可见(且 P6 已无星/无近期敌踪可走): 先朝图中心预压——
  // 中心区更易获得对齐+清晰射线, 避免沿边漫游掉主动权(7374026 顶行4,2→12,2 被先手击杀)。
  if (pressCenter(me, mx, my, dir, map)) return;

  smartPatrol(me, mx, my, dir, frame, map);
}

// 朝图中心预压: 已在中心区(±2)则交回 smartPatrol 中心偏向巡逻; 否则 BFS 一步朝中心。
function pressCenter(me, mx, my, dir, map) {
  var w = mapWidth(map), h = mapHeight(map);
  var cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  if (Math.abs(mx - cx) <= 2 && Math.abs(my - cy) <= 2) return false;
  return moveToward(me, mx, my, dir, cx, cy, map);
}

// ===== BFS 全图扩散 =====
function bfsFrom(sx, sy, map) {
  if (!map || !map.length) return null;
  var xMax = map.length, yMax = map[0] ? map[0].length : 0;   // xMax=列数, yMax=行数
  var distMap = {};
  var stepMap = {};
  var key = function(x, y) { return x * 1000 + y; };
  var sk = key(sx, sy);
  distMap[sk] = 0;

  var queue = [];
  var qi = 0;
  var dirs = ['up', 'down', 'left', 'right'];
  for (var di = 0; di < dirs.length; di++) {
    var np = nextPos(sx, sy, dirs[di]);
    var nk = key(np[0], np[1]);
    if (!isValidPos(np[0], np[1], map) || isWall(np[0], np[1], map)) continue;
    distMap[nk] = 1;
    stepMap[nk] = dirs[di];
    queue.push([np[0], np[1]]);
  }

  while (qi < queue.length && qi < 500) {
    var cur = queue[qi++];
    var ck = key(cur[0], cur[1]);
    var d = distMap[ck];
    var fd = stepMap[ck];
    for (var di = 0; di < dirs.length; di++) {
      var np = nextPos(cur[0], cur[1], dirs[di]);
      var nk = key(np[0], np[1]);
      if (!isValidPos(np[0], np[1], map) || isWall(np[0], np[1], map)) continue;
      if (distMap.hasOwnProperty(nk)) continue;
      distMap[nk] = d + 1;
      stepMap[nk] = fd;
      queue.push([np[0], np[1]]);
    }
  }
  return { dist: distMap, firstStep: stepMap };
}

// ===== 威胁感知寻路（实际使用安全路径）=========================
function moveTowardThreatAware(me, mx, my, dir, tx, ty, map, enemyPos, enemyFacingDir) {
  var threatCells = {};
  if (enemyPos && enemyHistory.length >= 2) {
    try {
      var recent = enemyHistory[enemyHistory.length - 1];
      var older = enemyHistory[Math.max(0, enemyHistory.length - 3)];
      var ddx = recent.x - older.x, ddy = recent.y - older.y;
      var eDir = null;
      if (Math.abs(ddx) > Math.abs(ddy) && Math.abs(ddx) > 0) eDir = ddx > 0 ? 'right' : 'left';
      else if (Math.abs(ddy) > 0) eDir = ddy > 0 ? 'down' : 'up';
      if (eDir) {
        var dv = dirVec(eDir);
        var tcx = enemyPos[0] + dv[0], tcy = enemyPos[1] + dv[1];
        while (isValidPos(tcx, tcy, map) && !isWall(tcx, tcy, map)) {
          threatCells[tcx * 1000 + tcy] = true;
          tcx += dv[0]; tcy += dv[1];
        }
      }
    } catch (e) {}
  }

  // 始终将敌车本身标记为威胁格，防止路径规划走进敌车
  if (enemyPos) {
    threatCells[enemyPos[0] * 1000 + enemyPos[1]] = true;
  }

  // 全向近敌威胁 — 仅相邻格(曼哈顿≤1)
  if (enemyPos) {
    for (var vdx = -1; vdx <= 1; vdx++) {
      for (var vdy = -1; vdy <= 1; vdy++) {
        if (Math.abs(vdx) + Math.abs(vdy) > 1 || (vdx === 0 && vdy === 0)) continue;
        var vx = enemyPos[0] + vdx, vy = enemyPos[1] + vdy;
        if (isValidPos(vx, vy, map) && !isWall(vx, vy, map))
          threatCells[vx * 1000 + vy] = true;
      }
    }
  }

  var safeDir = bfsAvoidThreatDir(mx, my, tx, ty, map, threatCells, dir);
  if (safeDir) {
    if (dir !== safeDir) turnTo(me, dir, safeDir);
    else me.go();
    return true;
  }
  return moveToward(me, mx, my, dir, tx, ty, map);
}

function bfsAvoidThreatDir(sx, sy, tx, ty, map, threatCells, prefDir) {
  if (!map || !map.length) return null;
  var xMax = map.length, yMax = map[0] ? map[0].length : 0;   // xMax=列数, yMax=行数
  var key = function(x, y) { return x * 1000 + y; };
  var visited = {};
  var parent = {};
  var firstDir = {};
  var sk = key(sx, sy);
  visited[sk] = true;
  var queue = [[sx, sy]];
  var qi = 0;
  var dirs = [[0,-1,'up'],[0,1,'down'],[-1,0,'left'],[1,0,'right']];

  while (qi < queue.length && qi < 400) {
    var cur = queue[qi++];
    var ck = key(cur[0], cur[1]);
    // [momentum] 起始格优先当前方向, 等价最短路下延续直行打破振荡
    var useDirs = dirs;
    if (cur[0] === sx && cur[1] === sy && prefDir) {
      var _pd = {up:[0,-1,'up'], down:[0,1,'down'], left:[-1,0,'left'], right:[1,0,'right']}[prefDir];
      useDirs = [_pd].concat(dirs.filter(function(d){ return d[2] !== prefDir; }));
    }
    for (var di = 0; di < useDirs.length; di++) {
      var nx = cur[0] + dirs[di][0], ny = cur[1] + dirs[di][1];
      var nk = key(nx, ny);
      if (nx < 0 || nx >= xMax || ny < 0 || ny >= yMax) continue;
      if (visited[nk] || isWall(nx, ny, map)) continue;
      if (threatCells.hasOwnProperty(nk) && !(nx === tx && ny === ty)) continue;
      visited[nk] = true;
      parent[nk] = ck;
      firstDir[nk] = (cur[0] === sx && cur[1] === sy) ? dirs[di][2] : firstDir[ck];
      if (nx === tx && ny === ty) {
        return firstDir[nk];
      }
      queue.push([nx, ny]);
    }
  }
  return null;
}

// =================================================================
// ===== 保留模块 ===================================================
// =================================================================

function survivalMode(me, enemy, game, mx, my, dir, hp, frame, map) {
  var star = game.star;
  if (star && Array.isArray(star) && star.length >= 2) {
    var sx = star[0], sy = star[1];
    if (typeof sx === 'number' && typeof sy === 'number') {
      if (moveToward(me, mx, my, dir, sx, sy, map)) return true;
    }
  }
  var enemyPos = safePos(enemy);
  if (enemyPos) {
    var awayDir = getDirection(enemyPos[0], enemyPos[1], mx, my);
    if (canMoveTo(mx, my, awayDir, map)) {
      if (dir !== awayDir) turnTo(me, dir, awayDir);
      else me.go();
      return true;
    }
  }
  var mySkill = safeSkill(me);
  var myStatus = safeStatus(me);
  if (mySkill && mySkill.remainingCooldownFrames === 0 && !myStatus.cloaked) {
    me.cloak(); lastCloakFrame = frame; return true;
  }
  return false;
}

function retreatAndFlank(me, mx, my, dir, ex, ey, dist, map) {
  if (dist < 4) {
    var awayDir = getDirection(ex, ey, mx, my);
    if (canMoveTo(mx, my, awayDir, map)) {
      if (dir !== awayDir) turnTo(me, dir, awayDir);
      else me.go();
      return true;
    }
  }
  var sides = getSideDirections(getDirection(mx, my, ex, ey));
  var best = pickBetterSide(mx, my, sides, 0, 0, map);
  if (best) {
    if (dir !== best) turnTo(me, dir, best);
    else me.go();
  }
  return true;
}

function engageAggressive(me, mx, my, dir, ex, ey, map) {
  var targetDir = getDirection(mx, my, ex, ey);
  if (canShootAt(me, mx, my, ex, ey) && dir === targetDir && isLineClear(mx, my, ex, ey, map)) {
    me.fire(); lastFireFrame = frame; return true;
  }
  if (dir !== targetDir) { turnTo(me, dir, targetDir); return true; }
  if (canMoveTo(mx, my, dir, map)) { me.go(); return true; }
  if (moveToward(me, mx, my, dir, ex, ey, map)) return true;
  var sides = getSideDirections(dir);
  var best = pickBetterSide(mx, my, sides, ex, ey, map);
  if (best) turnTo(me, dir, best);
  return true;
}

function smartPatrol(me, mx, my, dir, frame, map) {
  if (patrolDir && !canMoveTo(mx, my, patrolDir, map)) {
    patrolDir = null;
  }
  if (!patrolDir || frame - patrolFrame > 20 || stuckCounter > 3) {
    patrolDir = pickPatrolDirection(mx, my, map);
    patrolFrame = frame;
  }
  if (patrolDir && patrolDir !== dir) { turnTo(me, dir, patrolDir); return; }
  if (canMoveTo(mx, my, dir, map)) me.go();
  else {
    var sides = getSideDirections(dir);
    var best = pickBetterSide(mx, my, sides, 0, 0, map);
    if (best) { patrolDir = best; patrolFrame = frame; turnTo(me, dir, best); }
    else { var rev = reverseDir(dir); patrolDir = rev; patrolFrame = frame; turnTo(me, dir, rev); }
  }
}
function pickPatrolDirection(mx, my, map) {
  var dirs = ['up', 'down', 'left', 'right'];
  var bestDir = 'right', bestScore = -1;
  for (var di = 0; di < dirs.length; di++) {
    var d = dirs[di];
    if (!canMoveTo(mx, my, d, map)) continue;
    var space = countOpenSpace(mx, my, d, map, 8);
    var cb = getCenterBonus(mx, my, d, map);
    if (space + cb > bestScore) { bestScore = space + cb; bestDir = d; }
  }
  return bestDir;
}
function getCenterBonus(mx, my, dir, map) {
  var w = mapWidth(map), h = mapHeight(map);
  var cx = w / 2, cy = h / 2;
  var nx = mx, ny = my;
  if (dir === 'up') ny--; else if (dir === 'down') ny++;
  else if (dir === 'left') nx--; else if (dir === 'right') nx++;
  // 中心偏向权重 0.3→1.5: 的 0.3 被 countOpenSpace 压制导致沿边漫游掉主动权; 真实对手在中心区交火, 预压中心更易获得对齐
  return ((Math.abs(mx - cx) + Math.abs(my - cy)) - (Math.abs(nx - cx) + Math.abs(ny - cy))) * 1.5;
}

// ===== 捡星决策（集中入口）：方向安全 + 路径成本 + 抢星遏制 + 超时分级 =====
// 返回 true=本帧已朝星移动(上层应 return); false=本帧不捡星(交还后续逻辑)。
function starInLane(stx, sty, ex, ey, edir, map) {
  if (!edir) return false;
  var dv = dirVec(edir);
  if (!dv) return false;
  var cx = ex + dv[0], cy = ey + dv[1], steps = 0;
  while (isValidPos(cx, cy, map) && !isWall(cx, cy, map) && steps < 14) {
    if (cx === stx && cy === sty) return true;
    cx += dv[0]; cy += dv[1]; steps++;
  }
  return false;
}

function decideStarMove(me, mx, my, dir, star, enemyPos, enemyVisible, enemyCanFireSoon, enemyFacingDir, lead, frame, map, isTimeout) {
  if (!star || !Array.isArray(star) || star.length < 2) return false;
  var stx = star[0], sty = star[1];
  if (typeof stx !== 'number' || typeof sty !== 'number') return false;
  var mk = mx * 1000 + my;
  var ek = enemyPos ? (enemyPos[0] * 1000 + enemyPos[1]) : -1;

  // 一次 BFS 从星扩散: 同时得我/敌到星距离(路径成本, 非曼哈顿)
  
  // Enhanced fire lane avoidance for star selection
  if (enemyVisible && enemyPos && starPositions && starPositions.length > 1) {
    for (var v7i = 0; v7i < starPositions.length; v7i++) {
      var v7s = starPositions[v7i];
      var v7inLane = starInLane(v7s.x, v7s.y, enemyPos[0], enemyPos[1], enemyFacingDir, map);
      if (v7inLane && v7s.x === stx && v7s.y === sty) {
        for (var v7j = 0; v7j < starPositions.length; v7j++) {
          if (v7j === v7i) continue;
          var v7alt = starPositions[v7j];
          var v7altLane = starInLane(v7alt.x, v7alt.y, enemyPos[0], enemyPos[1], enemyFacingDir, map);
          if (!v7altLane) {
            var v7altMk = v7alt.x * 1000 + v7alt.y;
            if (sf.dist[v7altMk] !== undefined) {
              var v7altDist = sf.dist[v7altMk];
              if (v7altDist <= STAR_CHASE_BFS) {
                var v7safeFlag = true;
                if (enemyVisible && enemyPos) {
                  var v7ef = bfsFrom(enemyPos[0], enemyPos[1], map);
                  if (v7ef && v7ef.dist[mk] !== undefined) {
                    var v7me2enemy = v7ef.dist[mk];
                    var v7enemyD2Alt = v7ef.dist[v7altMk] !== undefined ? v7ef.dist[v7altMk] : 999;
                    v7safeFlag = (v7enemyD2Alt >= v7me2enemy - STAR_LANE_PENALTY);
                  }
                }
                if (v7safeFlag && !v7altLane) {
                  return moveTowardThreatAware(me, mx, my, dir, v7alt.x, v7alt.y, map, enemyPos, enemyFacingDir);
                }
              }
            }
          }
        }
      }
    }
  }
var sf = bfsFrom(stx, sty, map);
  if (!sf || sf.dist[mk] === undefined) return false; // 星不可达
  var d2star = sf.dist[mk];
  var enemyD2Star = (enemyPos && sf.dist[ek] !== undefined) ? sf.dist[ek] : 999;

  // 方向安全: 捡星后我距敌(enemyD2Star) ≥ 当前距敌(me2enemy) => 去星不更靠近敌。
  // 注意: 不能用"去星再绕到敌的路径长 ≥ 当前到敌"——当星在敌我连线上时会误判为安全。
  var safeDirFlag = true;
  if (enemyVisible && enemyPos) {
    var ef = bfsFrom(enemyPos[0], enemyPos[1], map);
    if (ef && ef.dist[mk] !== undefined) {
      var me2enemy = ef.dist[mk];
      safeDirFlag = (enemyD2Star >= me2enemy - STAR_LANE_PENALTY);
    }
  }

  // 星在敌即时火力线内(且敌即将开火) -> 仅极近才捡; 敌无法立即开火时不过度限制(方向安全已够)
  var inLane = (enemyVisible && enemyPos && enemyCanFireSoon && enemyFacingDir)
               ? starInLane(stx, sty, enemyPos[0], enemyPos[1], enemyFacingDir, map) : false;

  // 1) 超时 + 落后(lead<0) -> 冲刺抢星(最高优先, 可冒小险; 仅避开敌即时火力线内的星)
  if (isTimeout && lead < 0) {
    if (d2star <= STAR_RACE_DIST && (!inLane || d2star <= STAR_OPP_DIST)) {
      return moveTowardThreatAware(me, mx, my, dir, stx, sty, map, enemyPos, enemyFacingDir);
    }
  }
  // 2) 超时 + 领先/平 -> 不顺星(交由避战拖延), 仅极近顺手
  if (isTimeout && lead >= 0) {
    if (d2star <= 1) return moveTowardThreatAware(me, mx, my, dir, stx, sty, map, enemyPos, enemyFacingDir);
    return false;
  }
  // 3) 闲时 opportunistic: 极近星顺手捡(方向安全且非火力线)
  if (d2star <= STAR_OPP_DIST && safeDirFlag && !inLane) {
    return moveTowardThreatAware(me, mx, my, dir, stx, sty, map, enemyPos, enemyFacingDir);
  }
  // 4b) 平手/落后且我到星不比敌远 → 抢星优先(即便敌可见且可能开火);
  //     仅排除敌即时火力线内的星(inLane 真危险, 交 P2/P0.6 隐身处理)。覆盖"平手 0-0 且敌为战斗型"被 P3 纯交战吞掉的争星机会。
  //     d2star <= enemyD2Star+1 保证星至少同样可达(不送无意义冲星); safeDirFlag 防踏入敌身位; 全程复用 moveTowardThreatAware 避弹。
  if (lead <= 0 && d2star <= enemyD2Star + 1 && safeDirFlag && !inLane && d2star <= STAR_CHASE_BFS) {
    return moveTowardThreatAware(me, mx, my, dir, stx, sty, map, enemyPos, enemyFacingDir);
  }
  // 4) 方向安全中距追: 敌可见时要求 safeDir + 非敌即时开火窗口 + 非火力线(替代原 8 格硬门槛)
  if (safeDirFlag && (!enemyVisible || (!enemyCanFireSoon && !inLane)) && d2star <= STAR_CHASE_BFS) {
    return moveTowardThreatAware(me, mx, my, dir, stx, sty, map, enemyPos, enemyFacingDir);
  }
  // 5) 抢星遏制(lead<0 且我离星更近且方向安全且非火力线) — P2 分支内 lead<0 已满足
  if (lead < 0 && d2star < enemyD2Star && safeDirFlag && !inLane && d2star <= STAR_CHASE_BFS) {
    return moveTowardThreatAware(me, mx, my, dir, stx, sty, map, enemyPos, enemyFacingDir);
  }
  return false;
}

// ===== BFS =====
function bfs(startX, startY, targetX, targetY, map, prefDir) {
  if (!map || !map.length) return null;
  var xMax = map.length, yMax = map[0] ? map[0].length : 0;   // xMax=列数, yMax=行数
  if (startX < 0 || startX >= xMax || startY < 0 || startY >= yMax) return null;
  if (targetX < 0 || targetX >= xMax || targetY < 0 || targetY >= yMax) return null;
  if (isWall(targetX, targetY, map)) return null;
  var visited = {}, parent = {};
  var key = function(x, y) { return x * 1000 + y; };
  var startKey = key(startX, startY);
  visited[startKey] = true;
  var queue = [[startX, startY]], qi = 0;
  while (qi < queue.length && qi < 400) {
    var cur = queue[qi++];
    var x = cur[0], y = cur[1];
    if (x === targetX && y === targetY) {
      var path = [], k = key(targetX, targetY);
      while (k !== startKey) {
        var p = parent[k];
        if (p === undefined) return null;
        path.unshift([Math.floor(k / 1000), k % 1000]);
        k = p;
      }
      return path;
    }
    // [momentum] 起始格优先尝试当前行进方向, 等价最短路下延续直行可打破两格振荡
    var neighbors;
    if (x === startX && y === startY && prefDir) {
      var _def = ['up', 'down', 'left', 'right'];
      var _ord = [prefDir];
      for (var _di = 0; _di < 4; _di++) if (_def[_di] !== prefDir) _ord.push(_def[_di]);
      neighbors = [];
      for (var _oi2 = 0; _oi2 < 4; _oi2++) {
        var _d = _ord[_oi2];
        if (_d === 'up') neighbors.push([x-1, y]);
        else if (_d === 'down') neighbors.push([x+1, y]);
        else if (_d === 'left') neighbors.push([x, y-1]);
        else neighbors.push([x, y+1]);
      }
    } else {
      neighbors = [[x-1, y], [x+1, y], [x, y-1], [x, y+1]];
    }
    for (var ni = 0; ni < neighbors.length; ni++) {
      var n = neighbors[ni], nx = n[0], ny = n[1];
      if (nx < 0 || nx >= xMax || ny < 0 || ny >= yMax) continue;
      var nk = key(nx, ny);
      if (visited[nk] || isWall(nx, ny, map)) continue;
      visited[nk] = true;
      parent[nk] = key(x, y);
      queue.push([nx, ny]);
    }
  }
  return null;
}

function moveToward(me, mx, my, dir, tx, ty, map) {
  var path = bfs(mx, my, tx, ty, map, dir);
  if (!path || path.length === 0) return false;
  var nx = path[0][0], ny = path[0][1];
  var nextDir = getDirection(mx, my, nx, ny);
  if (nextDir !== dir) { turnTo(me, dir, nextDir); return true; }
  me.go();
  return true;
}

// ===== Teleport 目标合法性 & 落点选择 =====
// 手册约束: 落点须在图内、非墙/非土堆('x'/'m')、非敌坦克格、非敌子弹格; 无效落点仍消耗冷却→务必先校验。
function teleportTargetValid(tx, ty, enemyPos, eBullet, map) {
  if (!isValidPos(tx, ty, map)) return false;
  if (isWall(tx, ty, map)) return false;
  // 落点须与敌人保持 >=2 曼哈顿距离: 相邻(=1)落点下一帧敌移动即碰撞自毁(近期6连败共因)
  if (enemyPos) {
    var _tvMan = Math.abs(tx - enemyPos[0]) + Math.abs(ty - enemyPos[1]);
    if (_tvMan <= 1) return false;
  }
  if (eBullet && eBullet.position && Array.isArray(eBullet.position)
      && tx === eBullet.position[0] && ty === eBullet.position[1]) return false;
  return true;
}
// 沿朝目标的 BFS 路径向前跳 3~5 格(把空转变为真实位移); 无路径则扫描外环取一合法开阔格。
function tryTeleportToward(me, mx, my, gx, gy, enemyPos, eBullet, map) {
  var cand = null;
  var path = bfs(mx, my, gx, gy, map, null);
  if (path && path.length) {
    var idx = Math.min(3, path.length - 1);
    cand = path[idx];
    // 落点距敌 Manhattan≤4 会有 2 帧火锁; 若路径更长则优先跳更远以避开火锁
    if (enemyPos) {
      var man = Math.abs(cand[0] - enemyPos[0]) + Math.abs(cand[1] - enemyPos[1]);
      if (man <= 4 && path.length - 1 > idx) {
        var c2 = path[Math.min(5, path.length - 1)];
        if (teleportTargetValid(c2[0], c2[1], enemyPos, eBullet, map)) cand = c2;
      }
    }
  }
  if (!(cand && teleportTargetValid(cand[0], cand[1], enemyPos, eBullet, map))) {
    cand = null;
    var offs = [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [2, -2], [-2, 2], [-2, -2], [4, 0], [-4, 0], [0, 4], [0, -4]];
    // 第一轮: 优先选不与敌人共线的落点(避免传送后落在敌火力线被秒, 修 vs Tank-M5B9K2/lynden)
    if (enemyPos) {
      for (var oi0 = 0; oi0 < offs.length; oi0++) {
        var tx0 = mx + offs[oi0][0], ty0 = my + offs[oi0][1];
        if (tx0 === enemyPos[0] || ty0 === enemyPos[1]) continue; // 共线, 跳过
        if (teleportTargetValid(tx0, ty0, enemyPos, eBullet, map)) { cand = [tx0, ty0]; break; }
      }
    }
    // 第二轮: 无非共线落点则放宽到任意合法落点
    if (!cand) {
      for (var oi = 0; oi < offs.length; oi++) {
        var tx = mx + offs[oi][0], ty = my + offs[oi][1];
        if (teleportTargetValid(tx, ty, enemyPos, eBullet, map)) { cand = [tx, ty]; break; }
      }
    }
  }
  if (cand && teleportTargetValid(cand[0], cand[1], enemyPos, eBullet, map)) {
    try { me.teleport(cand[0], cand[1]); return true; } catch (e) {}
  }
  return false;
}

// 来袭弹是否将在 ~5 帧内命中我或我的下一格(用于 P0.3D 即死威胁判定)
function bulletThreat(bullet, mx, my, dir, map) {
  try {
    var bx = bullet.position[0], by = bullet.position[1];
    var bdir = bullet.direction;
    var ddx = 0, ddy = 0;
    if (bdir === 'up') ddy = -1; else if (bdir === 'down') ddy = 1;
    else if (bdir === 'left') ddx = -1; else if (bdir === 'right') ddx = 1;
    var np = nextPos(mx, my, dir);
    for (var i = 0; i <= 5; i++) {
      var px = bx + ddx * i, py = by + ddy * i;
      if (px === mx && py === my) return true;
      if (px === np[0] && py === np[1]) return true;
    }
  } catch (e) {}
  return false;
}

// 朝垂直于来袭弹的方向选逃逸落点(脱离弹道所在行/列), 复用 tryTeleportToward 的落点校验与跳跃。
// 关键修正: v4 版 P0.3D 用"以敌为镜"的落点, 竖直弹时仍落在子弹所在列→仍中弹; 此处强制脱离子弹当前列/行。
function tryTeleportAway(me, mx, my, enemyPos, eBullet, map) {
  try {
    if (!eBullet || !eBullet.position || !eBullet.direction) return false;
    var bdir = eBullet.direction;
    var bcol = eBullet.position[0], brow = eBullet.position[1];
    // 弹道所在轴: 竖直弹(up/down)→横向逃离; 水平弹(left/right)→纵向逃离
    var perps = (bdir === 'up' || bdir === 'down')
      ? [[2,0],[-2,0],[3,0],[-3,0],[4,0],[-4,0],[2,1],[-2,1],[1,2],[-1,2],[2,-1],[-2,-1]]
      : [[0,2],[0,-2],[0,3],[0,-3],[0,4],[0,-4],[1,2],[-1,2],[2,1],[-2,1],[1,-2],[-1,-2]];
    // 优先: 完全脱离弹道轴(不在子弹当前列/行)的合法落点
    for (var k = 0; k < perps.length; k++) {
      var gx = mx + perps[k][0], gy = my + perps[k][1];
      if (!teleportTargetValid(gx, gy, enemyPos, eBullet, map)) continue;
      var offAxis = (bdir === 'up' || bdir === 'down') ? (gx !== bcol) : (gy !== brow);
      if (!offAxis) continue;
      if (tryTeleportToward(me, mx, my, gx, gy, enemyPos, eBullet, map)) return true;
    }
    // 兜底: 任意合法落点(若上面都不可达, 至少离开当前格)
    for (var k2 = 0; k2 < perps.length; k2++) {
      var gx2 = mx + perps[k2][0], gy2 = my + perps[k2][1];
      if (teleportTargetValid(gx2, gy2, enemyPos, eBullet, map)) {
        if (tryTeleportToward(me, mx, my, gx2, gy2, enemyPos, eBullet, map)) return true;
      }
    }
  } catch (e) {}
  return false;
}

// ===== 基础工具 =====
function dirVec(dir) {
  if (dir === 'up') return [0, -1];
  if (dir === 'down') return [0, 1];
  if (dir === 'left') return [-1, 0];
  if (dir === 'right') return [1, 0];
  return [0, 0];
}
function rightTurns(from, to) {
  var order = ['up', 'right', 'down', 'left'];
  return (order.indexOf(to) - order.indexOf(from) + 4) % 4;
}
function getDirection(fromX, fromY, toX, toY) {
  var dx = toX - fromX, dy = toY - fromY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : dx < 0 ? 'left' : (dy > 0 ? 'down' : 'up');
  return dy > 0 ? 'down' : dy < 0 ? 'up' : (dx > 0 ? 'right' : dx < 0 ? 'left' : 'right');
}
function turnTo(me, currentDir, targetDir) {
  var dirs = ['up', 'right', 'down', 'left'];
  var ci = dirs.indexOf(currentDir), ti = dirs.indexOf(targetDir);
  if (ci < 0 || ti < 0) return;
  // === 转向 hysteresis（中断甩头死锁）===
  if (_curFrame < _dirLockUntil && _dirLockDir) {
    // 锁定中: 强制朝锁定方向转; 已对齐(ci===ti)即 return, 调用方随后 me.go() 前进
    targetDir = _dirLockDir; ti = dirs.indexOf(targetDir);
    if (ci === ti) return;
  } else {
    // 未锁定: 检测最近 WIGGLE_WINDOW 帧内相反翻转 (wiggle 特征: desired-facing 在相反 cardinal 间反复跳)
    // 放宽"连续帧"约束 —— 真 wiggle 常穿插无动作帧(turnTo 未被调用)打断旧检测, 致锁失效;
    //       现允许窗口内(默认4帧)穿插空转仍累计翻转次数, 更稳地压住甩头, 且不误伤正常单次方向修正。
    if (_lastTurnTarget && isOppositeDir(_lastTurnTarget, targetDir)) {
      if (_curFrame - _lastTurnFrame <= WIGGLE_WINDOW) _wiggleStreak++;
      else _wiggleStreak = 1;  // 中断后重新起算
    } else {
      _wiggleStreak = 0;
    }
    _lastTurnTarget = targetDir; _lastTurnFrame = _curFrame;
    if (_wiggleStreak >= WIGGLE_LOCK_THRESHOLD) {
      _dirLockDir = targetDir; _dirLockUntil = _curFrame + WIGGLE_LOCK_FRAMES; _wiggleStreak = 0;
    }
  }
  if (ci === ti) return;
  var diff = (ti - ci + 4) % 4;
  me.turn(diff === 1 ? 'right' : 'left');
}
function canMoveTo(x, y, dir, map) {
  var n = nextPos(x, y, dir);
  return isValidPos(n[0], n[1], map) && !isWall(n[0], n[1], map);
}
function nextPos(x, y, dir) {
  if (dir === 'up') return [x, y - 1];
  if (dir === 'down') return [x, y + 1];
  if (dir === 'left') return [x - 1, y];
  if (dir === 'right') return [x + 1, y];
  return [x, y];
}
function isValidPos(x, y, map) {
  if (!map || !map.length) return false;
  if (x < 0 || x >= map.length) return false;
  if (!map[x] || y < 0 || y >= map[x].length) return false;
  return true;
}
function isWall(x, y, map) {
  var c = getCell(x, y, map);
  return c === 'x' || c === 'm';
}
function getCell(x, y, map) {
  // 约定已通过回放事件反证: 服务器 position=[row,col]=[x,y], 地图为 grid[row][col]=grid[x][y].
  // 故 map[x][y] 即为正确读取, 切勿再改为 map[y][x] (会整体转置导致导航撞墙).
  if (!map || !map.length) return 'x';
  if (x < 0 || x >= map.length) return 'x';
  if (!map[x] || y < 0 || y >= map[x].length) return 'x';
  var c = map[x][y];
  return (typeof c === 'string') ? c : 'x';
}
function mapWidth(map) { return map ? map.length : 0; }
function mapHeight(map) { return (map && map[0]) ? map[0].length : 0; }
function canShootAt(me, mx, my, ex, ey) {
  if (me.bullet) return false;
  if (safeStatus(me).fireLocked) return false;
  if (mx !== ex && my !== ey) return false;
  return true;
}
function isLineClear(x1, y1, x2, y2, map) {
  if (x1 !== x2 && y1 !== y2) return false;
  var dx = x2 > x1 ? 1 : x2 < x1 ? -1 : 0;
  var dy = y2 > y1 ? 1 : y2 < y1 ? -1 : 0;
  var cx = x1 + dx, cy = y1 + dy;
  while (cx !== x2 || cy !== y2) {
    if (isWall(cx, cy, map)) return false;
    cx += dx; cy += dy;
  }
  return true;
}
function countAxisClear(mx, my, target, axis, map) {
  var count = 0;
  if (axis === 'x') {
    if (mx === target) return 99;
    var step = target > mx ? 1 : -1;
    for (var x = mx + step; ; x += step) {
      if (isWall(x, my, map)) break;
      count++;
      if (x === target) break;
    }
  } else {
    if (my === target) return 99;
    var step = target > my ? 1 : -1;
    for (var y = my + step; ; y += step) {
      if (isWall(mx, y, map)) break;
      count++;
      if (y === target) break;
    }
  }
  return count;
}
function moveToAxis(me, mx, my, dir, target, axis, map) {
  var targetDir;
  var goalX, goalY;
  if (axis === 'x') {
    if (mx === target) return false;
    targetDir = target > mx ? 'right' : 'left';
    goalX = target; goalY = my;
  } else {
    if (my === target) return false;
    targetDir = target > my ? 'down' : 'up';
    goalX = mx; goalY = target;
  }
  if (dir === targetDir) {
    if (canMoveTo(mx, my, dir, map)) { me.go(); return true; }
    if (moveToward(me, mx, my, dir, goalX, goalY, map)) return true;
    var sides = getSideDirections(dir);
    var best = pickBetterSide(mx, my, sides, target, axis === 'x' ? my : mx, map);
    if (best) turnTo(me, dir, best);
    else me.go();
    return true;
  }
  turnTo(me, dir, targetDir);
  return true;
}
function countOpenSpace(x, y, dir, map, maxSteps) {
  var count = 0, nx = x, ny = y;
  for (var i = 0; i < maxSteps; i++) {
    var n = nextPos(nx, ny, dir);
    if (!isValidPos(n[0], n[1], map) || isWall(n[0], n[1], map)) break;
    count++; nx = n[0]; ny = n[1];
  }
  return count;
}
function getSideDirections(dir) {
  return (dir === 'up' || dir === 'down') ? ['left', 'right'] : ['up', 'down'];
}
function reverseDir(dir) {
  return { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' }[dir] || dir;
}
function pickBetterSide(mx, my, sideDirs, tx, ty, map) {
  var bestDir = null, bestScore = -1;
  for (var si = 0; si < sideDirs.length; si++) {
    var d = sideDirs[si];
    if (!canMoveTo(mx, my, d, map)) continue;
    var space = countOpenSpace(mx, my, d, map, 6);
    var score = space;
    if (tx || ty) {
      var n = nextPos(mx, my, d);
      score += ((Math.abs(mx - tx) + Math.abs(my - ty)) - (Math.abs(n[0] - tx) + Math.abs(n[1] - ty))) * 2;
    }
    if (score > bestScore) { bestScore = score; bestDir = d; }
  }
  return bestDir;
}

// =================================================================
// ===== 草丛/隐身伏击规避 ====================================
// 规则: 敌人站草丛('o')或隐身时 enemy.tank 被隐藏(enemyPos=null)。草丛不挡子弹/移动,
//   故敌可藏草丛沿同行/同列开火伏击, 而我方看不到它。真实败局 mat_5Zx8eZGoYtn7ptBO0:
//   我方收星后停在开阔列上被藏身/预判的敌人一枪点杀(f38)。
// 防御: 敌人当前不可见但有最后已知位置(lastEnemyPos)时, 若我方正落在"与最后敌位同行/同列
//   且中间无墙阻挡(isLineClear)"的潜在伏击线上, 且距离够近(<=8, 伏击射程内), 则垂直脱离该线一步,
//   使敌人即使开火也打不中我。仅在此明确威胁下介入; 无最后敌位/不在伏击线/太远 → 完全不动, 交回原逻辑。
// 返回 true 表示本帧已行动(上层应 return)。
function avoidGrassAmbush(me, mx, my, dir, lastEnemyPos, map, frame) {
  if (!lastEnemyPos) return false;
  var ex = lastEnemyPos[0], ey = lastEnemyPos[1];
  var onLine = (mx === ex) || (my === ey);
  if (!onLine) return false;
  // 中间无墙(草丛不算墙) → 敌可沿此线开火命中我
  if (!isLineClear(mx, my, ex, ey, map)) return false;
  var dist = Math.abs(ex - mx) + Math.abs(ey - my);
  if (dist > 8 || dist < 1) return false;   // 太远非伏击射程; 距离0=同格(异常)不处理
  // 垂直于伏击线脱离一步(敌在我列→横向走; 敌在我行→纵向走)
  var perpDirs = (mx === ex) ? ['left', 'right'] : ['up', 'down'];
  var best = pickBetterSide(mx, my, perpDirs, 0, 0, map);
  if (best) {
    if (dir === best) me.go(); else turnTo(me, dir, best);
    return true;
  }
  return false;
}