/**
 * Fun Dome — Lógica del Hub
 * Conecta wallet, dibuja los rosters de cada equipo y lleva a la arena.
 */
(function () {
  const $ = (sel) => document.querySelector(sel);

  const connectBtn = $('#connectBtn');
  const claimBtn = $('#claimBtn');
  const balanceBox = $('#balanceBox');
  const balanceAmount = $('#balanceAmount');
  const hint = $('#hint');
  const toast = $('#toast');

  let selectedTeam = null;

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg, type = '') {
    toast.textContent = msg;
    toast.className = `toast ${type}`.trim();
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  }

  // ---------- Render de rosters ----------
  function renderRoster(containerId, team) {
    const ul = document.getElementById(containerId);
    ul.innerHTML = team
      .map((c) => `<li><span>${c.name}</span><span class="role">${c.role}</span></li>`)
      .join('');
  }

  // ---------- Estado de wallet en la UI ----------
  function syncWalletUI(state) {
    if (state.connected) {
      connectBtn.textContent = state.shortAccount;
      connectBtn.disabled = true;
      balanceBox.hidden = false;
      balanceAmount.textContent = state.offchainBalance;
      claimBtn.hidden = state.offchainBalance <= 0;
    } else {
      connectBtn.textContent = 'Conectar Wallet';
      connectBtn.disabled = false;
      balanceBox.hidden = true;
      claimBtn.hidden = true;
    }
  }

  // ---------- Conectar ----------
  async function handleConnect() {
    try {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Conectando…';
      const state = await Wallet.connect();
      showToast(`Wallet conectada: ${state.shortAccount}`, 'success');
    } catch (err) {
      showToast(err.message || 'No se pudo conectar la wallet.', 'error');
      connectBtn.disabled = false;
      connectBtn.textContent = 'Conectar Wallet';
    }
  }

  // ---------- Claim ----------
  async function handleClaim() {
    try {
      claimBtn.disabled = true;
      claimBtn.textContent = 'Reclamando…';
      const { txHash, amount } = await Wallet.claim();
      showToast(`¡Reclamaste ${amount} FDT! Tx: ${txHash.slice(0, 10)}…`, 'success');
    } catch (err) {
      showToast(err.message || 'No se pudo reclamar.', 'error');
    } finally {
      claimBtn.disabled = false;
      claimBtn.textContent = 'Reclamar FDT';
    }
  }

  // ---------- Selección de equipo ----------
  function handleTeamSelect(card) {
    document.querySelectorAll('.team-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedTeam = card.dataset.team;
    const teamName = TEAM_COLORS[selectedTeam].name;
    hint.innerHTML = `Has elegido <strong>${teamName}</strong>. Entrando a la arena…`;

    // Guarda la elección y entra a la arena.
    sessionStorage.setItem('funDome.team', selectedTeam);
    setTimeout(() => { window.location.href = 'arena.html'; }, 700);
  }

  // ---------- Init ----------
  function init() {
    renderRoster('rosterLight', TEAM_LIGHT);
    renderRoster('rosterShadow', TEAM_SHADOW);

    connectBtn.addEventListener('click', handleConnect);
    claimBtn.addEventListener('click', handleClaim);
    document.querySelectorAll('.team-card').forEach((card) => {
      card.addEventListener('click', () => handleTeamSelect(card));
    });

    Wallet.onChange(syncWalletUI);
    syncWalletUI(Wallet.getState());

    if (!Wallet.isMetaMaskAvailable()) {
      showToast('MetaMask no detectado: puedes jugar, pero necesitarás instalarlo para reclamar FDT.', '');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
