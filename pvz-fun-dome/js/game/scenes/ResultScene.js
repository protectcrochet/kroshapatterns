/**
 * ResultScene — Resultado de la batalla y entrega de recompensa FDT.
 * Registra el resultado en Wallet (balance off-chain + racha) y ofrece
 * volver a pelear o regresar al hub para reclamar los tokens.
 */
class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.playerWon = data.playerWon;
    this.playerTeamId = data.playerTeam;
    this.survivors = data.survivors;
  }

  create() {
    const colors = TEAM_COLORS[this.playerTeamId];
    DomeArt.drawDome(this, colors);

    // Panel oscuro
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.55);
    panel.fillRect(0, 0, 960, 600);

    // Registrar recompensa (off-chain).
    const result = Wallet.recordBattleResult(this.playerWon);

    // Título
    const titleColor = this.playerWon ? '#ffe07a' : '#c89bff';
    this.add.text(480, 150, this.playerWon ? '¡VICTORIA!' : 'DERROTA', {
      fontFamily: 'Nunito, sans-serif', fontSize: '64px', fontStyle: '900', color: titleColor,
    }).setOrigin(0.5).setShadow(0, 0, colors.glow, 26);

    this.add.text(480, 210,
      this.playerWon ? `Sobrevivieron ${this.survivors} luchadores` : 'Tu escuadrón cayó en la arena', {
      fontFamily: 'Nunito, sans-serif', fontSize: '16px', color: '#a99fc7',
    }).setOrigin(0.5);

    // Desglose de recompensa
    const lines = [
      `Recompensa de batalla:  +${result.reward} FDT`,
    ];
    if (result.bonus > 0) lines.push(`Bonus racha x${result.streak}:  +${result.bonus} FDT`);
    lines.push('');

    this.add.text(480, 280, lines.join('\n'), {
      fontFamily: 'Nunito, sans-serif', fontSize: '18px', color: '#ffffff', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5);

    // Total ganado animado
    const totalText = this.add.text(480, 350, '+0 FDT', {
      fontFamily: 'Nunito, sans-serif', fontSize: '40px', fontStyle: '900', color: '#57e389',
    }).setOrigin(0.5);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter, v: result.total, duration: 800, ease: 'Cubic.easeOut',
      onUpdate: () => totalText.setText(`+${Math.round(counter.v)} FDT`),
    });

    // Balance acumulado total
    this.add.text(480, 400, `Balance acumulado: ${Wallet.getOffchainBalance()} FDT`, {
      fontFamily: 'Nunito, sans-serif', fontSize: '15px', color: '#d7ccff',
    }).setOrigin(0.5);

    // Botones
    this.makeButton(360, 480, 'PELEAR DE NUEVO', colors.primary, '#1a0b2e', () => {
      this.scene.start('SelectScene');
    });
    this.makeButton(600, 480, 'VOLVER AL DOMO', 0x3a2d5c, '#ffffff', () => {
      window.location.href = 'index.html';
    });

    if (this.playerWon) this.confettiBurst(colors);
  }

  makeButton(x, y, label, fill, textColor, onClick) {
    const btn = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-110, -26, 220, 52, 26);
    const t = this.add.text(0, 0, label, {
      fontFamily: 'Nunito, sans-serif', fontSize: '17px', fontStyle: '900', color: textColor,
    }).setOrigin(0.5);
    btn.add([g, t]);
    btn.setSize(220, 52).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setScale(1.04));
    btn.on('pointerout', () => btn.setScale(1));
    btn.on('pointerdown', onClick);
    return btn;
  }

  confettiBurst(colors) {
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(0, 960);
      const p = this.add.circle(x, -10, Phaser.Math.Between(3, 6), colors.primary, 1);
      this.tweens.add({
        targets: p,
        y: 620,
        x: x + Phaser.Math.Between(-60, 60),
        angle: 360,
        duration: Phaser.Math.Between(1500, 3000),
        delay: Phaser.Math.Between(0, 800),
        onComplete: () => p.destroy(),
      });
    }
  }
}

window.ResultScene = ResultScene;
