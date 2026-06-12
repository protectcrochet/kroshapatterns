/**
 * BattleScene — Combate automático 4v4 dentro del domo.
 *
 * Motor por turnos: en cada turno actúa el luchador vivo más rápido que aún
 * no ha actuado en la ronda; al agotarse la ronda, vuelve a empezar.
 * Targeting: golpea al enemigo vivo con menos HP.
 * Habilidad: cada `specialEveryTurns` acciones propias, el luchador usa su
 * habilidad de rol (variantes simples por rol).
 */
class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  init(data) {
    this.playerIds = data.playerIds;
    this.enemyIds = data.enemyIds;
    this.playerTeamId = data.playerTeam;
    this.enemyTeamId = data.enemyTeam;
  }

  create() {
    this.colors = TEAM_COLORS[this.playerTeamId];
    DomeArt.drawDome(this, this.colors);

    this.add.text(480, 30, 'ARENA DEL DOMO', {
      fontFamily: 'Nunito, sans-serif', fontSize: '22px', fontStyle: '900', color: '#ffffff',
    }).setOrigin(0.5).setShadow(0, 0, this.colors.glow, 14);

    // Construye las unidades de combate a partir de los stats base.
    this.playerUnits = this.buildUnits(this.playerIds, this.playerTeamId, 'player');
    this.enemyUnits = this.buildUnits(this.enemyIds, this.enemyTeamId, 'enemy');

    this.layoutUnits(this.playerUnits, 250, true);
    this.layoutUnits(this.enemyUnits, 710, false);

    this.turnIndex = 0;
    this.actionCount = {}; // id -> nº de acciones (para habilidades)
    this.battleOver = false;

    // Pequeña cuenta atrás antes de empezar.
    this.showCountdown(() => this.nextTurn());
  }

  buildUnits(ids, teamId, side) {
    const colors = TEAM_COLORS[teamId];
    return ids.map((id) => {
      const base = getCharacter(id);
      return {
        ...base,
        side,
        colors,
        maxHp: base.hp,
        curHp: base.hp,
        alive: true,
        atkMod: 1,        // modificador temporal de ataque (buffs/debuffs)
        sprite: null,
        hpBar: null,
        hpBarBg: null,
      };
    });
  }

  layoutUnits(units, baseX, isPlayer) {
    const startY = 150, gap = 95;
    units.forEach((u, i) => {
      const x = baseX;
      const y = startY + i * gap;
      const fighter = DomeArt.makeFighter(this, x, y, u, u.colors, 0.85);
      u.sprite = fighter;
      u.x = x; u.y = y;

      // Nombre
      this.add.text(x, y + 34, u.name, {
        fontFamily: 'Nunito, sans-serif', fontSize: '12px', fontStyle: '700', color: '#ffffff',
      }).setOrigin(0.5);

      // Barra de vida
      const barW = 70;
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.5);
      bg.fillRoundedRect(x - barW / 2, y - 44, barW, 8, 4);
      const bar = this.add.graphics();
      u.hpBar = bar; u.hpBarW = barW;
      this.drawHpBar(u);
    });
  }

  drawHpBar(u) {
    const barW = u.hpBarW;
    const pct = Phaser.Math.Clamp(u.curHp / u.maxHp, 0, 1);
    u.hpBar.clear();
    const color = pct > 0.5 ? 0x57e389 : pct > 0.25 ? 0xffd34d : 0xff6b6b;
    u.hpBar.fillStyle(color, 1);
    u.hpBar.fillRoundedRect(u.x - barW / 2, u.y - 44, barW * pct, 8, 4);
  }

  showCountdown(done) {
    const txt = this.add.text(480, 300, '3', {
      fontFamily: 'Nunito, sans-serif', fontSize: '90px', fontStyle: '900', color: '#ffffff',
    }).setOrigin(0.5).setShadow(0, 0, this.colors.glow, 24);

    // Secuencia con delayedCall independientes (fiable bajo render lento):
    // "3" → "2" → "1" → "¡PELEA!" → arranca el combate.
    const steps = ['2', '1', '¡PELEA!'];
    steps.forEach((label, i) => {
      this.time.delayedCall(600 * (i + 1), () => {
        if (!this.scene.isActive()) return;
        txt.setText(label);
        txt.setScale(1.4);
        this.tweens.add({ targets: txt, scale: 1, duration: 250 });
      });
    });

    this.time.delayedCall(600 * (steps.length + 1), () => {
      txt.destroy();
      if (this.scene.isActive() && !this.battleOver) done();
    });
  }

  // ---------- Bucle de turnos ----------
  nextTurn() {
    if (this.battleOver) return;

    const allAlive = [...this.playerUnits, ...this.enemyUnits].filter((u) => u.alive);
    // Orden de iniciativa por velocidad (con pequeño desempate aleatorio estable).
    const actor = this.pickActor(allAlive);
    if (!actor) { this.endRound(); return; }

    const enemies = (actor.side === 'player' ? this.enemyUnits : this.playerUnits).filter((u) => u.alive);
    if (enemies.length === 0) { this.finish(actor.side); return; }

    this.actionCount[actor.id] = (this.actionCount[actor.id] || 0) + 1;
    const useSpecial = this.actionCount[actor.id] % GAME_CONFIG.battle.specialEveryTurns === 0;

    if (useSpecial) this.performSpecial(actor, enemies);
    else this.performAttack(actor, enemies);
  }

  pickActor(units) {
    // Marca de ronda: cada unidad actúa una vez por ronda.
    const pending = units.filter((u) => !u._actedThisRound);
    const pool = pending.length ? pending : units.map((u) => { u._actedThisRound = false; return u; });
    pool.sort((a, b) => b.spd - a.spd);
    const actor = pool[0];
    if (actor) actor._actedThisRound = true;
    return actor;
  }

  endRound() {
    [...this.playerUnits, ...this.enemyUnits].forEach((u) => { u._actedThisRound = false; });
    this.time.delayedCall(GAME_CONFIG.battle.turnDelayMs, () => this.nextTurn());
  }

  // ---------- Acciones ----------
  performAttack(actor, enemies) {
    const target = enemies.reduce((lo, u) => (u.curHp < lo.curHp ? u : lo), enemies[0]);
    const dmg = Math.round(actor.atk * actor.atkMod * Phaser.Math.FloatBetween(0.85, 1.15));
    this.lungeAndHit(actor, target, dmg, this.colors.glow);
  }

  performSpecial(actor, enemies) {
    const allies = (actor.side === 'player' ? this.playerUnits : this.enemyUnits).filter((u) => u.alive);
    switch (actor.role) {
      case 'Healer': {
        const ally = allies.reduce((lo, u) => (u.curHp / u.maxHp < lo.curHp / lo.maxHp ? u : lo), allies[0]);
        const heal = Math.round(actor.atk * 2.2);
        ally.curHp = Math.min(ally.maxHp, ally.curHp + heal);
        this.drawHpBar(ally);
        this.floatText(ally, `+${heal}`, '#57e389');
        this.pulse(actor);
        this.afterAction();
        break;
      }
      case 'Support': {
        allies.forEach((u) => { u.atkMod = 1.3; });
        this.floatText(actor, 'ATK ↑', '#ffd34d');
        this.pulse(actor);
        this.afterAction();
        break;
      }
      case 'Shooter': {
        // Daño en área a los dos enemigos con menos HP.
        const targets = [...enemies].sort((a, b) => a.curHp - b.curHp).slice(0, 2);
        const dmg = Math.round(actor.atk * actor.atkMod * 0.8);
        targets.forEach((t) => this.applyDamage(t, dmg, this.colors.glow));
        this.pulse(actor);
        this.afterAction();
        break;
      }
      case 'Control': {
        const target = enemies.reduce((lo, u) => (u.curHp < lo.curHp ? u : lo), enemies[0]);
        target.atkMod = 0.7; // ralentiza/debilita
        const dmg = Math.round(actor.atk * actor.atkMod);
        this.lungeAndHit(actor, target, dmg, this.colors.glow, () => this.floatText(target, 'SLOW', '#9b5de5'));
        break;
      }
      default: {
        // Tank/Bruiser: golpe potente.
        const target = enemies.reduce((lo, u) => (u.curHp < lo.curHp ? u : lo), enemies[0]);
        const dmg = Math.round(actor.atk * actor.atkMod * 1.8);
        this.lungeAndHit(actor, target, dmg, '#ffffff');
      }
    }
  }

  lungeAndHit(actor, target, dmg, color, extra) {
    const ox = actor.sprite.x, oy = actor.sprite.y;
    const dir = actor.side === 'player' ? 1 : -1;
    this.tweens.add({
      targets: actor.sprite,
      x: ox + dir * 40, duration: 140, yoyo: true, ease: 'Quad.easeOut',
      onYoyo: () => {
        this.applyDamage(target, dmg, color);
        if (extra) extra();
      },
      onComplete: () => this.afterAction(),
    });
  }

  applyDamage(target, dmg, color) {
    // Obsidian/“refleja”: simplificación — Tanks de sombra reflejan 20%.
    target.curHp = Math.max(0, target.curHp - dmg);
    this.drawHpBar(target);
    this.floatText(target, `-${dmg}`, color);
    this.cameras.main.shake(80, 0.003);
    this.tweens.add({ targets: target.sprite, alpha: 0.4, duration: 60, yoyo: true });

    if (target.curHp <= 0 && target.alive) {
      target.alive = false;
      this.tweens.add({
        targets: target.sprite, alpha: 0, scale: 0.4, angle: 90, duration: 350,
        onComplete: () => target.sprite.setVisible(false),
      });
    }
  }

  pulse(unit) {
    this.tweens.add({ targets: unit.sprite, scale: 1.05, duration: 120, yoyo: true });
  }

  floatText(unit, text, color) {
    const t = this.add.text(unit.x, unit.y - 50, text, {
      fontFamily: 'Nunito, sans-serif', fontSize: '18px', fontStyle: '900', color,
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: unit.y - 90, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  afterAction() {
    if (this.battleOver) return;
    const playersAlive = this.playerUnits.some((u) => u.alive);
    const enemiesAlive = this.enemyUnits.some((u) => u.alive);
    if (!playersAlive || !enemiesAlive) {
      this.finish(playersAlive ? 'player' : 'enemy');
      return;
    }
    this.time.delayedCall(GAME_CONFIG.battle.turnDelayMs, () => this.nextTurn());
  }

  finish(winnerSide) {
    if (this.battleOver) return;
    this.battleOver = true;
    const playerWon = winnerSide === 'player';
    this.time.delayedCall(700, () => {
      this.scene.start('ResultScene', {
        playerWon,
        playerTeam: this.playerTeamId,
        survivors: this.playerUnits.filter((u) => u.alive).length,
      });
    });
  }
}

window.BattleScene = BattleScene;
