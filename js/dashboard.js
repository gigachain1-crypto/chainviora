/* ==============================================================================
   GIGACHAIN - User Dashboard & Vault Management (Deposit / Withdrawal)
   ============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initDashboardUser();
  initDepositModal();
  initWithdrawModal();
  initDashboardCanvas();
  initCopyActions();
  initReferralSystem();
  initBuySellMarket();
});

// State
let currentUser = {
  username: 'GIGA' + Math.floor(100000 + Math.random() * 900000),
  email: 'crypto.member@chainviora.com',
  referralCode: Math.floor(100000 + Math.random() * 900000).toString(),
  gigaBalance: 0.00,
  usdtBalance: 0.00,
  lifetimeProfit: 0.00
};

const GIGA_PRICE = 3.42;

/* --------------------------------------------------------------------------
   1. User Session & Balance Display
   -------------------------------------------------------------------------- */
function initDashboardUser() {
  const savedUserJson = localStorage.getItem('gigachain_current_user');
  if (savedUserJson) {
    try {
      const parsed = JSON.parse(savedUserJson);
      if (parsed.username) currentUser.username = parsed.username;
      if (parsed.email) currentUser.email = parsed.email;
      if (parsed.referralCode) currentUser.referralCode = parsed.referralCode;

      // Reset all mock balances to zero for all users
      if (!localStorage.getItem('chainviora_zero_data_v2')) {
        currentUser.gigaBalance = 0.00;
        currentUser.usdtBalance = 0.00;
        currentUser.lifetimeProfit = 0.00;
        parsed.gigaBalance = 0.00;
        parsed.usdtBalance = 0.00;
        parsed.lifetimeProfit = 0.00;
        localStorage.setItem('gigachain_current_user', JSON.stringify(parsed));
        localStorage.setItem('chainviora_zero_data_v2', 'true');
      } else {
        if (parsed.gigaBalance !== undefined) currentUser.gigaBalance = parseFloat(parsed.gigaBalance) || 0;
        if (parsed.usdtBalance !== undefined) currentUser.usdtBalance = parseFloat(parsed.usdtBalance) || 0;
        if (parsed.lifetimeProfit !== undefined) currentUser.lifetimeProfit = parseFloat(parsed.lifetimeProfit) || 0;
      }
    } catch (e) {
      console.warn('Error reading saved session:', e);
    }
  } else {
    currentUser.gigaBalance = 0.00;
    currentUser.usdtBalance = 0.00;
    currentUser.lifetimeProfit = 0.00;
  }

  // Ensure user always has a 6-digit referral code
  if (!currentUser.referralCode) {
    currentUser.referralCode = Math.floor(100000 + Math.random() * 900000).toString();
  }
  localStorage.setItem('gigachain_current_user', JSON.stringify(currentUser));

  // DOM Elements
  const headerUsername = document.getElementById('headerUsername');
  const headerUserEmail = document.getElementById('headerUserEmail');
  const welcomeUsername = document.getElementById('welcomeUsername');

  if (headerUsername) headerUsername.textContent = currentUser.username;
  if (headerUserEmail) headerUserEmail.textContent = currentUser.email;
  if (welcomeUsername) welcomeUsername.textContent = currentUser.username;

  updateBalanceDisplays();

  // Wire up the Profit Box "Withdraw Profit" button
  const profitWithdrawBtn = document.getElementById('profitBoxWithdrawBtn');
  if (profitWithdrawBtn && !profitWithdrawBtn.dataset.bound) {
    profitWithdrawBtn.dataset.bound = 'true';
    profitWithdrawBtn.addEventListener('click', () => {
      const modal = document.getElementById('withdrawModal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        const assetSelect = document.getElementById('withdrawAssetSelect');
        if (assetSelect) assetSelect.value = 'USDT';
        const amountInput = document.getElementById('withdrawAmountInput');
        if (amountInput && currentUser.usdtBalance > 0) {
          amountInput.value = currentUser.usdtBalance.toFixed(2);
          const receiveDisplay = document.getElementById('withdrawReceiveDisplay');
          if (receiveDisplay) {
            const receive = Math.max(0, currentUser.usdtBalance - 1.00);
            receiveDisplay.textContent = `${receive.toFixed(2)} USDT`;
          }
        }
      }
    });
  }

  // Logout Action
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('gigachain_current_user');
      showToast('Logged out of dashboard.', 'info');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 700);
    });
  }
}

