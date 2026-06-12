/**
 * SelectScene — El jugador elige 4 de los 8 personajes de su equipo.
 * Fondo: interior del domo dibujado con Graphics (sin assets externos).
 */
class SelectScene extends Phaser.Scene {
  constructor() {
    super('SelectScene');
    this.selected = new Set();
  }

  create() {
    this.selected.clear();
    const teamId = sessionStorage.getItem('funDome.team') || 'light';
    this.teamId = teamId;
    this.team = getTeam(teamId);
    this.colors = TEAM_COLORS[teamId];

    DomeArt.drawDome(this, this.colors);

    // Título
    this.add.text(480, 44, 'ELIGE TU ESCUADRÓN', {
      fontFamily: 'Nunito, sans-serif', fontSize: '30px', fontStyle: '900',
      color: '#ffffff',
    }).setOrigin(0.5).setShadow(0, 0, this.colors.glow, 18);

    this.add.text(480, 78, `${this.colors.name} · selecciona 4 luchadores`, {
      fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#a99fc7',
    }).setOrigin(0.5);

    // Tarjetas de personajes (grid 4x2)
    this.cards = [];
    const cols = 4, cardW = 200, cardH = 150, gapX = 16, gapY = 18;
    const startX = 480 - ((cols * cardW + (cols - 1) * gapX) / 2) + cardW / 2;
    const startY = 165;

    this.team.forEach((char, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      this.cards.push(this.makeCard(char, x, y, cardW, cardH));
    });

    // Botón de pelea
    this.fightBtn = this.makeFightButton();
    this.updateFightButton();
  }

  makeCard(char, x, y, w, h) {
    const container = this.add.container(x, y);
    const teamColor = this.colors.primary;

    const bg = this.add.graphics();
    const drawBg = (active) => {
      bg.clear();
      bg.fillStyle(0x160d2e, 0.85);
      bg.lineStyle(2, active ? teamColor : 0x3a2d5c, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    };
    drawBg(false);
    container.add(bg);

    // Avatar procedural
    const avatar = DomeArt.makeFighter(this, 0, -h / 2 + 42, char, this.colors, 0.9);
    container.add(avatar);

    // Nombre + rol
    const name = this.add.text(0, 8, char.name, {
      fontFamily: 'Nunito, sans-serif', fontSize: '16px', fontStyle: '800', color: '#ffffff',
    }).setOrigin(0.5);
    const role = this.add.text(0, 26, char.role, {
      fontFamily: 'Nunito, sans-serif', fontSize: '11px', color: '#a99fc7',
    }).setOrigin(0.5);
    container.add([name, role]);

    // Stats
    const stats = this.add.text(0, 48,
      `❤ ${char.hp}   ⚔ ${char.atk}   ⚡ ${char.spd}`, {
      fontFamily: 'Nunito, sans-serif', fontSize: '11px', color: '#d7ccff',
    }).setOrigin(0.5);
    container.add(stats);

    // Check de selección
    const check = this.add.text(w / 2 - 18, -h / 2 + 14, '✓', {
      fontFamily: 'Nunito, sans-serif', fontSize: '20px', fontStyle: '900',
      color: '#57e389',
    }).setOrigin(0.5).setVisible(false);
    container.add(check);

    // Interacción
    container.setSize(w, h).setInteractive({ useHandCursor: true });
    container.on('pointerover', () => { if (!this.selected.has(char.id)) drawBg(true); });
    container.on('pointerout', () => { if (!this.selected.has(char.id)) drawBg(false); });
    container.on('pointerdown', () => {
      if (this.selected.has(char.id)) {
        this.selected.delete(char.id);
        check.setVisible(false);
        drawBg(false);
      } else {
        if (this.selected.size >= GAME_CONFIG.battle.teamSize) {
          this.flashLimit();
          return;
        }
        this.selected.add(char.id);
        check.setVisible(true);
        drawBg(true);
      }
      this.updateFightButton();
    });

    return { container, drawBg, check, charId: char.id };
  }

  flashLimit() {
    this.cameras.main.shake(120, 0.004);
  }

  makeFightButton() {
    const btn = this.add.container(480, 558);
    const g = this.add.graphics();
    g.fillStyle(this.colors.primary, 1);
    g.fillRoundedRect(-110, -24, 220, 48, 24);
    const label = this.add.text(0, 0, 'PELEAR', {
      fontFamily: 'Nunito, sans-serif', fontSize: '20px', fontStyle: '900', color: '#1a0b2e',
    }).setOrigin(0.5);
    btn.add([g, label]);
    btn.setSize(220, 48).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      if (this.selected.size === GAME_CONFIG.battle.teamSize) {
        this.startBattle();
      } else {
        this.flashLimit();
      }
    });
    btn._label = label;
    btn._g = g;
    return btn;
  }

  updateFightButton() {
    const ready = this.selected.size === GAME_CONFIG.battle.teamSize;
    this.fightBtn._g.clear();
    this.fightBtn._g.fillStyle(ready ? this.colors.primary : 0x3a2d5c, 1);
    this.fightBtn._g.fillRoundedRect(-110, -24, 220, 48, 24);
    this.fightBtn._label.setText(ready ? 'PELEAR' : `ELIGE ${GAME_CONFIG.battle.teamSize - this.selected.size} MÁS`);
    this.fightBtn._label.setColor(ready ? '#1a0b2e' : '#a99fc7');
  }

  startBattle() {
    const playerIds = [...this.selected];
    // El enemigo es el equipo contrario; la IA elige 4 al azar.
    const enemyTeamId = this.teamId === 'light' ? 'shadow' : 'light';
    const enemyPool = getTeam(enemyTeamId);
    const enemyIds = Phaser.Utils.Array.Shuffle([...enemyPool])
      .slice(0, GAME_CONFIG.battle.teamSize)
      .map((c) => c.id);

    this.scene.start('BattleScene', { playerIds, enemyIds, playerTeam: this.teamId, enemyTeam: enemyTeamId });
  }
}

window.SelectScene = SelectScene;
