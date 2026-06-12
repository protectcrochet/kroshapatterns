/**
 * Fun Dome — Módulo de wallet (MetaMask + Polygon Amoy testnet)
 *
 * Gestiona:
 *  - Conexión a MetaMask vía ethers.js v6
 *  - Cambio/alta automática de la red Polygon Amoy
 *  - Balance off-chain (FDT acumulados jugando, en localStorage)
 *  - Claim on-chain: mintea los FDT acumulados al wallet del jugador
 *
 * El balance "jugable" vive off-chain hasta que el jugador hace claim.
 * Para el MVP en testnet, el contrato expone un mint() público.
 */

const Wallet = (() => {
  const STORAGE_KEY = 'funDome.offchainBalance';
  const STREAK_KEY = 'funDome.winStreak';

  // ABI mínimo del FunDomeToken (ERC-20 + mint público en testnet).
  const TOKEN_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function mint(address to, uint256 amount) external',
  ];

  let provider = null;
  let signer = null;
  let account = null;
  const listeners = new Set();

  function isMetaMaskAvailable() {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
  }

  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function emit() {
    const state = getState();
    listeners.forEach((cb) => {
      try { cb(state); } catch (e) { console.error(e); }
    });
  }

  function getState() {
    return {
      connected: !!account,
      account,
      shortAccount: account ? `${account.slice(0, 6)}…${account.slice(-4)}` : null,
      offchainBalance: getOffchainBalance(),
      streak: getStreak(),
    };
  }

  // ---------- Balance off-chain ----------
  function getOffchainBalance() {
    return parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
  }

  function addOffchainBalance(amount) {
    const next = getOffchainBalance() + amount;
    localStorage.setItem(STORAGE_KEY, String(next));
    emit();
    return next;
  }

  function setOffchainBalance(amount) {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, amount)));
    emit();
  }

  // ---------- Racha de victorias ----------
  function getStreak() {
    return parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
  }

  function setStreak(n) {
    localStorage.setItem(STREAK_KEY, String(n));
  }

  /**
   * Registra el resultado de una batalla y devuelve el detalle de la recompensa.
   * @param {boolean} won
   */
  function recordBattleResult(won) {
    const cfg = window.GAME_CONFIG.rewards;
    let reward = won ? cfg.win : cfg.loss;
    let bonus = 0;

    let streak = getStreak();
    if (won) {
      streak += 1;
      if (streak > 0 && streak % cfg.streakLength === 0) {
        bonus = cfg.streakBonus;
      }
    } else {
      streak = 0;
    }
    setStreak(streak);

    const total = reward + bonus;
    addOffchainBalance(total);
    return { reward, bonus, total, streak };
  }

  // ---------- Conexión MetaMask ----------
  async function connect() {
    if (!isMetaMaskAvailable()) {
      throw new Error('MetaMask no está instalado. Instálalo para conectar tu wallet.');
    }
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    account = accounts[0];
    signer = await provider.getSigner();

    await ensureNetwork();

    window.ethereum.on('accountsChanged', (accs) => {
      account = accs[0] || null;
      emit();
    });
    window.ethereum.on('chainChanged', () => window.location.reload());

    emit();
    return getState();
  }

  /** Cambia a Polygon Amoy; si no existe en MetaMask, la añade. */
  async function ensureNetwork() {
    const net = window.GAME_CONFIG.crypto.network;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: net.chainIdHex }],
      });
    } catch (err) {
      // 4902 = la red no está registrada en la wallet → la añadimos.
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: net.chainIdHex,
            chainName: net.chainName,
            rpcUrls: net.rpcUrls,
            nativeCurrency: net.nativeCurrency,
            blockExplorerUrls: net.blockExplorerUrls,
          }],
        });
      } else {
        throw err;
      }
    }
  }

  // ---------- Claim on-chain ----------
  /**
   * Mintea el balance off-chain acumulado al wallet del jugador.
   * Resetea el balance off-chain tras una transacción confirmada.
   */
  async function claim() {
    if (!account) throw new Error('Conecta tu wallet primero.');
    const amount = getOffchainBalance();
    if (amount <= 0) throw new Error('No tienes FDT acumulados para reclamar.');

    const tokenAddr = window.GAME_CONFIG.crypto.tokenAddress;
    if (/^0x0+$/.test(tokenAddr)) {
      throw new Error('El contrato FDT aún no está desplegado. Configura tokenAddress en config.js.');
    }

    const token = new ethers.Contract(tokenAddr, TOKEN_ABI, signer);
    const decimals = await token.decimals();
    const value = ethers.parseUnits(String(amount), decimals);

    const tx = await token.mint(account, value);
    await tx.wait();

    setOffchainBalance(0);
    return { txHash: tx.hash, amount };
  }

  /** Lee el balance real on-chain del token FDT. */
  async function getOnchainBalance() {
    const tokenAddr = window.GAME_CONFIG.crypto.tokenAddress;
    if (!account || /^0x0+$/.test(tokenAddr)) return null;
    const token = new ethers.Contract(tokenAddr, TOKEN_ABI, provider);
    const [raw, decimals] = await Promise.all([token.balanceOf(account), token.decimals()]);
    return Number(ethers.formatUnits(raw, decimals));
  }

  return {
    isMetaMaskAvailable,
    connect,
    claim,
    getOnchainBalance,
    getState,
    onChange,
    getOffchainBalance,
    addOffchainBalance,
    recordBattleResult,
  };
})();

if (typeof window !== 'undefined') window.Wallet = Wallet;