function updateBalanceDisplays() {
  const gigaDisplay = document.getElementById('gigaBalanceDisplay');
  const gigaUsdDisplay = document.getElementById('gigaUsdDisplay');
  const usdtDisplay = document.getElementById('usdtBalanceDisplay');
  const usdtUsdDisplay = document.getElementById('usdtUsdDisplay');
  const totalUsdDisplay = document.getElementById('totalUsdBalance');
  const profitDisplay = document.getElementById('profitBalanceDisplay');
  const profitDisplaySell = document.getElementById('profitBalanceDisplaySellCard');

  const gigaVal = currentUser.gigaBalance * GIGA_PRICE;
  const usdtVal = currentUser.usdtBalance;
  const totalUsd = gigaVal + usdtVal;

  if (gigaDisplay) gigaDisplay.textContent = currentUser.gigaBalance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (gigaUsdDisplay) gigaUsdDisplay.textContent = `$${gigaVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (usdtDisplay) usdtDisplay.textContent = currentUser.usdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (usdtUsdDisplay) usdtUsdDisplay.textContent = `$${usdtVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (totalUsdDisplay) totalUsdDisplay.textContent = `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (profitDisplay) profitDisplay.textContent = `$${currentUser.lifetimeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (profitDisplaySell) profitDisplaySell.textContent = `$${currentUser.lifetimeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Update withdrawal modal options dynamically
  const withdrawAssetSelect = document.getElementById('withdrawAssetSelect');
  if (withdrawAssetSelect) {
    const usdtOpt = withdrawAssetSelect.querySelector('option[value="USDT"]');
    const gigaOpt = withdrawAssetSelect.querySelector('option[value="GIGA"]');
    if (usdtOpt) usdtOpt.textContent = `USDT (Available: ${currentUser.usdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT)`;
    if (gigaOpt) gigaOpt.textContent = `GIGA Token (Available: ${currentUser.gigaBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GIGA)`;
  }

  // Save updated balance to localStorage
  localStorage.setItem('gigachain_current_user', JSON.stringify(currentUser));
}

/* --------------------------------------------------------------------------
   2. Deposit Modal & Actions
   -------------------------------------------------------------------------- */
function initDepositModal() {
  const modal = document.getElementById('depositModal');
  const openBtn = document.getElementById('openDepositBtn');
  const closeBtn = document.getElementById('closeDepositModal');
  const copyAddrBtn = document.getElementById('copyDepositAddrBtn');
  const addrInput = document.getElementById('depositAddressInput');
  const simulateBtn = document.getElementById('simulateDepositBtn');

  function openDeposit() {
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function closeDeposit() {
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  if (openBtn) openBtn.addEventListener('click', openDeposit);
  if (closeBtn) closeBtn.addEventListener('click', closeDeposit);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDeposit();
    });
  }

  if (copyAddrBtn && addrInput) {
    copyAddrBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(addrInput.value).then(() => {
        showToast('Deposit address copied to clipboard! 📋', 'success');
      });
    });
  }

  // Simulate Deposit Action
  if (simulateBtn) {
    simulateBtn.addEventListener('click', () => {
      const depositAmount = 250.00;
      currentUser.usdtBalance += depositAmount;
      updateBalanceDisplays();

      // Add to transaction table
      addTransactionRow('Deposit', 'USDT (TRC20)', `+${depositAmount.toFixed(2)}`, generateTxHash(), 'Just now', 'Confirmed');

      closeDeposit();
      showToast(`Deposit confirmed! +${depositAmount} USDT credited to your Vault 🚀`, 'success');
    });
  }
}

/* --------------------------------------------------------------------------
   3. Withdrawal Modal & Actions
   -------------------------------------------------------------------------- */
function initWithdrawModal() {
  const modal = document.getElementById('withdrawModal');
  const openBtn = document.getElementById('openWithdrawBtn');
  const closeBtn = document.getElementById('closeWithdrawModal');
  const form = document.getElementById('withdrawForm');
  const assetSelect = document.getElementById('withdrawAssetSelect');
  const amountInput = document.getElementById('withdrawAmountInput');
  const maxBtn = document.getElementById('withdrawMaxBtn');
  const symbolLabel = document.getElementById('withdrawSymbolLabel');
  const receiveDisplay = document.getElementById('withdrawReceiveDisplay');

  function openWithdraw() {
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function closeWithdraw() {
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  if (openBtn) openBtn.addEventListener('click', openWithdraw);
  if (closeBtn) closeBtn.addEventListener('click', closeWithdraw);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeWithdraw();
    });
  }

  function calculateReceive() {
    const asset = assetSelect ? assetSelect.value : 'USDT';
    const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
    const fee = asset === 'GIGA' ? 0.05 : 1.00;
    const receive = Math.max(0, amount - fee);
    if (receiveDisplay) {
      receiveDisplay.textContent = `${receive.toFixed(2)} ${asset}`;
    }
  }

  if (assetSelect) {
    assetSelect.addEventListener('change', () => {
      const asset = assetSelect.value;
      if (symbolLabel) symbolLabel.textContent = asset;
      calculateReceive();
    });
  }

  if (amountInput) {
    amountInput.addEventListener('input', calculateReceive);
  }

  if (maxBtn && amountInput) {
    maxBtn.addEventListener('click', () => {
      const asset = assetSelect ? assetSelect.value : 'USDT';
      const maxAvailable = asset === 'GIGA' ? currentUser.gigaBalance : currentUser.usdtBalance;
      amountInput.value = maxAvailable;
      calculateReceive();
    });
  }

  // Handle Withdrawal Form Submit
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const asset = assetSelect ? assetSelect.value : 'USDT';
      const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
      const destInput = document.getElementById('withdrawDestinationInput');
      const destination = destInput ? destInput.value.trim() : '';

      const maxAvailable = asset === 'GIGA' ? currentUser.gigaBalance : currentUser.usdtBalance;

      if (amount <= 0) {
        showToast('Please enter a valid withdrawal amount.', 'error');
        return;
      }

      if (amount > maxAvailable) {
        showToast(`Insufficient ${asset} balance! Max available: ${maxAvailable}`, 'error');
        return;
      }

      if (!destination || destination.length < 10) {
        showToast('Please enter a valid destination wallet address.', 'error');
        return;
      }

      // Deduct balance
      if (asset === 'GIGA') {
        currentUser.gigaBalance -= amount;
      } else {
        currentUser.usdtBalance -= amount;
      }
      updateBalanceDisplays();

      // Add to transaction history table
      const txHash = generateTxHash();
      addTransactionRow('Withdrawal', `${asset}`, `-${amount.toFixed(2)}`, txHash, 'Just now', 'Confirmed');

      closeWithdraw();
      showToast(`Withdrawal of ${amount} ${asset} processed successfully! 🚀 Tx: ${txHash.slice(0, 10)}...`, 'success');
      form.reset();
      calculateReceive();
    });
  }
}

/* --------------------------------------------------------------------------
   4. Table Helpers & Utilities
   -------------------------------------------------------------------------- */
function generateTxHash() {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 40; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function addTransactionRow(type, asset, amount, txHash, time, status) {
  const table = document.getElementById('transactionHistoryTable');
  if (!table) return;

  const emptyRow = document.getElementById('emptyTxRow');
  if (emptyRow) emptyRow.remove();

  const isDeposit = type === 'Deposit';
  const badgeClass = isDeposit ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200';
  const amountClass = isDeposit ? 'text-emerald-600' : 'text-slate-800';
  const icon = isDeposit
    ? `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>`
    : `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>`;

  const row = document.createElement('tr');
  row.className = 'hover:bg-amber-50/30 transition-colors animate-fade-in';
  row.innerHTML = `
    <td class="py-3.5 px-4">
      <span class="inline-flex items-center gap-1 font-bold ${badgeClass} px-2 py-0.5 rounded-md border text-[11px]">
        ${icon}
        ${type}
      </span>
    </td>
    <td class="py-3.5 px-4 font-bold text-slate-800">${asset}</td>
    <td class="py-3.5 px-4 font-mono font-bold ${amountClass}">${amount}</td>
    <td class="py-3.5 px-4 font-mono text-slate-500">${txHash.slice(0, 6)}...${txHash.slice(-4)}</td>
    <td class="py-3.5 px-4 text-slate-400">${time}</td>
    <td class="py-3.5 px-4 text-right">
      <span class="px-2 py-1 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">${status}</span>
    </td>
  `;

  table.insertBefore(row, table.firstChild);
}

function initCopyActions() {
  const copyUserBtn = document.getElementById('copyUsernameBtn');
  if (copyUserBtn) {
    copyUserBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(currentUser.username).then(() => {
        showToast(`Username copied: ${currentUser.username} 📋`, 'success');
      });
    });
  }
}

/* --------------------------------------------------------------------------
   5. Background Particle Canvas
   -------------------------------------------------------------------------- */
function initDashboardCanvas() {
  const canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const nodeCount = Math.floor(window.innerWidth / 40);
  const nodes = [];
  const colors = ['#D4AF37', '#FF007A', '#00DFD8', '#7928CA', '#0070F3'];

  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      radius: Math.random() * 2 + 1,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 110) {
          ctx.strokeStyle = nodes[i].color;
          ctx.globalAlpha = (1 - dist / 110) * 0.18;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 0.6;
    nodes.forEach(node => {
      ctx.fillStyle = node.color;
      ctx.fillRect(node.x - 1.5, node.y - 1.5, 3, 3);

      node.x += node.vx;
      node.y += node.vy;

      if (node.x < 0 || node.x > width) node.vx *= -1;
      if (node.y < 0 || node.y > height) node.vy *= -1;
    });

    requestAnimationFrame(render);
  }

  render();
}

/* --------------------------------------------------------------------------
   6. Toast Notifications
   -------------------------------------------------------------------------- */
function showToast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  let borderClass = 'border-amber-500';
  let iconSvg = `<svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;

  if (type === 'success') {
    borderClass = 'border-emerald-500';
    iconSvg = `<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
  } else if (type === 'error') {
    borderClass = 'border-red-500';
    iconSvg = `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
  }

  toast.className = `flex items-center gap-3 bg-white border-2 ${borderClass} px-4 py-3 rounded-xl shadow-2xl text-slate-800 text-sm font-medium transform transition-all duration-300 translate-y-2 opacity-0 pointer-events-auto`;
  toast.innerHTML = `
    ${iconSvg}
    <span>${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* --------------------------------------------------------------------------
   7. Referral System (6-Digit Code, Shareable Link & WhatsApp Sharing)
   -------------------------------------------------------------------------- */
function initReferralSystem() {
  const codeDisplay = document.getElementById('userRefCodeDisplay');
  const linkInput = document.getElementById('userRefLinkInput');
  const copyCodeBtn = document.getElementById('copyRefCodeBtn');
  const copyLinkBtn = document.getElementById('copyRefLinkBtn');
  const shareBtn = document.getElementById('shareRefBtn');
  const refCountEl = document.getElementById('totalReferralsCount');
  const refEarnedEl = document.getElementById('totalReferralEarned');

  if (codeDisplay) {
    codeDisplay.textContent = currentUser.referralCode;
  }

  // Construct referral link using current origin or production domain
  let baseUrl = window.location.origin;
  if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    baseUrl = 'https://www.chainviora.com';
  }
  const refLink = `${baseUrl}/?ref=${currentUser.referralCode}`;

  if (linkInput) {
    linkInput.value = refLink;
  }

  // Stats from localStorage
  const refCount = parseInt(localStorage.getItem(`chainviora_ref_count_${currentUser.referralCode}`) || '0', 10);
  if (refCountEl) refCountEl.textContent = refCount;
  if (refEarnedEl) refEarnedEl.textContent = `${(refCount * 50).toFixed(2)} GIGA`;

  // Copy 6-Digit Code
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentUser.referralCode);
        showToast(`Referral Code ${currentUser.referralCode} copied!`, 'success');
      } catch (err) {
        showToast(`Referral Code: ${currentUser.referralCode}`, 'info');
      }
    });
  }

  // Copy Full Shareable Link
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(refLink);
        showToast('Referral Link copied to clipboard! 🚀', 'success');
      } catch (err) {
        if (linkInput) {
          linkInput.select();
          document.execCommand('copy');
          showToast('Referral Link copied!', 'success');
        }
      }
    });
  }

  // Share via WhatsApp / Web Share API
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const shareText = `Hey! Join Chainviora using my Referral Code: ${currentUser.referralCode} to get 500 GIGA bonus tokens!\nSign up here:\n${refLink}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Chainviora Web3 Ecosystem',
            text: shareText,
            url: refLink
          });
          return;
        } catch (e) {
          // If user cancelled, fall through
        }
      }

      // WhatsApp Web / App share fallback
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, '_blank');
    });
  }
}

