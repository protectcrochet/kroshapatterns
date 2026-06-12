/**
 * DomeArt — Dibujo procedural del domo y los luchadores con Phaser Graphics.
 * Evita depender de assets externos: cada personaje se representa con una
 * silueta de color de equipo y una forma según su rol.
 */
const DomeArt = {
  /** Dibuja el interior del domo como fondo de una escena. */
  drawDome(scene, colors) {
    const W = 960, H = 600;
    const g = scene.add.graphics();

    // Cielo / ambiente
    g.fillGradientStyle(0x160d2e, 0x160d2e, 0x0b0718, 0x0b0718, 1);
    g.fillRect(0, 0, W, H);

    // Mitades de luz/sombra
    g.fillStyle(colors.primary, 0.06);
    g.fillRect(0, 0, W, H);

    // Arco del domo
    g.lineStyle(3, 0xffffff, 0.12);
    g.beginPath();
    g.arc(W / 2, H + 120, 620, Math.PI * 1.15, Math.PI * 1.85, false);
    g.strokePath();

    // Nervaduras del domo
    g.lineStyle(1, 0xffffff, 0.08);
    for (let i = -3; i <= 3; i++) {
      g.beginPath();
      g.moveTo(W / 2, H + 120);
      const ang = Math.PI * 1.5 + i * 0.12;
      g.lineTo(W / 2 + Math.cos(ang) * 620, H + 120 + Math.sin(ang) * 620);
      g.strokePath();
    }

    // Núcleo de energía al fondo
    const core = scene.add.circle(W / 2, 120, 70, colors.primary, 0.12);
    scene.tweens.add({ targets: core, scale: 1.2, alpha: 0.22, duration: 2200, yoyo: true, repeat: -1 });

    // Suelo de arena
    g.fillStyle(0x1a0b2e, 0.6);
    g.fillRect(0, H - 90, W, 90);
    g.lineStyle(1, colors.primary, 0.25);
    for (let x = 0; x <= W; x += 48) {
      g.beginPath();
      g.moveTo(x, H - 90);
      g.lineTo(x, H);
      g.strokePath();
    }

    return g;
  },

  /**
   * Crea un contenedor con la representación visual de un luchador.
   * @returns {Phaser.GameObjects.Container}
   */
  makeFighter(scene, x, y, char, colors, scale = 1) {
    const c = scene.add.container(x, y);
    const r = 26 * scale;

    // Halo
    const halo = scene.add.circle(0, 0, r + 6, colors.primary, 0.25);
    c.add(halo);

    // Cuerpo según el equipo
    const body = scene.add.circle(0, 0, r, colors.primary, 1);
    body.setStrokeStyle(2, 0xffffff, 0.8);
    c.add(body);

    // Marca de rol (forma interior)
    const mark = scene.add.graphics();
    mark.fillStyle(0x160d2e, 0.9);
    this.drawRoleMark(mark, char.role, r * 0.55);
    c.add(mark);

    // Inicial del nombre
    const initial = scene.add.text(0, 0, char.name[0], {
      fontFamily: 'Nunito, sans-serif', fontSize: `${Math.round(20 * scale)}px`,
      fontStyle: '900', color: '#ffffff',
    }).setOrigin(0.5);
    c.add(initial);

    // Pulso suave del halo
    scene.tweens.add({ targets: halo, scale: 1.15, alpha: 0.1, duration: 1400, yoyo: true, repeat: -1 });

    c._body = body;
    c._halo = halo;
    return c;
  },

  drawRoleMark(g, role, size) {
    switch (role) {
      case 'Tank':
        // Escudo (rombo)
        g.fillPoints([
          { x: 0, y: -size }, { x: size, y: 0 }, { x: 0, y: size }, { x: -size, y: 0 },
        ], true);
        break;
      case 'Healer':
        // Cruz
        g.fillRect(-size * 0.3, -size, size * 0.6, size * 2);
        g.fillRect(-size, -size * 0.3, size * 2, size * 0.6);
        break;
      case 'Shooter':
        // Triángulo
        g.fillTriangle(0, -size, size, size, -size, size);
        break;
      case 'Support':
        // Círculo
        g.fillCircle(0, 0, size * 0.8);
        break;
      case 'Control':
        // Estrella simple (dos triángulos)
        g.fillTriangle(0, -size, size * 0.9, size * 0.6, -size * 0.9, size * 0.6);
        g.fillTriangle(0, size, size * 0.9, -size * 0.6, -size * 0.9, -size * 0.6);
        break;
      default: // Bruiser
        g.fillRect(-size * 0.8, -size * 0.8, size * 1.6, size * 1.6);
    }
  },
};

window.DomeArt = DomeArt;
