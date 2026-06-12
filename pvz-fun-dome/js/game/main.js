/**
 * Fun Dome — Inicialización de Phaser
 * Registra las escenas y arranca en la selección de escuadrón.
 */
(function () {
  const config = {
    type: Phaser.AUTO,
    parent: 'game-root',
    width: 960,
    height: 600,
    backgroundColor: '#0b0718',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [SelectScene, BattleScene, ResultScene],
  };

  // eslint-disable-next-line no-new
  window.funDomeGame = new Phaser.Game(config);
})();