/* --------------------------------------------------------------------------
   7. Buy & Sell GIGA Marketplace (100 Pool & Pending Sell Queue)
   -------------------------------------------------------------------------- */
function initBuySellMarket() {
  const poolTableBody = document.getElementById('buyPoolTableBody');
  const searchInput = document.getElementById('buySearchInput');
  const quickBuyBtn = document.getElementById('quickBuyBtn');
  const pendingContainer = document.getElementById('pendingSellListContainer');
  const pendingBadge = document.getElementById('pendingSellBadge');
  const pendingCountDisplay = document.getElementById('pendingCountDisplay');
  const pendingValueDisplay = document.getElementById('pendingValueDisplay');

  // 1. Get or generate 100 GIGA buy pool
  function getPool() {
    let pool = [];
    const saved = localStorage.getItem('chainviora_buy_pool_100');
    if (saved) {
      try {
        pool = JSON.parse(saved);
      } catch (e) { }
    }
    if (!Array.isArray(pool) || pool.length !== 100) {
      pool = [];
      for (let i = 1; i <= 100; i++) {
        pool.push({
          id: `GIGA-${String(i).padStart(3, '0')}`,
          amount: 1,
          price: 30.00,
          status: 'Available'
        });
      }
      localStorage.setItem('chainviora_buy_pool_100', JSON.stringify(pool));
    }
    return pool;
  }

  function savePool(pool) {
    localStorage.setItem('chainviora_buy_pool_100', JSON.stringify(pool));
  }

  // 2. Get user's pending sell list
  function getPendingSells() {
    let pending = [];
    const saved = localStorage.getItem('chainviora_user_pending_sells');
    if (saved) {
      try {
        pending = JSON.parse(saved);
      } catch (e) { }
    }
    if (Array.isArray(pending)) {
      pending.forEach(item => {
        if (item.matchedBuyers === undefined) {
          item.matchedBuyers = item.status === 'Completed' ? 2 : 0;
        }
        if (!item.status) {
          item.status = item.matchedBuyers >= 2 ? 'Completed' : 'Pending';
        }
      });
    } else {
      pending = [];
    }
    return pending;
  }

  function savePendingSells(pending) {
    localStorage.setItem('chainviora_user_pending_sells', JSON.stringify(pending));
  }

  // 3. Render the 100 GIGA buy table
  function renderPoolTable(filterQuery = '') {
    if (!poolTableBody) return;
    const pool = getPool();
    poolTableBody.innerHTML = '';

    const query = filterQuery.trim().toLowerCase();
    const filtered = query
      ? pool.filter(item => item.id.toLowerCase().includes(query))
      : pool;

    if (filtered.length === 0) {
      poolTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="py-6 text-center text-slate-400">
            No orders found matching "${filterQuery}".
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach((item) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-amber-50/40 transition-colors';
      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-800">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shadow-xs">G</span>
            <span>${item.amount} GIGA</span>
          </span>
        </td>
        <td class="py-3 px-4 font-mono font-bold text-emerald-700">$${item.price.toFixed(2)}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
            ${item.status}
          </span>
        </td>
        <td class="py-3 px-4 text-right">
          <button type="button" data-id="${item.id}"
            class="buy-unit-btn px-3.5 py-1.5 rounded-lg btn-rainbow-glow text-xs font-bold shadow-xs cursor-pointer">
            Buy ($30)
          </button>
        </td>
      `;
      poolTableBody.appendChild(tr);
    });

    // Attach click events to all buy buttons
    poolTableBody.querySelectorAll('.buy-unit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-id');
        executeBuyGiga(orderId);
      });
    });
  }

  // 4. Render User's Pending & Completed Sells
  function renderPendingSells() {
    const pending = getPendingSells();
    const activePending = pending.filter(item => item.status !== 'Completed');
    const completedItems = pending.filter(item => item.status === 'Completed');
    const pendingCount = activePending.length;

    if (pendingBadge) pendingBadge.textContent = `${pendingCount} Pending`;
    if (pendingCountDisplay) pendingCountDisplay.textContent = `${pendingCount} GIGA`;

    const profitDisplay = document.getElementById('profitBalanceDisplay');
    const profitDisplaySell = document.getElementById('profitBalanceDisplaySellCard');
    if (profitDisplay) profitDisplay.textContent = `$${currentUser.lifetimeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (profitDisplaySell) profitDisplaySell.textContent = `$${currentUser.lifetimeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (!pendingContainer) return;

    if (pending.length === 0) {
      pendingContainer.innerHTML = `
        <div id="emptyPendingSellNotice" class="p-6 rounded-xl border border-dashed border-slate-200 text-center text-slate-400">
          <svg class="w-8 h-8 text-slate-300 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-xs font-medium">No GIGA in Sell queue.</p>
          <p class="text-[11px] text-slate-400 mt-0.5">When you buy from the 100 pool, it appears here as Pending Sell until 2 buyers match it.</p>
        </div>
      `;
      return;
    }

    pendingContainer.innerHTML = '';
    pending.forEach(item => {
      const isComplete = item.status === 'Completed' || (item.matchedBuyers >= 2);
      const card = document.createElement('div');

      if (isComplete) {
        card.className = 'p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between hover:border-emerald-300 transition-colors shadow-2xs';
        card.innerHTML = `
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shadow-xs">
              ✓
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono font-bold text-slate-900 text-xs">${item.orderId}</span>
                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200">1 GIGA</span>
              </div>
              <p class="text-[10px] text-slate-500">${item.completedAt || item.timestamp} • 2/2 Buyers Matched</p>
            </div>
          </div>
          <div class="text-right">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Sell Complete
            </span>
            <p class="text-[11px] font-mono font-black text-emerald-700 mt-0.5">+$50.00 Profit</p>
          </div>
        `;
      } else {
        const buyers = item.matchedBuyers || 0;
        card.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between hover:border-amber-300 transition-colors shadow-2xs';
        card.innerHTML = `
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs shadow-xs">
              ⏳
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono font-bold text-slate-900 text-xs">${item.orderId}</span>
                <span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">1 GIGA</span>
              </div>
              <p class="text-[10px] text-slate-400">${item.timestamp} • Unit: $30.00</p>
            </div>
          </div>
          <div class="text-right">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-300">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Pending Sell (${buyers}/2)
            </span>
            <p class="text-[10px] font-mono font-bold text-slate-500 mt-0.5">${buyers === 1 ? '1 more buyer needed' : 'Waiting for buyers'}</p>
          </div>
        `;
      }
      pendingContainer.appendChild(card);
    });
  }

  // 5. Execute Buy Action
  function executeBuyGiga(specificOrderId = null) {
    const cost = 30.00;

    // Verify main balance has at least $30 USDT
    if (currentUser.usdtBalance < cost) {
      showToast(`Insufficient USDT Balance! You have $${currentUser.usdtBalance.toFixed(2)}, but need $30.00 to buy 1 GIGA. Please Deposit funds first.`, 'error');
      // Suggest opening deposit modal
      const depModal = document.getElementById('depositModal');
      if (depModal) {
        setTimeout(() => {
          depModal.classList.remove('hidden');
          depModal.classList.add('flex');
        }, 800);
      }
      return;
    }

    // Deduct $30 from user's USDT balance
    currentUser.usdtBalance = Math.max(0, currentUser.usdtBalance - cost);
    updateBalanceDisplays();

    // Create user's Pending Sell record
    const pending = getPendingSells();
    const sellOrderId = `#SELL-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    pending.unshift({
      orderId: sellOrderId,
      amount: 1,
      price: cost,
      profit: 50.00,
      matchedBuyers: 0,
      requiredBuyers: 2,
      timestamp: nowTime,
      status: 'Pending'
    });
    savePendingSells(pending);

    // Re-blend purchased GIGA back into 100 pool
    const pool = getPool();
    const targetIdx = specificOrderId
      ? pool.findIndex(i => i.id === specificOrderId)
      : Math.floor(Math.random() * pool.length);

    const safeIdx = targetIdx >= 0 ? targetIdx : 0;
    // Remove the purchased item and re-insert into a random position in the 100 list
    pool.splice(safeIdx, 1);
    const randomSlot = Math.floor(Math.random() * pool.length);
    pool.splice(randomSlot, 0, {
      id: `GIGA-${String(Math.floor(1 + Math.random() * 999)).padStart(3, '0')}`,
      amount: 1,
      price: 30.00,
      status: 'Available'
    });

    // Ensure pool always has exactly 100 items
    while (pool.length < 100) {
      pool.push({
        id: `GIGA-${String(pool.length + 1).padStart(3, '0')}`,
        amount: 1,
        price: 30.00,
        status: 'Available'
      });
    }
    savePool(pool);

    // Add to transaction history table
    const txHash = generateTxHash();
    addTransactionRow('Buy GIGA', '1 GIGA ($30.00)', '-$30.00', txHash, 'Just now', 'Completed');

    // Re-render UI
    renderPoolTable(searchInput ? searchInput.value : '');
    renderPendingSells();

    // Open Buy Successfully Popup Modal (with background blur)
    openSuccessModal(sellOrderId);
    showToast(`Successfully bought 1 GIGA for $30.00! Placed in Sell queue as Pending 🚀`, 'success');

    // Schedule background buyer matching: 1st buyer in 6s, 2nd buyer in 14s
    scheduleBackgroundBuyer(6000);
  }

  // 6. Background 2-Buyer Matching & Profit Distribution Engine
  let matchingTimeoutId = null;

  function processNextBackgroundBuyer() {
    const pending = getPendingSells();
    // FIFO: find oldest pending order where matchedBuyers < 2
    let targetOrder = null;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].status !== 'Completed' && (pending[i].matchedBuyers || 0) < 2) {
        targetOrder = pending[i];
        break;
      }
    }

    if (!targetOrder) return;

    targetOrder.matchedBuyers = (targetOrder.matchedBuyers || 0) + 1;

    if (targetOrder.matchedBuyers === 1) {
      savePendingSells(pending);
      renderPendingSells();
      showToast(`⚡ Background Buyer Matched (1/2) for ${targetOrder.orderId}! 1 more buyer needed to complete $50.00 profit.`, 'info');
      // Schedule the second buyer soon (in 7 seconds)
      scheduleBackgroundBuyer(7000);
    } else if (targetOrder.matchedBuyers >= 2) {
      targetOrder.status = 'Completed';
      targetOrder.completedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      savePendingSells(pending);

      // Credit $50.00 to user's lifetime profit & withdrawable USDT balance
      currentUser.lifetimeProfit = (currentUser.lifetimeProfit || 0) + 50.00;
      currentUser.usdtBalance = (currentUser.usdtBalance || 0) + 50.00;
      updateBalanceDisplays();
      renderPendingSells();

      // Add to transaction history table
      const txHash = generateTxHash();
      addTransactionRow('Sell Complete', '1 GIGA (2/2 Buyers)', '+$50.00', txHash, 'Just now', 'Completed');

      showToast(`🎉 Order ${targetOrder.orderId} Completed! 2 buyers bought your GIGA in background. +$50.00 Profit credited to your withdrawable balance! 💰`, 'success');
    }
  }

  function scheduleBackgroundBuyer(delayMs) {
    if (matchingTimeoutId) clearTimeout(matchingTimeoutId);
    matchingTimeoutId = setTimeout(() => {
      processNextBackgroundBuyer();
    }, delayMs);
  }

  // Periodic background matching interval (every 16s)
  setInterval(() => {
    processNextBackgroundBuyer();
  }, 16000);

  // 7. Buy Success Modal Handlers
  const successModal = document.getElementById('buySuccessModal');
  const closeSuccessBtn = document.getElementById('closeBuySuccessBtn');
  const successOrderIdEl = document.getElementById('buySuccessOrderId');

  function openSuccessModal(orderId) {
    if (successOrderIdEl) successOrderIdEl.textContent = orderId;
    if (successModal) {
      successModal.classList.remove('hidden');
      successModal.classList.add('flex');
    }
  }

  function closeSuccessModal() {
    if (successModal) {
      successModal.classList.add('hidden');
      successModal.classList.remove('flex');
    }
  }

  if (closeSuccessBtn) {
    closeSuccessBtn.addEventListener('click', closeSuccessModal);
  }

  if (successModal) {
    successModal.addEventListener('click', (e) => {
      if (e.target === successModal) closeSuccessModal();
    });
  }

  // Bind Quick Buy button (if present)
  if (quickBuyBtn) {
    quickBuyBtn.addEventListener('click', () => {
      executeBuyGiga();
    });
  }

  // Bind search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderPoolTable(e.target.value);
    });
  }

  // Initial render
  renderPoolTable();
  renderPendingSells();
}


