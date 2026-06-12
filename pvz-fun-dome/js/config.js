/**
 * Fun Dome — Configuración central del juego
 * Arena 4v4 inspirada en el Domo de la Diversión.
 * Equipo Luz vs Equipo Sombra.
 */

const GAME_CONFIG = {
  // ---- Recompensas crypto (off-chain, se acumulan en localStorage) ----
  rewards: {
    win: 100,        // FDT por victoria
    loss: 20,        // FDT por derrota
    streakBonus: 50, // bonus al alcanzar racha de 3 victorias
    streakLength: 3,
  },

  // ---- Configuración de blockchain (Polygon Amoy testnet) ----
  // Nota: Mumbai fue descontinuado; Amoy es la testnet activa de Polygon.
  crypto: {
    tokenSymbol: 'FDT',
    tokenName: 'Fun Dome Token',
    network: {
      chainIdHex: '0x13882',            // 80002 — Polygon Amoy
      chainName: 'Polygon Amoy Testnet',
      rpcUrls: ['https://rpc-amoy.polygon.technology'],
      nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
      blockExplorerUrls: ['https://amoy.polygonscan.com'],
    },
    // Dirección del contrato FunDomeToken — se rellena tras el deploy.
    tokenAddress: '0x0000000000000000000000000000000000000000',
  },

  // ---- Reglas de batalla ----
  battle: {
    teamSize: 4,                // personajes por equipo en la arena
    specialEveryTurns: 3,       // cada cuántos turnos se activa la habilidad
    turnDelayMs: 700,           // ritmo de animación entre turnos
  },
};

// ---- Paletas de equipo ----
const TEAM_COLORS = {
  light: {
    name: 'Equipo Luz',
    primary: 0xffe07a,   // dorado
    accent: 0xffffff,    // blanco brillante
    glow: '#ffe07a',
    css: '#ffe07a',
  },
  shadow: {
    name: 'Equipo Sombra',
    primary: 0x9b5de5,   // morado
    accent: 0x1a0b2e,    // negro-violeta
    glow: '#9b5de5',
    css: '#9b5de5',
  },
};

// ---- Roster: Equipo Luz ----
const TEAM_LIGHT = [
  { id: 'lumina',    name: 'Lumina',    team: 'light', role: 'Healer',  hp: 900,  atk: 60,  spd: 70, ability: 'Aura curativa al aliado con menos HP' },
  { id: 'crystalis', name: 'Crystalis', team: 'light', role: 'Tank',    hp: 1500, atk: 80,  spd: 40, ability: 'Escudo de gema absorbe daño' },
  { id: 'soluna',    name: 'Soluna',    team: 'light', role: 'Shooter', hp: 700,  atk: 150, spd: 90, ability: 'Flechas de fotones (área)' },
  { id: 'auron',     name: 'Auron',     team: 'light', role: 'Bruiser', hp: 1100, atk: 120, spd: 60, ability: 'Puñetazos de energía dorada' },
  { id: 'prisma',    name: 'Prisma',    team: 'light', role: 'Control', hp: 800,  atk: 90,  spd: 80, ability: 'Refracción que ciega y ralentiza' },
  { id: 'brillante', name: 'Brillante', team: 'light', role: 'Tank',    hp: 1300, atk: 70,  spd: 45, ability: 'Barrera de luz sólida' },
  { id: 'photon',    name: 'Photon',    team: 'light', role: 'Shooter', hp: 750,  atk: 140, spd: 85, ability: 'Cañón de partículas (daño en área)' },
  { id: 'radiel',    name: 'Radiel',    team: 'light', role: 'Support', hp: 850,  atk: 100, spd: 75, ability: 'Infunde energía a aliados (+ATK)' },
];

// ---- Roster: Equipo Sombra ----
const TEAM_SHADOW = [
  { id: 'umbra',     name: 'Umbra',     team: 'shadow', role: 'Healer',  hp: 920,  atk: 55,  spd: 68, ability: 'Absorbe sombras para curar aliados' },
  { id: 'voidstone', name: 'Voidstone', team: 'shadow', role: 'Tank',    hp: 1550, atk: 75,  spd: 38, ability: 'Vacío comprimido absorbe ataques' },
  { id: 'noctis',    name: 'Noctis',    team: 'shadow', role: 'Shooter', hp: 720,  atk: 155, spd: 88, ability: 'Dardos de oscuridad (disparo múltiple)' },
  { id: 'darkfang',  name: 'Darkfang',  team: 'shadow', role: 'Bruiser', hp: 1150, atk: 115, spd: 62, ability: 'Garras que drenan vida' },
  { id: 'phantom',   name: 'Phantom',   team: 'shadow', role: 'Control', hp: 820,  atk: 85,  spd: 78, ability: 'Se invisibiliza y ataca por sorpresa' },
  { id: 'obsidian',  name: 'Obsidian',  team: 'shadow', role: 'Tank',    hp: 1350, atk: 65,  spd: 44, ability: 'Refleja 20% del daño recibido' },
  { id: 'eclipse',   name: 'Eclipse',   team: 'shadow', role: 'Shooter', hp: 760,  atk: 145, spd: 84, ability: 'Oscurece el área, daño en el tiempo' },
  { id: 'shade',     name: 'Shade',     team: 'shadow', role: 'Support', hp: 870,  atk: 95,  spd: 73, ability: 'Debilita la resistencia del equipo rival' },
];

const ALL_CHARACTERS = [...TEAM_LIGHT, ...TEAM_SHADOW];

function getTeam(teamId) {
  return teamId === 'light' ? TEAM_LIGHT : TEAM_SHADOW;
}

function getCharacter(id) {
  return ALL_CHARACTERS.find((c) => c.id === id);
}

// Export para navegador (global) y por si se usa con módulos.
if (typeof window !== 'undefined') {
  window.GAME_CONFIG = GAME_CONFIG;
  window.TEAM_COLORS = TEAM_COLORS;
  window.TEAM_LIGHT = TEAM_LIGHT;
  window.TEAM_SHADOW = TEAM_SHADOW;
  window.ALL_CHARACTERS = ALL_CHARACTERS;
  window.getTeam = getTeam;
  window.getCharacter = getCharacter;
}
