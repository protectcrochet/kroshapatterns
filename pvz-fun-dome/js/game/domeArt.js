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

  // Paletas auxiliares derivadas del color de equipo.
  _shades(colors) {
    const base = Phaser.Display.Color.IntegerToColor(colors.primary);
    const lighten = (amt) => Phaser.Display.Color.GetColor(
      Math.min(255, base.red + amt), Math.min(255, base.green + amt), Math.min(255, base.blue + amt));
    const darken = (amt) => Phaser.Display.Color.GetColor(
      Math.max(0, base.red - amt), Math.max(0, base.green - amt), Math.max(0, base.blue - amt));
    return { base: colors.primary, light: lighten(70), bright: lighten(120), dark: darken(70), deep: darken(120) };
  },

  // Hash determinista del id → pequeñas variaciones por personaje.
  _seed(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return h;
  },

  /**
   * Crea un contenedor con un luchador dibujado a mano (vectorial).
   * Equipo Luz: criatura cristalina angular y dorada.
   * Equipo Sombra: criatura etérea de vacío, morada y ondulante.
   * @returns {Phaser.GameObjects.Container}
   */
  makeFighter(scene, x, y, char, colors, scale = 1) {
    const c = scene.add.container(x, y).setScale(scale);
    const isLight = char.team === 'light';
    const sh = this._shades(colors);
    const seed = this._seed(char.id);

    // ---- Aura / halo pulsante ----
    const halo = scene.add.circle(0, 2, 30, sh.base, 0.22);
    c.add(halo);
    scene.tweens.add({ targets: halo, scale: 1.2, alpha: 0.08, duration: 1400 + (seed % 600), yoyo: true, repeat: -1 });

    // ---- Sombra de contacto (fija, no flota) ----
    const shadow = scene.add.ellipse(0, 30, 40, 9, 0x000000, 0.35);
    c.add(shadow);

    // Contenedor interno: cuerpo + cara + accesorio flotan juntos.
    const inner = scene.add.container(0, 0);
    c.add(inner);

    const body = scene.add.graphics();
    inner.add(body);
    if (isLight) this._drawCrystalBody(body, sh, seed);
    else this._drawVoidBody(body, sh, seed);

    this._drawFace(scene, inner, char, isLight, seed);

    const acc = scene.add.graphics();
    inner.add(acc);
    this._drawRoleAccessory(acc, char.role, sh, isLight);

    // Flota suavemente todo el conjunto.
    scene.tweens.add({ targets: inner, y: -3, duration: 1600 + (seed % 500), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    c._body = body;
    c._halo = halo;
    return c;
  },

  // Criatura de LUZ: cuerpo de gema facetada con brillos.
  _drawCrystalBody(g, sh, seed) {
    const w = 22, topY = -26, botY = 22;
    // Cuerpo principal (diamante alargado)
    g.fillStyle(sh.base, 1);
    g.beginPath();
    g.moveTo(0, topY);
    g.lineTo(w, -4);
    g.lineTo(w * 0.7, botY);
    g.lineTo(-w * 0.7, botY);
    g.lineTo(-w, -4);
    g.closePath();
    g.fillPath();
    // Faceta clara (izquierda)
    g.fillStyle(sh.bright, 0.9);
    g.beginPath();
    g.moveTo(0, topY); g.lineTo(-w, -4); g.lineTo(-w * 0.7, botY); g.lineTo(0, botY * 0.6); g.closePath();
    g.fillPath();
    // Faceta oscura (derecha)
    g.fillStyle(sh.dark, 0.55);
    g.beginPath();
    g.moveTo(0, topY); g.lineTo(w, -4); g.lineTo(w * 0.7, botY); g.lineTo(0, botY * 0.6); g.closePath();
    g.fillPath();
    // Destello superior
    g.fillStyle(0xffffff, 0.85);
    g.fillTriangle(0, topY, -5, topY + 10, 3, topY + 8);
    // Contorno
    g.lineStyle(2, 0xffffff, 0.85);
    g.beginPath();
    g.moveTo(0, topY); g.lineTo(w, -4); g.lineTo(w * 0.7, botY);
    g.lineTo(-w * 0.7, botY); g.lineTo(-w, -4); g.closePath();
    g.strokePath();
  },

  // Criatura de SOMBRA: blob etéreo con cola de humo y borde brillante.
  _drawVoidBody(g, sh, seed) {
    const wobble = (seed % 5) - 2;
    // Cola de humo (parte inferior ondulada)
    g.fillStyle(sh.deep, 0.85);
    g.beginPath();
    g.moveTo(-18, 4);
    g.lineTo(-10 + wobble, 26);
    g.lineTo(0, 16);
    g.lineTo(10 - wobble, 28);
    g.lineTo(18, 4);
    g.closePath();
    g.fillPath();
    // Cuerpo (gota invertida / capucha)
    g.fillStyle(sh.base, 1);
    g.fillCircle(0, -2, 22);
    g.fillTriangle(-22, 2, 22, 2, 0, -30);
    // Sombreado interior
    g.fillStyle(sh.deep, 0.5);
    g.fillCircle(6, 2, 16);
    // Brillo de borde (luna creciente)
    g.lineStyle(2.5, sh.bright, 0.9);
    g.beginPath();
    g.arc(0, -2, 22, Math.PI * 1.15, Math.PI * 1.85, false);
    g.strokePath();
    // Chispa de vacío
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-8, -10, 2);
  },

  // Ojos y expresión (varían por personaje vía seed).
  _drawFace(scene, c, char, isLight, seed) {
    const eyeY = isLight ? -6 : -6;
    const gap = 7 + (seed % 3);
    const eyeR = 4.2;
    const eyeColor = isLight ? 0x1a0b2e : 0xffffff;
    const glow = isLight ? 0xffffff : (char.team === 'shadow' ? 0xc89bff : 0xffffff);

    [-1, 1].forEach((side) => {
      const ex = side * gap;
      // Blanco del ojo
      const sclera = scene.add.circle(ex, eyeY, eyeR, glow, 1);
      c.add(sclera);
      // Pupila
      const pupil = scene.add.circle(ex, eyeY + 0.5, eyeR * 0.55, eyeColor, 1);
      c.add(pupil);
      // Brillo
      const shine = scene.add.circle(ex - 1.3, eyeY - 1.3, 1, 0xffffff, 0.95);
      c.add(shine);
    });

    // Boca según "actitud" del seed: sonrisa, seria o feroz.
    const mouth = scene.add.graphics();
    const mouthColor = isLight ? 0x1a0b2e : 0xc89bff;
    mouth.lineStyle(1.6, mouthColor, 0.9);
    const my = eyeY + 9;
    const mood = seed % 3;
    mouth.beginPath();
    if (mood === 0) { mouth.arc(0, my - 1, 4, 0.15 * Math.PI, 0.85 * Math.PI, false); } // sonrisa
    else if (mood === 1) { mouth.moveTo(-4, my); mouth.lineTo(4, my); }                 // seria
    else { mouth.moveTo(-4, my + 1); mouth.lineTo(0, my - 2); mouth.lineTo(4, my + 1); } // feroz
    mouth.strokePath();
    c.add(mouth);
  },

  // Accesorio que identifica el rol del personaje.
  _drawRoleAccessory(g, role, sh, isLight) {
    switch (role) {
      case 'Tank': {
        // Escudo al frente
        g.fillStyle(sh.light, 1);
        g.lineStyle(1.5, 0xffffff, 0.9);
        g.beginPath();
        g.moveTo(16, 2); g.lineTo(26, 6); g.lineTo(26, 14); g.lineTo(16, 20); g.lineTo(16, 2);
        g.closePath(); g.fillPath(); g.strokePath();
        g.lineStyle(1.5, sh.deep, 0.8);
        g.beginPath(); g.moveTo(21, 6); g.lineTo(21, 16); g.strokePath();
        break;
      }
      case 'Healer': {
        // Halo flotante + cruz
        g.lineStyle(2.5, 0xffffff, 0.9);
        g.strokeEllipse(0, -32, 22, 7);
        g.fillStyle(0x57e389, 1);
        g.fillRect(-2, -16, 4, 12);
        g.fillRect(-6, -12, 12, 4);
        break;
      }
      case 'Shooter': {
        // Cañón en el costado
        g.fillStyle(sh.deep, 1);
        g.lineStyle(1.5, sh.bright, 0.9);
        g.fillRoundedRect(16, 0, 16, 8, 3);
        g.strokeRoundedRect(16, 0, 16, 8, 3);
        g.fillStyle(isLight ? 0xfff6d6 : 0xc89bff, 1);
        g.fillCircle(32, 4, 3);
        break;
      }
      case 'Support': {
        // Orbe de energía en alto
        g.fillStyle(sh.bright, 0.9);
        g.fillCircle(20, -14, 6);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(18, -16, 2);
        g.lineStyle(1.5, sh.light, 0.7);
        g.strokeCircle(20, -14, 9);
        break;
      }
      case 'Control': {
        // Espiral / runas a los lados
        g.lineStyle(2, sh.bright, 0.85);
        g.strokeCircle(-22, -10, 5);
        g.strokeCircle(22, -10, 5);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(-22, -10, 1.5);
        g.fillCircle(22, -10, 1.5);
        break;
      }
      default: { // Bruiser
        // Puños de energía
        g.fillStyle(sh.light, 1);
        g.lineStyle(1.5, 0xffffff, 0.85);
        g.fillCircle(-20, 12, 6); g.strokeCircle(-20, 12, 6);
        g.fillCircle(20, 12, 6); g.strokeCircle(20, 12, 6);
      }
    }
  },
};

window.DomeArt = DomeArt;
