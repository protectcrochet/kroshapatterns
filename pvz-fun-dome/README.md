# 🌟 Fun Dome — Arena Luz vs Sombra (Play-to-Earn)

Réplica jugable inspirada en el **Domo de la Diversión** de *Plants vs Zombies: Battle for Neighborville*.
Dos equipos enfrentados —**Luz** y **Sombra**— combaten en una arena 4v4 dentro de un domo, y el
jugador gana **FDT (Fun Dome Token)** que puede reclamar en su wallet (Polygon Amoy testnet).

> Personajes 100% originales (no usa propiedad intelectual de PvZ): solo se inspira en la estética del domo.

---

## 🎮 Cómo jugar

1. Abre `index.html` en el navegador.
2. *(Opcional)* Pulsa **Conectar Wallet** para vincular MetaMask en la red **Polygon Amoy**.
3. Elige tu bando: **Equipo Luz** ✨ o **Equipo Sombra** 🌑.
4. Selecciona **4 luchadores** de los 8 disponibles y pulsa **PELEAR**.
5. La batalla se resuelve automáticamente. Al ganar acumulas **+100 FDT** (derrota: +20 FDT; bonus de racha cada 3 victorias: +50 FDT).
6. Vuelve al domo y pulsa **Reclamar FDT** para mintear tus tokens on-chain.

---

## 🗂️ Estructura

```
pvz-fun-dome/
├── index.html              # Hub — vista del domo + wallet + selección de equipo
├── arena.html              # Arena (Phaser 3)
├── css/
│   ├── hub.css             # Domo, neón, paneles
│   └── arena.css           # Contenedor del juego
├── js/
│   ├── config.js           # Personajes, stats, recompensas, red crypto
│   ├── wallet.js           # MetaMask + balance off-chain + claim
│   ├── hub.js              # Lógica del hub
│   └── game/
│       ├── main.js         # Init de Phaser
│       ├── domeArt.js      # Dibujo procedural del domo y luchadores
│       └── scenes/
│           ├── SelectScene.js   # Elegir 4 de 8
│           ├── BattleScene.js   # Combate 4v4 automático
│           └── ResultScene.js   # Resultado + recompensa
└── contracts/
    └── FunDomeToken.sol    # ERC-20 de recompensa (solo testnet)
```

Sin build step: Phaser y ethers.js se cargan por CDN. Son archivos estáticos.

---

## 🚀 Ejecutar localmente

```bash
# Desde la carpeta pvz-fun-dome/
python3 -m http.server 8080
# luego abre http://localhost:8080
```

O simplemente abre `index.html` con doble clic (la wallet requiere servir por http/https).

---

## ⛓️ Desplegar el token (Polygon Amoy testnet)

1. Consigue POL de prueba en un faucet de Amoy (p. ej. faucet de Polygon).
2. Abre [Remix](https://remix.ethereum.org), pega `contracts/FunDomeToken.sol` y compílalo (Solidity ^0.8.20).
3. En *Deploy & Run*, selecciona **Injected Provider – MetaMask** con la red **Polygon Amoy** y despliega.
4. Copia la dirección del contrato desplegado.
5. Pégala en `js/config.js` → `crypto.tokenAddress`.

A partir de ahí, **Reclamar FDT** acuñará tus tokens acumulados al wallet conectado.

> El balance "jugable" vive en `localStorage` hasta que reclamas; al reclamar se resetea a 0 y se mintea on-chain.

---

## 🔧 Hosting

Archivos estáticos → cualquier hosting sirve: **GitHub Pages**, **Vercel**, **Netlify**, o local.
No requiere servidor. La parte crypto ocurre íntegra en el navegador del jugador vía MetaMask.

---

## ⚠️ Nota de seguridad

El `mint()` del contrato es **público a propósito para el MVP en testnet**. Para producción
(mainnet) hay que protegerlo con firma del servidor o control de acceso (Ownable / AccessControl)
para evitar acuñación arbitraria.
