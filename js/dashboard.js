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
  initUserActivityHistory();
  initNotificationSystem();
  initAboutUsModal();
  initUserProfileModal();
});

// State
let currentUser = {
  id: null, // Will be set from localStorage (persistent UUID per device)
  username: 'GIGA' + Math.floor(100000 + Math.random() * 900000),
  fullName: '',
  createdAt: null,
  email: 'crypto.member@chainviora.com',
  referralCode: Math.floor(100000 + Math.random() * 900000).toString(),
  gigaBalance: 0.00,
  usdtBalance: 0.00,
  lifetimeProfit: 0.00
};

// Generate or retrieve persistent user UUID (stays same across sessions)
function getOrCreateUserId() {
  let uid = localStorage.getItem('chainviora_user_uid');
  if (!uid) {
    // Generate a UUID v4-like string
    uid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem('chainviora_user_uid', uid);
  }
  return uid;
}

const GIGA_PRICE = 30.00;

/* --------------------------------------------------------------------------
   1. User Session & Balance Display
   -------------------------------------------------------------------------- */
function initDashboardUser() {
  // Set persistent user ID first
  currentUser.id = getOrCreateUserId();

  const savedUserJson = localStorage.getItem('gigachain_current_user');
  if (savedUserJson) {
    try {
      const parsed = JSON.parse(savedUserJson);
      if (parsed.username) currentUser.username = parsed.username;
      if (parsed.email) currentUser.email = parsed.email;
      if (parsed.fullName) currentUser.fullName = parsed.fullName;
      if (parsed.createdAt) currentUser.createdAt = parsed.createdAt;
      if (parsed.referralCode) currentUser.referralCode = parsed.referralCode;

      // ✅ FULL DATA ISOLATION: Use email-keyed localStorage for balances
      const emailKey = parsed.email
        ? parsed.email.toLowerCase().replace(/[^a-z0-9]/g, '_')
        : 'guest';

      const KEY_BAL = `cv_balance_${emailKey}`;
      const savedBal = localStorage.getItem(KEY_BAL);

      if (savedBal) {
        try {
          const bal = JSON.parse(savedBal);
          currentUser.gigaBalance = parseFloat(bal.giga) || 0;
          currentUser.usdtBalance = parseFloat(bal.usdt) || 0;
          currentUser.lifetimeProfit = parseFloat(bal.profit) || 0;
          currentUser.totalGigaBought = parseInt(bal.totalGigaBought !== undefined ? bal.totalGigaBought : (bal.giga || 0), 10) || 0;
          currentUser.totalGigaSold = parseInt(bal.totalGigaSold, 10) || 0;
        } catch (e) {
          currentUser.gigaBalance = 0;
          currentUser.usdtBalance = 0;
          currentUser.lifetimeProfit = 0;
          currentUser.totalGigaBought = 0;
          currentUser.totalGigaSold = 0;
        }
      } else {
        // Brand new user on this device — start at zero
        currentUser.gigaBalance = 0;
        currentUser.usdtBalance = 0;
        currentUser.lifetimeProfit = 0;
        currentUser.totalGigaBought = 0;
        currentUser.totalGigaSold = 0;
        localStorage.setItem(KEY_BAL, JSON.stringify({ giga: 0, usdt: 0, profit: 0, totalGigaBought: 0, totalGigaSold: 0 }));
      }

      // Store current email key for balance saves
      currentUser._emailKey = emailKey;

    } catch (e) {
      console.warn('Error reading saved session:', e);
      currentUser.gigaBalance = 0;
      currentUser.usdtBalance = 0;
      currentUser.lifetimeProfit = 0;
      currentUser.totalGigaBought = 0;
      currentUser.totalGigaSold = 0;
    }
  } else {
    currentUser.gigaBalance = 0;
    currentUser.usdtBalance = 0;
    currentUser.lifetimeProfit = 0;
    currentUser.totalGigaBought = 0;
    currentUser.totalGigaSold = 0;
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

  // ─── Cross-Device Real-Time Sync via Supabase API (Desktop <-> Mobile) ───────
  async function syncCrossDeviceState() {
    if (!currentUser.email) return;
    try {
      const res = await fetch(`/api/update-balance?email=${encodeURIComponent(currentUser.email)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success) {
        // 1. Username sync
        if (data.username && data.username !== currentUser.username) {
          currentUser.username = data.username;
          if (headerUsername) headerUsername.textContent = data.username;
          if (welcomeUsername) welcomeUsername.textContent = data.username;
        }

        // Store profile details for Profile modal
        if (data.full_name) currentUser.fullName = data.full_name;
        if (data.created_at) currentUser.createdAt = data.created_at;
        if (data.email) currentUser.email = data.email;

        // 2. Balances & Counters sync
        if (data.usdt_balance !== undefined) {
          currentUser.usdtBalance = parseFloat(data.usdt_balance);
        }
        if (data.lifetime_profit !== undefined) {
          currentUser.lifetimeProfit = parseFloat(data.lifetime_profit);
        }
        if (data.total_giga_bought !== undefined) {
          currentUser.totalGigaBought = parseInt(data.total_giga_bought, 10);
          currentUser.gigaBalance = currentUser.totalGigaBought;
        }
        if (data.total_giga_sold !== undefined) {
          currentUser.totalGigaSold = parseInt(data.total_giga_sold, 10);
        }

        const emailKey = currentUser.email
          ? currentUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_')
          : (currentUser._emailKey || 'guest');

        // 3. Sells queue sync
        if (Array.isArray(data.pending_sells)) {
          localStorage.setItem(`cv_sells_${emailKey}`, JSON.stringify(data.pending_sells));
        }

        // 4. Activities sync
        if (Array.isArray(data.activities)) {
          localStorage.setItem(`cv_txs_${emailKey}`, JSON.stringify(data.activities));
          if (typeof renderUserTransactionsTable === 'function') {
            renderUserTransactionsTable();
          }
        }

        // 5. Save synced state to localStorage
        localStorage.setItem(`cv_balance_${emailKey}`, JSON.stringify({
          giga: currentUser.gigaBalance,
          usdt: currentUser.usdtBalance,
          profit: currentUser.lifetimeProfit,
          totalGigaBought: currentUser.totalGigaBought,
          totalGigaSold: currentUser.totalGigaSold
        }));
        localStorage.setItem('gigachain_current_user', JSON.stringify(currentUser));

        // 6. Update all UI card displays and pending sells queue
        updateBalanceDisplays();
        if (typeof window.renderPendingSellsGlobal === 'function') {
          window.renderPendingSellsGlobal();
        }
      }
    } catch (err) {
      console.warn('Cross-device sync check notice:', err.message);
    }
  }

  // Initial immediate cross-device sync
  syncCrossDeviceState();

  // Periodic real-time background sync every 10 seconds
  setInterval(syncCrossDeviceState, 10000);

  // Sync when user returns to tab / phone screen wakes up
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncCrossDeviceState();
    }
  });

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

// ─── Supabase Balance Sync (saves to backend after each action) ───────────────
async function syncBalanceToSupabase(action = 'update') {
  try {
    const emailKey = currentUser.email
      ? currentUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_')
      : (currentUser._emailKey || 'guest');

    let pendingSells = [];
    try {
      const savedSells = localStorage.getItem(`cv_sells_${emailKey}`);
      if (savedSells) pendingSells = JSON.parse(savedSells);
    } catch (e) { }

    let activities = [];
    try {
      const savedTxs = localStorage.getItem(`cv_txs_${emailKey}`);
      if (savedTxs) activities = JSON.parse(savedTxs);
    } catch (e) { }

    const res = await fetch('/api/update-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: localStorage.getItem('supabase_user_id') || currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        pending_sells: pendingSells,
        activities: activities,
        action
      })
    });

    const data = await res.json().catch(() => ({}));
    if (data && data.success && data.usdt_balance !== undefined) {
      // 🔒 HARDENED: Overwrite local state with true server-authoritative balance
      currentUser.usdtBalance = parseFloat(data.usdt_balance);
      currentUser.gigaBalance = parseFloat(data.giga_balance || 0);
      currentUser.lifetimeProfit = parseFloat(data.lifetime_profit || 0);
      updateBalanceDisplays();
    }
  } catch (e) {
    console.warn('Balance sync skipped (offline or error):', e.message);
  }
}

// ─── Record Transaction to Supabase ─────────────────────────────────────────
async function recordTxToSupabase(type, amountUsdt, amountGiga, orderId, notes, txHash, asset) {
  try {
    const supabaseUserId = localStorage.getItem('supabase_user_id') || currentUser.id;
    if (!supabaseUserId && !currentUser.email) return;
    await fetch('/api/record-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: supabaseUserId,
        email: currentUser.email,
        type,
        asset: asset || (type.includes('giga') ? 'GIGA' : 'USDT'),
        amount_usdt: amountUsdt || 0,
        amount_giga: amountGiga || 0,
        tx_hash: txHash || null,
        order_id: orderId || null,
        status: 'completed',
        notes: notes || null
      })
    });
  } catch (e) {
    console.warn('Transaction record skipped:', e.message);
  }
}

// ─── Calculate Total GIGA Bought by User (from sells history or balance) ───
function getUserTotalGigaBought() {
  try {
    const userEmail = currentUser.email ? currentUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : (currentUser._emailKey || 'guest');
    const saved = localStorage.getItem(`cv_sells_${userEmail}`);
    let sellsCount = 0;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        sellsCount = parsed.reduce((sum, item) => sum + (parseFloat(item.amount) || 1), 0);
      }
    }
    return Math.max(currentUser.totalGigaBought || 0, sellsCount, currentUser.gigaBalance || 0);
  } catch (e) {
    return currentUser.totalGigaBought || currentUser.gigaBalance || 0;
  }
}

// ─── Calculate Total GIGA Sold by User (from completed sell queue or lifetime profit) ───
function getUserTotalGigaSold() {
  try {
    const userEmail = currentUser.email ? currentUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : (currentUser._emailKey || 'guest');
    const saved = localStorage.getItem(`cv_sells_${userEmail}`);
    let completedCount = 0;
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        completedCount = parsed.filter(item => item.status === 'Completed' || (item.matchedBuyers >= 2)).length;
      }
    }
    const profitBased = Math.floor((currentUser.lifetimeProfit || 0) / 50);
    return Math.max(currentUser.totalGigaSold || 0, completedCount, profitBased);
  } catch (e) {
    return currentUser.totalGigaSold || Math.floor((currentUser.lifetimeProfit || 0) / 50) || 0;
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
  const gigaSellDisplay = document.getElementById('gigaSellDisplay');
  const gigaSellUsdDisplay = document.getElementById('gigaSellUsdDisplay');

  // Total GIGA bought by the user
  const totalGigaBought = getUserTotalGigaBought();
  const gigaVal = totalGigaBought * GIGA_PRICE;
  const usdtVal = currentUser.usdtBalance;
  const totalUsd = gigaVal + usdtVal;

  // Total GIGA sold by the user
  const totalGigaSold = getUserTotalGigaSold();
  const soldVal = totalGigaSold * 50.00;

  if (gigaDisplay) gigaDisplay.textContent = `${totalGigaBought} GIGA`;
  if (gigaUsdDisplay) gigaUsdDisplay.textContent = `$${gigaVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (usdtDisplay) usdtDisplay.textContent = currentUser.usdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (usdtUsdDisplay) usdtUsdDisplay.textContent = `$${usdtVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (totalUsdDisplay) totalUsdDisplay.textContent = `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (profitDisplay) profitDisplay.textContent = `$${currentUser.lifetimeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (profitDisplaySell) profitDisplaySell.textContent = `$${currentUser.lifetimeProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (gigaSellDisplay) gigaSellDisplay.textContent = `${totalGigaSold} GIGA`;
  if (gigaSellUsdDisplay) gigaSellUsdDisplay.textContent = `$${soldVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Update withdrawal modal options dynamically (USDT BEP20 only)
  const withdrawAssetSelect = document.getElementById('withdrawAssetSelect');
  if (withdrawAssetSelect) {
    const usdtOpt = withdrawAssetSelect.querySelector('option[value="USDT"]');
    if (usdtOpt) usdtOpt.textContent = `USDT (Available: ${currentUser.usdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT)`;
  }

  // Save updated balance to localStorage (user-specific key)
  localStorage.setItem('gigachain_current_user', JSON.stringify(currentUser));
  if (currentUser._emailKey) {
    localStorage.setItem(`cv_balance_${currentUser._emailKey}`, JSON.stringify({
      giga: currentUser.gigaBalance,
      usdt: currentUser.usdtBalance,
      profit: currentUser.lifetimeProfit
    }));
  }
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
  const qrBox = document.getElementById('depositQRBox');
  const addrNote = document.getElementById('depositAddrNote');
  const assetSelect = document.getElementById('depositAssetSelect');
  const networkBadge = document.getElementById('depositNetworkBadge');

  // Network configuration metadata
  const NETWORK_META = {
    usdtbsc: { label: 'BEP20', name: 'USDT (BEP20 - BNB Smart Chain)', badgeClass: 'text-amber-700 bg-amber-50 border-amber-200' },
    usdttrc20: { label: 'TRC20', name: 'USDT (TRC20 - TRON)', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    sol: { label: 'SOL', name: 'SOL (Solana Network)', badgeClass: 'text-purple-700 bg-purple-50 border-purple-200' },
    btc: { label: 'BTC', name: 'BTC (Bitcoin Network)', badgeClass: 'text-orange-700 bg-orange-50 border-orange-200' },
    eth: { label: 'ETH', name: 'ETH (Ethereum - ERC20)', badgeClass: 'text-blue-700 bg-blue-50 border-blue-200' }
  };

  // Cache: addresses and payment IDs per currency for current user
  const addressesCache = {};
  const paymentsCache = {};
  let currentPaymentId = null;

  // Render QR Code
  function renderQRCode(address) {
    if (!qrBox) return;
    qrBox.innerHTML = '';
    try {
      new QRCode(qrBox, {
        text: address,
        width: 128,
        height: 128,
        colorDark: '#1e293b',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {
      qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(address)}" class="w-full h-full rounded-lg" alt="QR Code">`;
    }
  }

  // Show Loading state inside QR box
  function showQRLoading(label) {
    if (!qrBox) return;
    qrBox.innerHTML = `
      <div class="flex flex-col items-center justify-center gap-2 p-2 text-center">
        <div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-[10px] text-slate-500 font-medium">Fetching ${label}...</span>
      </div>
    `;
  }

  // Update Network Badge and Notes
  function updateBadgeAndNote(currencyKey, address, isCached) {
    const meta = NETWORK_META[currencyKey] || NETWORK_META.usdtbsc;

    if (networkBadge) {
      networkBadge.textContent = meta.label;
      networkBadge.className = `ml-1 text-[10px] font-semibold border px-1.5 py-0.5 rounded-full ${meta.badgeClass}`;
    }

    if (addrInput) {
      addrInput.value = address;
    }

    if (addrNote) {
      addrNote.textContent = isCached
        ? `✅ Your permanent ${meta.name} deposit address`
        : `✅ New permanent ${meta.label} address assigned to your account`;
      addrNote.className = 'text-[10px] text-emerald-600 mt-1 font-medium';
    }
  }

  // Fetch or retrieve permanent deposit address for selected currency
  async function loadDepositAddress(currency = 'usdtbsc') {
    const curKey = (currency || 'usdtbsc').toLowerCase();
    const meta = NETWORK_META[curKey] || NETWORK_META.usdtbsc;

    // 1. If in-memory cache exists with payment ID
    if (addressesCache[curKey] && paymentsCache[curKey]) {
      currentPaymentId = paymentsCache[curKey];
      updateBadgeAndNote(curKey, addressesCache[curKey], true);
      renderQRCode(addressesCache[curKey]);
      return;
    }

    // 2. Check localStorage cache (ignore old fake addresses starting with 0x748b97c0)
    const user = currentUser;
    const localKey = user && user.id ? `gigachain_dep_${user.id}_${curKey}` : null;
    if (localKey) {
      const savedAddr = localStorage.getItem(localKey);
      const savedPid = localStorage.getItem(localKey + '_pid');
      const isAlreadyConfirmed = localStorage.getItem(localKey + '_confirmed') === '1';
      if (savedAddr && !savedAddr.startsWith('0x748b97c0') && savedPid) {
        addressesCache[curKey] = savedAddr;
        if (!isAlreadyConfirmed) {
          // Only set active payment if not already confirmed
          paymentsCache[curKey] = savedPid;
          currentPaymentId = savedPid;
        } else {
          // Payment was already credited — do NOT set currentPaymentId to prevent re-polling
          currentPaymentId = null;
          delete paymentsCache[curKey];
        }
        updateBadgeAndNote(curKey, savedAddr, true);
        renderQRCode(savedAddr);
        return;
      } else if (!isAlreadyConfirmed) {
        localStorage.removeItem(localKey);
        localStorage.removeItem(localKey + '_pid');
      }
    }

    // 3. Show loading UI
    showQRLoading(meta.label);
    if (addrInput) addrInput.value = '';
    if (addrInput) addrInput.placeholder = `Generating your ${meta.label} address...`;
    if (addrNote) {
      addrNote.textContent = `⏳ Connecting to gateway for ${meta.label} address...`;
      addrNote.className = 'text-[10px] text-slate-500 mt-1';
    }

    try {
      if (!user || !user.id) {
        if (addrNote) addrNote.textContent = '⚠️ Please log in to get your deposit address.';
        return;
      }

      const response = await fetch('/api/get-deposit-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          currency: curKey
        })
      });

      const data = await response.json();

      if (data.success && data.address) {
        addressesCache[curKey] = data.address;
        if (data.payment_id) {
          paymentsCache[curKey] = data.payment_id;
          currentPaymentId = data.payment_id;
          if (localKey) localStorage.setItem(localKey + '_pid', data.payment_id);
          // New payment assigned — start interval if modal is open
          if (modal && !modal.classList.contains('hidden') && !depositCheckInterval) {
            depositCheckInterval = setInterval(runBackgroundDepositCheck, 10000);
          }
        }
        if (localKey) localStorage.setItem(localKey, data.address);

        updateBadgeAndNote(curKey, data.address, data.cached);
        renderQRCode(data.address);
      } else {
        console.error('Failed to get deposit address:', data);
        if (addrNote) {
          addrNote.textContent = `⚠️ Could not generate ${meta.label} address. Please try again.`;
          addrNote.className = 'text-[10px] text-red-500 mt-1';
        }
      }
    } catch (err) {
      console.error('Deposit address fetch error:', err);
      if (addrNote) {
        addrNote.textContent = '⚠️ Network error. Please try again.';
        addrNote.className = 'text-[10px] text-red-500 mt-1';
      }
    }
  }

  // Network Select Dropdown change listener
  if (assetSelect) {
    assetSelect.addEventListener('change', (e) => {
      loadDepositAddress(e.target.value);
    });
  }

  let depositCheckInterval = null;

  function openDeposit() {
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      // Set to selected or default to BEP20
      const currentCur = assetSelect ? assetSelect.value : 'usdtbsc';
      loadDepositAddress(currentCur);

      // Only start polling interval if there's an active (unconfirmed) payment
      if (!depositCheckInterval && currentPaymentId) {
        depositCheckInterval = setInterval(runBackgroundDepositCheck, 10000);
      }
    }
  }

  function closeDeposit() {
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    if (depositCheckInterval) {
      clearInterval(depositCheckInterval);
      depositCheckInterval = null;
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
      if (!addrInput.value || addrInput.value === '') {
        showToast('Address not loaded yet. Please wait...', 'error');
        return;
      }
      navigator.clipboard.writeText(addrInput.value).then(() => {
        showToast('Deposit address copied to clipboard! 📋', 'success');
      });
    });
  }

  // Show Deposit Successful Centered Modal with Logo, Amount & Trx Hash
  function showDepositSuccessModal({ amount, networkName, txHash }) {
    const modal = document.getElementById('depositSuccessModal');
    if (!modal) return;
    const amtDisplay = document.getElementById('depSuccessAmountDisplay');
    const netDisplay = document.getElementById('depSuccessNetworkDisplay');
    const hashDisplay = document.getElementById('depSuccessTxHashDisplay');
    const copyBtn = document.getElementById('copyDepTxHashBtn');
    const closeBtn = document.getElementById('closeDepSuccessBtn');

    if (amtDisplay) amtDisplay.textContent = `+$${amount.toFixed(2)} USDT`;
    if (netDisplay) netDisplay.textContent = networkName || 'USDT (BEP20 - BNB Smart Chain)';
    if (hashDisplay) hashDisplay.textContent = txHash || generateTxHash();

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (copyBtn && hashDisplay) {
      copyBtn.onclick = () => {
        const text = hashDisplay.textContent.trim();
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.innerHTML = '<span class="text-emerald-600 font-bold">Copied! ✓</span>';
          setTimeout(() => {
            copyBtn.innerHTML = `<span>Copy</span><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>`;
          }, 2000);
        });
      };
    }

    function hideModal() {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }

    if (closeBtn) closeBtn.onclick = hideModal;
    modal.onclick = (e) => {
      if (e.target === modal) hideModal();
    };
  }

  // Confirm / Credit Deposit Button (Real On-Chain Verification with NOWPayments)
  const confirmDepositBtn = document.getElementById('confirmDepositBtn');
  if (confirmDepositBtn) {
    confirmDepositBtn.addEventListener('click', async () => {
      confirmDepositBtn.disabled = true;
      const origHtml = confirmDepositBtn.innerHTML;
      confirmDepositBtn.innerHTML = `
        <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        <span>Scanning Blockchain for Transfer...</span>
      `;

      const curKey = assetSelect ? assetSelect.value : 'usdtbsc';
      const meta = NETWORK_META[curKey] || NETWORK_META.usdtbsc;
      const pId = currentPaymentId || paymentsCache[curKey];
      const addr = (addrInput && addrInput.value) ? addrInput.value : (addressesCache[curKey] || '0x9Ca60E989A9E8ce08dCFEfcC108A952cEe4f517b');

      try {
        const res = await fetch('/api/check-deposit-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_id: pId || null,
            address: addr,
            user_id: currentUser ? currentUser.id : null,
            email: currentUser ? currentUser.email : null
          })
        });

        const data = await res.json().catch(() => ({}));

        if (data.success && data.confirmed && !data.already_credited) {
          // Real on-chain crypto payment received & confirmed!
          const creditedAmt = parseFloat(data.amount || 0);
          if (creditedAmt <= 0) return;
          const txKey = 'cv_dep_credited_' + (data.tx_hash || 'tx_' + creditedAmt);

          if (!localStorage.getItem(txKey)) {
            localStorage.setItem(txKey, '1');
            if (data.new_balance !== undefined) {
              currentUser.usdtBalance = parseFloat(data.new_balance);
            } else {
              currentUser.usdtBalance = (currentUser.usdtBalance || 0) + creditedAmt;
            }
            updateBalanceDisplays();

            // Clear current payment tracking so it can never be checked again
            currentPaymentId = null;
            if (paymentsCache) delete paymentsCache[curKey];
            const localKey = currentUser ? `gigachain_dep_${currentUser.id}_${curKey}` : null;
            if (localKey) {
              localStorage.removeItem(localKey + '_pid');
              localStorage.setItem(localKey + '_confirmed', '1'); // Mark as confirmed — prevents re-polling
            }
            if (depositCheckInterval) {
              clearInterval(depositCheckInterval);
              depositCheckInterval = null;
            }

            // Add to user activity & transaction history
            logUserActivity({
              type: 'Deposit',
              asset: `USDT (${meta.label || 'BEP20'})`,
              amount: `+$${creditedAmt.toFixed(2)} USDT`,
              rawAmount: creditedAmt,
              txHash: data.tx_hash || generateTxHash(),
              status: 'Completed',
              notes: `On-chain deposit via ${meta.name || 'BEP20'} (Status: Confirmed)`
            });
            syncBalanceToSupabase('deposit_confirmed');

            // Close modal & open centered Deposit Successful modal ONLY when newly confirmed
            closeDeposit();
            showDepositSuccessModal({
              amount: creditedAmt,
              networkName: meta.name || 'USDT (BEP20 - BNB Smart Chain)',
              txHash: data.tx_hash
            });
            showToast(`🎉 Deposit of $${creditedAmt.toFixed(2)} USDT Confirmed! Credited to Vault!`, 'success');
          } else {
            showToast('This deposit transaction has already been credited to your vault balance.', 'info');
          }
        } else if (data.already_credited) {
          // Server says already credited — make sure UI balance is correct from server
          if (data.new_balance !== undefined) {
            currentUser.usdtBalance = parseFloat(data.new_balance);
            updateBalanceDisplays();
          }
          // Mark locally as confirmed to prevent future re-polling
          currentPaymentId = null;
          if (paymentsCache) delete paymentsCache[curKey];
          const localKey2 = currentUser ? `gigachain_dep_${currentUser.id}_${curKey}` : null;
          if (localKey2) {
            localStorage.removeItem(localKey2 + '_pid');
            localStorage.setItem(localKey2 + '_confirmed', '1');
          }
          if (depositCheckInterval) {
            clearInterval(depositCheckInterval);
            depositCheckInterval = null;
          }
          showToast('This deposit has already been processed and credited to your vault.', 'info');
        } else {
          // Transaction still waiting on blockchain
          showToast('⏳ Waiting for transfer. No incoming transfer detected yet on this address. If you just sent crypto from your wallet, please wait 1-2 minutes for network confirmation and click again.', 'info');
          if (addrNote) {
            addrNote.innerHTML = '<span class="text-amber-600 font-bold animate-pulse">⏳ Live Blockchain Listener Scanning... Waiting for transfer on this address</span>';
          }
        }

      } catch (err) {
        console.error('Check deposit error:', err);
        showToast('Network error while checking blockchain status. Please try again.', 'error');
      } finally {
        confirmDepositBtn.disabled = false;
        confirmDepositBtn.innerHTML = origHtml;
      }
    });
  }

  // Background Auto-Listener: ONLY polls when deposit modal is actively open AND an active payment exists
  function runBackgroundDepositCheck() {
    if (!modal || modal.classList.contains('hidden')) {
      if (depositCheckInterval) {
        clearInterval(depositCheckInterval);
        depositCheckInterval = null;
      }
      return;
    }

    const curKey = assetSelect ? assetSelect.value : 'usdtbsc';
    const meta = NETWORK_META[curKey] || NETWORK_META.usdtbsc;
    const pId = currentPaymentId || paymentsCache[curKey];
    const addr = (addrInput && addrInput.value) ? addrInput.value : addressesCache[curKey];

    if (!pId) return;

    fetch('/api/check-deposit-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_id: pId,
        address: addr,
        user_id: currentUser ? currentUser.id : null,
        email: currentUser ? currentUser.email : null
      })
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.success && data.confirmed && !data.already_credited) {
          const creditedAmt = parseFloat(data.amount || 0);
          if (creditedAmt <= 0) return;
          const txKey = 'cv_dep_credited_' + (data.tx_hash || 'tx_' + creditedAmt);

          if (!localStorage.getItem(txKey)) {
            localStorage.setItem(txKey, '1');
            if (data.new_balance !== undefined) {
              currentUser.usdtBalance = parseFloat(data.new_balance);
            } else {
              currentUser.usdtBalance = (currentUser.usdtBalance || 0) + creditedAmt;
            }
            updateBalanceDisplays();

            // Clear current payment tracking
            currentPaymentId = null;
            if (paymentsCache) delete paymentsCache[curKey];
            const localKey = currentUser ? `gigachain_dep_${currentUser.id}_${curKey}` : null;
            if (localKey) {
              localStorage.removeItem(localKey + '_pid');
              localStorage.setItem(localKey + '_confirmed', '1'); // Mark confirmed
            }
            if (depositCheckInterval) {
              clearInterval(depositCheckInterval);
              depositCheckInterval = null;
            }

            logUserActivity({
              type: 'Deposit',
              asset: `USDT (${meta.label || 'BEP20'})`,
              amount: `+$${creditedAmt.toFixed(2)} USDT`,
              rawAmount: creditedAmt,
              txHash: data.tx_hash || generateTxHash(),
              status: 'Completed',
              notes: `On-chain deposit verified & credited automatically`
            });
            syncBalanceToSupabase('deposit_confirmed');

            closeDeposit();
            showDepositSuccessModal({
              amount: creditedAmt,
              networkName: meta.name || 'USDT (BEP20 - BNB Smart Chain)',
              txHash: data.tx_hash
            });
            showToast(`🎉 Deposit of $${creditedAmt.toFixed(2)} USDT Received and Credited to Vault!`, 'success');
          }
        } else if (data && data.already_credited) {
          // Server says already credited — stop polling, mark confirmed locally
          currentPaymentId = null;
          if (paymentsCache) delete paymentsCache[curKey];
          const localKey = currentUser ? `gigachain_dep_${currentUser.id}_${curKey}` : null;
          if (localKey) {
            localStorage.removeItem(localKey + '_pid');
            localStorage.setItem(localKey + '_confirmed', '1');
          }
          if (depositCheckInterval) {
            clearInterval(depositCheckInterval);
            depositCheckInterval = null;
          }
        }
      })
      .catch(() => { });
  }
}

/* --------------------------------------------------------------------------
   3. Withdrawal Modal & Actions (6% Service Charge & Email OTP Verification)
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
  const feeDisplay = document.getElementById('withdrawFeeDisplay');
  const receiveDisplay = document.getElementById('withdrawReceiveDisplay');
  const emailInput = document.getElementById('withdrawEmailInput');
  const getOtpBtn = document.getElementById('withdrawGetOtpBtn');
  const otpContainer = document.getElementById('withdrawOtpContainer');
  const otpInput = document.getElementById('withdrawOtpInput');
  const otpTimer = document.getElementById('withdrawOtpTimer');
  const submitBtn = document.getElementById('submitWithdrawBtn');

  let otpCountdownInterval = null;

  function openWithdraw() {
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
    // Pre-fill user's email if available
    if (emailInput && (!emailInput.value || emailInput.value.includes('crypto.member'))) {
      emailInput.value = currentUser.email || '';
    }
    calculateReceive();
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

  // 6% Service Charge Calculation
  function calculateReceive() {
    const asset = assetSelect ? assetSelect.value : 'USDT';
    const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
    const feeRate = 0.06; // 6% Service Charge
    const fee = amount * feeRate;
    const receive = Math.max(0, amount - fee);

    if (feeDisplay) {
      feeDisplay.textContent = `${fee.toFixed(2)} ${asset}`;
    }
    if (receiveDisplay) {
      receiveDisplay.textContent = `${receive.toFixed(2)} ${asset}`;
    }
    return { fee, receive };
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
      const maxAvailable = currentUser.usdtBalance;
      amountInput.value = maxAvailable.toFixed(2);
      calculateReceive();
    });
  }

  // Format MM:SS for OTP countdown
  function formatMinutes(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // GET OTP BUTTON CLICK HANDLER
  if (getOtpBtn) {
    getOtpBtn.addEventListener('click', async () => {
      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      if (!email || !email.includes('@') || !email.includes('.')) {
        showToast('Please enter a valid email address to receive OTP.', 'error');
        if (emailInput) emailInput.focus();
        return;
      }

      const asset = assetSelect ? assetSelect.value : 'USDT';
      const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
      const maxAvailable = asset === 'GIGA' ? currentUser.gigaBalance : currentUser.usdtBalance;

      if (amount <= 0) {
        showToast('Please enter a valid withdrawal amount first.', 'error');
        if (amountInput) amountInput.focus();
        return;
      }

      if (amount < 50) {
        showToast('Minimum withdrawal amount is $50 USDT.', 'error');
        if (amountInput) amountInput.focus();
        return;
      }

      if (amount > maxAvailable) {
        showToast(`Insufficient balance! Available: ${maxAvailable.toFixed(2)} ${asset}`, 'error');
        return;
      }

      const origBtnContent = getOtpBtn.innerHTML;
      getOtpBtn.disabled = true;
      getOtpBtn.classList.add('opacity-70', 'cursor-not-allowed');
      getOtpBtn.innerHTML = `
        <svg class="animate-spin -ml-0.5 mr-1 h-3 w-3 text-amber-500 inline-block" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Sending...</span>
      `;

      try {
        const response = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, type: 'withdrawal' })
        });

        const data = await response.json();

        if (data.success) {
          window.chainvioraWithdrawOtpToken = data.token;
          window.chainvioraWithdrawOtpEmail = email;

          // Open OTP Box dynamically
          if (otpContainer) {
            otpContainer.classList.remove('hidden');
          }
          if (otpInput) {
            otpInput.value = '';
            otpInput.focus();
          }

          if (data.devOtp) {
            showToast(`Security OTP: ${data.devOtp} (Testing Code Generated) ✉️`, 'success');
          } else {
            showToast(`Security code sent to ${email}! Check your inbox ✉️`, 'success');
          }

          // 3-Minute (180s) Timer Countdown
          let timeLeft = 180;
          if (otpCountdownInterval) clearInterval(otpCountdownInterval);
          getOtpBtn.innerHTML = `<span>Sent ✓</span>`;

          if (otpTimer) {
            otpTimer.innerHTML = `<span class="text-[11px] text-amber-700 font-mono font-bold">Resend in ${formatMinutes(timeLeft)}</span>`;
          }

          otpCountdownInterval = setInterval(() => {
            timeLeft--;
            if (otpTimer) {
              otpTimer.innerHTML = `<span class="text-[11px] text-amber-700 font-mono font-bold">Resend in ${formatMinutes(timeLeft)}</span>`;
            }

            if (timeLeft <= 0) {
              clearInterval(otpCountdownInterval);
              getOtpBtn.disabled = false;
              getOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
              getOtpBtn.innerHTML = `<span>Resend OTP ↺</span>`;
            }
          }, 1000);

        } else {
          getOtpBtn.disabled = false;
          getOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
          getOtpBtn.innerHTML = origBtnContent;
          showToast(data.message || 'Could not send verification email.', 'error');
        }
      } catch (err) {
        console.error('Withdrawal OTP fetch error:', err);
        getOtpBtn.disabled = false;
        getOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        getOtpBtn.innerHTML = origBtnContent;
        showToast('Error connecting to OTP verification server.', 'error');
      }
    });
  }

  // HANDLE WITHDRAWAL FORM SUBMIT (WITH OTP VERIFICATION)
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const asset = assetSelect ? assetSelect.value : 'USDT';
      const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
      const destInput = document.getElementById('withdrawDestinationInput');
      const destination = destInput ? destInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const enteredOtp = otpInput ? otpInput.value.trim() : '';

      const maxAvailable = asset === 'GIGA' ? currentUser.gigaBalance : currentUser.usdtBalance;

      if (amount <= 0) {
        showToast('Please enter a valid withdrawal amount.', 'error');
        return;
      }

      if (amount < 50) {
        showToast('Minimum withdrawal amount is $50 USDT.', 'error');
        if (amountInput) amountInput.focus();
        return;
      }

      if (amount > maxAvailable) {
        showToast(`Insufficient ${asset} balance! Max available: ${maxAvailable.toFixed(2)}`, 'error');
        return;
      }

      if (!destination || destination.length < 10) {
        showToast('Please enter a valid destination wallet address.', 'error');
        return;
      }

      // Check OTP step
      if (!window.chainvioraWithdrawOtpToken) {
        showToast('Please click "Get OTP" first to receive your security verification code.', 'error');
        if (getOtpBtn) getOtpBtn.focus();
        return;
      }

      if (!enteredOtp || enteredOtp.length !== 6) {
        showToast('Please enter the 6-digit OTP code sent to your email.', 'error');
        if (otpInput) otpInput.focus();
        return;
      }

      // Submit button loading state
      const origSubmitText = submitBtn ? submitBtn.innerHTML : 'Confirm & Withdraw Funds';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
        submitBtn.innerHTML = `
          <svg class="animate-spin -ml-0.5 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Verifying OTP & Processing...</span>
        `;
      }

      try {
        // Verify OTP via Serverless API
        const verifyRes = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: window.chainvioraWithdrawOtpEmail || email,
            otp: enteredOtp,
            token: window.chainvioraWithdrawOtpToken
          })
        });

        const verifyData = await verifyRes.json();

        if (!verifyData.success) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            submitBtn.innerHTML = origSubmitText;
          }
          showToast(verifyData.message || 'Incorrect OTP code. Please enter the valid code.', 'error');
          if (otpInput) otpInput.focus();
          return;
        }

        // OTP Verified Successfully! Proceed with Withdrawal
        const { fee, receive } = calculateReceive();

        // Deduct balance
        if (asset === 'GIGA') {
          currentUser.gigaBalance -= amount;
        } else {
          currentUser.usdtBalance -= amount;
        }
        updateBalanceDisplays();

        // Add to user activity history & sync
        const txHash = generateTxHash();
        logUserActivity({
          type: 'Withdrawal',
          asset: `${asset} (-6% Fee)`,
          amount: `-${amount.toFixed(2)} ${asset}`,
          rawAmount: amount,
          txHash: txHash,
          status: 'Pending',
          notes: `Address: ${destination} | Net: ${receive.toFixed(2)} ${asset} | Fee: ${fee.toFixed(2)} ${asset}`
        });
        syncBalanceToSupabase('withdrawal');

        closeWithdraw();
        showToast(`Withdrawal of ${amount.toFixed(2)} ${asset} successfully submitted! (Received: ${receive.toFixed(2)} ${asset} after 6% fee) 🚀`, 'success');

        // Reset Form & OTP state
        form.reset();
        window.chainvioraWithdrawOtpToken = null;
        window.chainvioraWithdrawOtpEmail = null;
        if (otpCountdownInterval) clearInterval(otpCountdownInterval);
        if (otpContainer) otpContainer.classList.add('hidden');
        if (otpInput) otpInput.value = '';
        if (getOtpBtn) {
          getOtpBtn.disabled = false;
          getOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
          getOtpBtn.innerHTML = `<span>Get OTP</span>`;
        }
        calculateReceive();

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
          submitBtn.innerHTML = origSubmitText;
        }

      } catch (err) {
        console.error('Withdrawal processing error:', err);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
          submitBtn.innerHTML = origSubmitText;
        }
        showToast('Error verifying OTP: ' + err.message, 'error');
      }
    });
  }
}

/* --------------------------------------------------------------------------
   4. User Activity & Transaction History System (Per-User Isolated & Synced)
   -------------------------------------------------------------------------- */
function generateTxHash() {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getUserTxStorageKey() {
  const emailKey = currentUser.email
    ? currentUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_')
    : (currentUser._emailKey || 'guest');
  return `cv_txs_${emailKey}`;
}

function getUserTransactions() {
  try {
    const raw = localStorage.getItem(getUserTxStorageKey());
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveUserTransactions(txs) {
  try {
    if (!Array.isArray(txs)) return;
    localStorage.setItem(getUserTxStorageKey(), JSON.stringify(txs.slice(0, 100)));
  } catch (e) {
    console.warn('Failed to save transactions to localStorage:', e);
  }
}

function formatTxDateTime(d) {
  const dt = d ? (d instanceof Date ? d : new Date(d)) : new Date();
  if (isNaN(dt.getTime())) return 'Recent';
  return dt.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getTxBadgeConfig(type) {
  const norm = (type || '').toLowerCase();
  if (norm.includes('deposit')) {
    return {
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: `<svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>`
    };
  }
  if (norm.includes('buy')) {
    return {
      className: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: `<svg class="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>`
    };
  }
  if (norm.includes('sell') || norm.includes('profit')) {
    return {
      className: 'bg-purple-50 text-purple-700 border-purple-200',
      icon: `<svg class="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`
    };
  }
  if (norm.includes('withdraw')) {
    return {
      className: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: `<svg class="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>`
    };
  }
  if (norm.includes('referral') || norm.includes('bonus')) {
    return {
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: `<svg class="w-3.5 h-3.5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg>`
    };
  }
  return {
    className: 'bg-slate-50 text-slate-700 border-slate-200',
    icon: `<svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>`
  };
}

function getTxStatusBadgeClass(status) {
  const norm = (status || 'completed').toLowerCase();
  if (norm === 'completed' || norm === 'confirmed') {
    return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
  }
  if (norm === 'pending' || norm === 'processing') {
    return 'bg-amber-100 text-amber-800 border border-amber-200';
  }
  if (norm === 'failed' || norm === 'rejected') {
    return 'bg-rose-100 text-rose-800 border border-rose-200';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

function logUserActivity(item) {
  if (!item) return;
  const txs = getUserTransactions();

  const formattedTime = item.time || formatTxDateTime(item.isoTime || new Date());
  const isoTime = item.isoTime || new Date().toISOString();
  const txHash = item.txHash || generateTxHash();

  const newTx = {
    id: item.id || ('act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
    type: item.type || 'Activity',
    asset: item.asset || 'USDT',
    amount: String(item.amount || '$0.00'),
    rawAmount: item.rawAmount || 0,
    txHash: txHash,
    time: formattedTime,
    isoTime: isoTime,
    status: item.status || 'Completed',
    notes: item.notes || '',
    orderId: item.orderId || null
  };

  // Avoid duplicate records if hash or orderId already matches
  const duplicate = txs.some(t =>
    (t.txHash && t.txHash === newTx.txHash) ||
    (newTx.orderId && t.orderId === newTx.orderId && t.type === newTx.type)
  );

  if (!duplicate) {
    txs.unshift(newTx);
    saveUserTransactions(txs);
  }

  // Sync to backend database
  const dbType = newTx.type.toLowerCase().replace(/\s+/g, '_');
  recordTxToSupabase(
    dbType,
    newTx.rawAmount || parseFloat((newTx.amount + '').replace(/[^0-9.-]/g, '')) || 0,
    newTx.asset.includes('GIGA') ? 1 : 0,
    newTx.orderId,
    `[${newTx.asset}] ${newTx.notes || newTx.type} (Tx: ${newTx.txHash.slice(0, 10)}...)`,
    newTx.txHash,
    newTx.asset
  );

  // Re-render table immediately
  renderUserTransactionsTable();
}

// Backward-compatible wrapper for any code calling addTransactionRow
function addTransactionRow(type, asset, amount, txHash, time, status) {
  logUserActivity({
    type,
    asset,
    amount,
    txHash: txHash || generateTxHash(),
    time: time && time !== 'Just now' ? time : formatTxDateTime(new Date()),
    status: status || 'Completed'
  });
}

function renderUserTransactionsTable() {
  const table = document.getElementById('transactionHistoryTable');
  if (!table) return;

  const txs = getUserTransactions();
  const countBadge = document.getElementById('txCountBadge');
  if (countBadge) {
    countBadge.textContent = `${txs.length} ${txs.length === 1 ? 'Activity' : 'Activities'}`;
  }

  if (txs.length === 0) {
    table.innerHTML = `
      <tr id="emptyTxRow" class="text-center">
        <td colspan="6" class="py-10 text-center text-slate-400 font-medium">
          <div class="flex flex-col items-center justify-center gap-2">
            <svg class="w-8 h-8 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p class="text-xs">No transactions yet. Deposit funds to get started.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = txs.map(tx => {
    const badge = getTxBadgeConfig(tx.type);
    const amountStr = String(tx.amount || '');
    const isPositive = amountStr.startsWith('+') || (!amountStr.startsWith('-') && (tx.type === 'Deposit' || tx.type.includes('Profit') || tx.type.includes('Bonus')));
    const amountClass = isPositive ? 'text-emerald-600 font-bold' : (amountStr.startsWith('-') ? 'text-rose-600 font-bold' : 'text-slate-800 font-bold');
    const hash = tx.txHash || '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const shortHash = hash.length > 14 ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : hash;
    const timeDisplay = tx.time || formatTxDateTime(tx.isoTime);

    return `
      <tr class="hover:bg-amber-50/20 transition-colors animate-fade-in">
        <td class="py-3.5 px-4">
          <span class="inline-flex items-center gap-1.5 font-bold ${badge.className} px-2.5 py-1 rounded-md border text-[11px]">
            ${badge.icon}
            ${escapeHtml(tx.type)}
          </span>
        </td>
        <td class="py-3.5 px-4 font-bold text-slate-800">${escapeHtml(tx.asset || 'USDT')}</td>
        <td class="py-3.5 px-4 font-mono ${amountClass}">${escapeHtml(amountStr)}</td>
        <td class="py-3.5 px-4 font-mono text-slate-500">
          <button type="button" onclick="navigator.clipboard.writeText('${hash}').then(() => showToast('Tx Hash copied: ${shortHash} 📋', 'success'))" title="Click to copy full hash: ${hash}" class="inline-flex items-center gap-1 hover:text-amber-600 transition-colors cursor-pointer group">
            <span>${shortHash}</span>
            <svg class="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </td>
        <td class="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">${escapeHtml(timeDisplay)}</td>
        <td class="py-3.5 px-4 text-right">
          <span class="px-2.5 py-0.5 rounded-full ${getTxStatusBadgeClass(tx.status)} font-bold text-[10px] uppercase tracking-wider">${escapeHtml(tx.status || 'Completed')}</span>
        </td>
      </tr>
    `;
  }).join('');
}

async function syncTransactionsFromDb() {
  try {
    const email = currentUser.email;
    const uid = currentUser.id || localStorage.getItem('supabase_user_id');
    if (!email && !uid) return;

    const res = await fetch(`/api/record-transaction?email=${encodeURIComponent(email || '')}&user_id=${encodeURIComponent(uid || '')}`);
    if (!res.ok) return;

    const json = await res.json();
    if (json.success && Array.isArray(json.transactions) && json.transactions.length > 0) {
      const localTxs = getUserTransactions();
      let changed = false;

      json.transactions.forEach(dbTx => {
        // Map database record to UI transaction object
        const rawType = (dbTx.type || '').toLowerCase();
        let displayType = 'Activity';
        let displayAsset = dbTx.asset || 'USDT';
        let displayAmount = '+$0.00';
        let rawAmt = parseFloat(dbTx.amount_usdt) || 0;

        if (rawType.includes('deposit')) {
          displayType = 'Deposit';
          displayAsset = dbTx.asset || 'USDT (BEP20)';
          displayAmount = `+$${rawAmt.toFixed(2)} USDT`;
        } else if (rawType.includes('buy')) {
          displayType = 'Buy GIGA';
          displayAsset = '1 GIGA ($30.00)';
          displayAmount = `-$30.00 USDT`;
          rawAmt = 30.00;
        } else if (rawType.includes('sell') || rawType.includes('profit')) {
          displayType = 'Sell Profit';
          displayAsset = 'USDT';
          displayAmount = `+$${(rawAmt > 0 ? rawAmt : 50.00).toFixed(2)} USDT`;
          rawAmt = rawAmt > 0 ? rawAmt : 50.00;
        } else if (rawType.includes('withdraw')) {
          displayType = 'Withdrawal';
          displayAsset = dbTx.asset || 'USDT (-6% Fee)';
          displayAmount = `-$${rawAmt.toFixed(2)}`;
        } else if (rawType.includes('referral') || rawType.includes('bonus')) {
          displayType = 'Referral Bonus';
          displayAsset = 'USDT';
          displayAmount = `+$${rawAmt.toFixed(2)} USDT`;
        }

        // Extract hash from notes if column doesn't have it
        let txHash = dbTx.tx_hash;
        if (!txHash && dbTx.notes) {
          const match = dbTx.notes.match(/0x[a-fA-F0-9]{16,64}/);
          if (match) txHash = match[0];
        }
        if (!txHash) {
          txHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        }

        const mappedItem = {
          id: dbTx.id,
          type: displayType,
          asset: displayAsset,
          amount: displayAmount,
          rawAmount: rawAmt,
          txHash: txHash,
          time: formatTxDateTime(dbTx.created_at),
          isoTime: dbTx.created_at || new Date().toISOString(),
          status: dbTx.status === 'completed' ? 'Completed' : (dbTx.status || 'Completed'),
          notes: dbTx.notes || '',
          orderId: dbTx.order_id || null
        };

        const alreadyExists = localTxs.some(t =>
          (dbTx.id && t.id === dbTx.id) ||
          (t.txHash && t.txHash === mappedItem.txHash) ||
          (mappedItem.orderId && t.orderId === mappedItem.orderId && t.type === mappedItem.type)
        );

        if (!alreadyExists) {
          localTxs.push(mappedItem);
          changed = true;
        }
      });

      if (changed) {
        // Sort descending by date
        localTxs.sort((a, b) => new Date(b.isoTime || 0) - new Date(a.isoTime || 0));
        saveUserTransactions(localTxs);
        renderUserTransactionsTable();
      }
    }
  } catch (err) {
    console.warn('DB transactions sync skipped:', err.message);
  }
}

function initUserActivityHistory() {
  // 1. Initial render from local per-user storage
  renderUserTransactionsTable();

  // 2. Sync from database in background
  syncTransactionsFromDb();
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
   7. Referral System ($5 Fixed Bonus for $30+ Deposit, Tracking & Invited Modal)
   -------------------------------------------------------------------------- */
function initReferralSystem() {
  const codeDisplay = document.getElementById('userRefCodeDisplay');
  const linkInput = document.getElementById('userRefLinkInput');
  const copyCodeBtn = document.getElementById('copyRefCodeBtn');
  const copyLinkBtn = document.getElementById('copyRefLinkBtn');
  const shareBtn = document.getElementById('shareRefBtn');
  const refCountEl = document.getElementById('totalReferralsCount');
  const refEarnedEl = document.getElementById('totalReferralEarned');
  const invitedCardBtn = document.getElementById('invitedCardBtn');

  // Modal elements
  const invitedModal = document.getElementById('invitedUsersModal');
  const closeInvitedBtn = document.getElementById('closeInvitedModal');
  const closeFooterBtn = document.getElementById('modalCloseFooterBtn');
  const modalCopyLinkBtn = document.getElementById('modalCopyRefLinkBtn');
  const modalEarnedEl = document.getElementById('modalReferralEarned');
  const modalQualifiedEl = document.getElementById('modalQualifiedCount');
  const modalCodeDisplay = document.getElementById('modalRefCodeDisplay');
  const tableBody = document.getElementById('invitedUsersTableBody');
  const emptyState = document.getElementById('invitedUsersEmpty');

  if (codeDisplay) {
    codeDisplay.textContent = currentUser.referralCode;
  }
  if (modalCodeDisplay) {
    modalCodeDisplay.textContent = currentUser.referralCode;
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

  // Helper: Retrieve and merge referrals from Backend + LocalStorage
  async function loadReferrals() {
    let list = [];

    // 1. Read local storage cache
    try {
      const local = JSON.parse(localStorage.getItem(`chainviora_ref_list_${currentUser.referralCode}`) || '[]');
      if (Array.isArray(local)) list = local;
    } catch (e) { }

    // 2. Fetch from backend API
    try {
      const res = await fetch(`/api/get-referrals?ref_code=${currentUser.referralCode}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.referrals)) {
          // Merge avoiding email duplicates
          data.referrals.forEach(remote => {
            const idx = list.findIndex(l => l.email?.toLowerCase() === remote.email?.toLowerCase());
            if (idx >= 0) {
              list[idx] = { ...list[idx], ...remote };
            } else {
              list.push(remote);
            }
          });
        }
      }
    } catch (apiErr) {
      console.warn('Referrals API fetch skipped:', apiErr.message);
    }

    // Cache merged
    localStorage.setItem(`chainviora_ref_list_${currentUser.referralCode}`, JSON.stringify(list));
    localStorage.setItem(`chainviora_ref_count_${currentUser.referralCode}`, list.length.toString());

    return list;
  }

  // Helper: Refresh UI counts and auto-credit new $5 referral bonuses
  async function refreshReferralStats() {
    const list = await loadReferrals();

    const totalInvited = list.length;
    let qualifiedCount = 0;

    list.forEach(item => {
      const isQualified = (parseFloat(item.deposit_amount || item.depositAmount || 0) >= 30) || item.bonus_awarded === true || item.bonusPaid === true;
      if (isQualified) qualifiedCount++;
    });

    const totalEarned = qualifiedCount * 5.00;

    // Update Refer & Earn box on dashboard
    if (refCountEl) refCountEl.textContent = totalInvited;
    if (refEarnedEl) refEarnedEl.textContent = `$${totalEarned.toFixed(2)}`;

    // Update modal summary stats
    if (modalEarnedEl) modalEarnedEl.textContent = `$${totalEarned.toFixed(2)}`;
    if (modalQualifiedEl) modalQualifiedEl.textContent = `${qualifiedCount} Qualified`;

    // ✅ AUTO-CREDIT REFERRAL BONUS TO MAIN BALANCE:
    // Check if new bonuses were earned that haven't been credited locally yet
    const creditedKey = `cv_ref_bonus_credited_${currentUser.referralCode}`;
    const alreadyCredited = parseFloat(localStorage.getItem(creditedKey) || '0');

    if (totalEarned > alreadyCredited) {
      const bonusDiff = totalEarned - alreadyCredited;
      currentUser.usdtBalance = (currentUser.usdtBalance || 0) + bonusDiff;
      localStorage.setItem(creditedKey, totalEarned.toString());

      updateBalanceDisplays();
      syncBalanceToSupabase('referral_bonus');
      const refTxHash = generateTxHash();
      logUserActivity({
        type: 'Referral Bonus',
        asset: 'USDT',
        amount: `+$${bonusDiff.toFixed(2)} USDT`,
        rawAmount: bonusDiff,
        txHash: refTxHash,
        status: 'Completed',
        notes: `Referral Bonus: +$${bonusDiff.toFixed(2)} USDT from invited friends`
      });

      showToast(`🎉 +$${bonusDiff.toFixed(2)} Referral Bonus credited to your main balance from invited friends' deposit!`, 'success');
    }

    return list;
  }

  // Helper: Render Invited Users List Table inside Modal
  function renderInvitedModal(list) {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!list || list.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    list.forEach(user => {
      const username = user.username || 'Member';
      const email = user.email || 'user@example.com';
      const date = user.date || (user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent');
      const depositAmt = parseFloat(user.deposit_amount || user.depositAmount || 0);
      const isQualified = depositAmt >= 30 || user.bonus_awarded === true || user.bonusPaid === true;

      const tr = document.createElement('tr');
      tr.className = 'hover:bg-amber-50/40 transition-colors';
      tr.innerHTML = `
        <td class="py-3 px-3">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 text-white font-black flex items-center justify-center text-[10px] shadow-2xs shrink-0">
              ${username.slice(0, 2).toUpperCase()}
            </div>
            <div class="min-w-0">
              <div class="font-bold text-slate-800 text-xs truncate">${username}</div>
              <div class="text-[11px] text-slate-400 font-mono truncate">${email}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-3 text-center">
          <span class="font-mono font-bold ${depositAmt > 0 ? 'text-emerald-700' : 'text-slate-400'} text-xs">
            $${depositAmt.toFixed(2)}
          </span>
          <div class="text-[9px] text-slate-400">${date}</div>
        </td>
        <td class="py-3 px-3 text-right">
          ${isQualified
          ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                <span>✓</span> +$5.00 Earned
              </span>`
          : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <span>⏳</span> Pending ($30+ needed)
              </span>`
        }
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // Initial stats calculation
  refreshReferralStats();

  // Open Modal Handler (when clicking on "Invited" box)
  if (invitedCardBtn) {
    invitedCardBtn.addEventListener('click', async () => {
      if (!invitedModal) return;
      invitedModal.classList.remove('hidden');
      invitedModal.classList.add('flex');

      // Refresh list
      const list = await refreshReferralStats();
      renderInvitedModal(list);
    });
  }

  // Close Modal Handlers
  function closeInvitedModal() {
    if (invitedModal) {
      invitedModal.classList.add('hidden');
      invitedModal.classList.remove('flex');
    }
  }

  if (closeInvitedBtn) closeInvitedBtn.addEventListener('click', closeInvitedModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeInvitedModal);
  if (invitedModal) {
    invitedModal.addEventListener('click', (e) => {
      if (e.target === invitedModal) closeInvitedModal();
    });
  }

  // Modal Copy Link Button
  if (modalCopyLinkBtn) {
    modalCopyLinkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(refLink);
        showToast('Referral link copied! Share with friends 🚀', 'success');
      } catch (e) {
        showToast(`Referral Link: ${refLink}`, 'info');
      }
    });
  }

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
      const shareText = `🚀 Welcome to the GIGACHAIN Ecosystem!

The Next-Generation Decentralized Liquidity Protocol powering Fixed-Rate Trading, Algorithmic Peer-to-Peer Queue Matching, and Realized Yield Distribution.

🎁 Special Invitation Bonus:
Sign up using my Referral Code: ${currentUser.referralCode} to unlock your verified Web3 account and claim an instant +$5.00 USDT Welcome Bonus on your first vault deposit!

🔥 Why Join GIGACHAIN?
✅ 100% On-Chain Verifiable on BNB Smart Chain (BEP20)
✅ Fixed-Rate $30 GIGA Buy & $50 Queue Sell Settlement
✅ Algorithmic Queue Matching & Fast P2P Settlements
✅ Automated Cross-Device Synchronized Vault

👉 Register & Claim Your Access Here:
${refLink}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'GIGACHAIN Protocol — Web3 Ecosystem',
            text: shareText
          });
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return;
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

  // ✅ User-specific localStorage key prefix — ensures total data isolation
  const userEmail = currentUser.email ? currentUser.email.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'guest';
  const KEY_POOL = `cv_pool_${userEmail}`;
  const KEY_SELLS = `cv_sells_${userEmail}`;
  const KEY_BALANCE = `cv_balance_${userEmail}`;

  // 1. Get or generate 100 GIGA buy pool (user-specific)
  function getPool() {
    let pool = [];
    const saved = localStorage.getItem(KEY_POOL);
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
      localStorage.setItem(KEY_POOL, JSON.stringify(pool));
    }
    return pool;
  }

  function savePool(pool) {
    localStorage.setItem(KEY_POOL, JSON.stringify(pool));
  }

  // 2. Get user's pending sell list (user-specific)
  function getPendingSells() {
    let pending = [];
    const saved = localStorage.getItem(KEY_SELLS);
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
    localStorage.setItem(KEY_SELLS, JSON.stringify(pending));
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
    window.renderPendingSellsGlobal = renderPendingSells;
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
    updateBalanceDisplays();

    if (!pendingContainer) return;

    if (pending.length === 0) {
      pendingContainer.innerHTML = `
        <div id="emptyPendingSellNotice" class="p-6 rounded-xl border border-dashed border-slate-200 text-center text-slate-400">
          <svg class="w-8 h-8 text-slate-300 mx-auto mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-xs font-medium">No GIGA in Sell queue.</p>
          <p class="text-[11px] text-slate-400 mt-0.5">When you buy from the 100 pool, it appears here as Pending Sell.</p>
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
              <p class="text-[10px] text-slate-500">${item.completedAt || item.timestamp}</p>
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
        const matched = item.matchedBuyers || 0;
        card.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between hover:border-amber-300 transition-colors shadow-2xs';
        card.innerHTML = `
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs shadow-xs">
              ⏳
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-mono font-bold text-slate-900 text-xs">${item.orderId}</span>
                <span class="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">1 GIGA</span>
              </div>
              <p class="text-[10px] text-slate-400">${item.timestamp} • Unit: $30.00</p>
            </div>
          </div>
          <div class="text-right">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border-amber-300 font-bold text-[10px] border">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Pending Sell
            </span>
            <!-- Hidden from UI, preserved in background and DOM -->
            <p class="hidden text-[10px] font-mono font-bold text-slate-500 mt-0.5" data-matched="${matched}">
              ${matched === 1 ? 'Waiting for 2nd Buyer' : 'In Queue (0/2)'}
            </p>
          </div>
        `;
      }
      pendingContainer.appendChild(card);
    });
  }

  // 5. Execute Buy Action (Database-backed with 2-Buyer Matching)
  async function executeBuyGiga(specificOrderId = null) {
    const cost = 30.00;

    // Verify main balance has at least $30 USDT
    if (currentUser.usdtBalance < cost) {
      showToast(`Insufficient USDT Balance! You have $${currentUser.usdtBalance.toFixed(2)}, but need $30.00 to buy 1 GIGA. Please Deposit funds first.`, 'error');
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
    currentUser.totalGigaBought = (currentUser.totalGigaBought || 0) + 1;
    currentUser.gigaBalance = currentUser.totalGigaBought;
    updateBalanceDisplays();

    // Generate unique background order ID (saved in database, hidden from user)
    const backgroundOrderId = `GIGA-ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const sellOrderId = `#SELL-${Math.floor(100000 + Math.random() * 900000)}`;
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 2-Buyer Matching on active pending sell queue:
    // Check if user (or any seller) has an existing pending order waiting for buyers
    const pending = getPendingSells();
    let oldestWaiting = null;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].status !== 'Completed' && (pending[i].matchedBuyers || 0) < 2) {
        oldestWaiting = pending[i];
        break;
      }
    }

    if (oldestWaiting) {
      oldestWaiting.matchedBuyers = (oldestWaiting.matchedBuyers || 0) + 1;
      if (oldestWaiting.matchedBuyers >= 2) {
        oldestWaiting.status = 'Completed';
        oldestWaiting.completedAt = nowTime;
        // Credit $50.00 profit to user's withdrawable USDT balance and lifetime profit!
        currentUser.lifetimeProfit = (currentUser.lifetimeProfit || 0) + 50.00;
        currentUser.usdtBalance = (currentUser.usdtBalance || 0) + 50.00;
        currentUser.totalGigaSold = (currentUser.totalGigaSold || 0) + 1;
        updateBalanceDisplays();

        const profitTxHash = generateTxHash();
        logUserActivity({
          type: 'Sell Profit',
          asset: 'USDT',
          amount: '+$50.00 USDT',
          rawAmount: 50.00,
          txHash: profitTxHash,
          orderId: oldestWaiting.orderId,
          status: 'Completed',
          notes: `Sell Queue ${oldestWaiting.orderId} completed (2 buyers matched) — +$50.00 Profit credited`
        });
        syncBalanceToSupabase('sell_profit_credited');

        showToast(`🎉 Order ${oldestWaiting.orderId} Completed! 2 buyers matched — $50.00 Profit added!`, 'success');
      }
    }

    // Insert new pending sell order for this purchased GIGA
    pending.unshift({
      orderId: sellOrderId,
      backgroundOrderId: backgroundOrderId,
      amount: 1,
      price: cost,
      profit: 50.00,
      matchedBuyers: 0,
      requiredBuyers: 2,
      timestamp: nowTime,
      status: 'Pending'
    });
    savePendingSells(pending);
    updateBalanceDisplays();

    // Re-blend purchased GIGA back into 100 pool at a randomized position
    // (User cannot see which item in the 100 list belongs to them)
    const pool = getPool();
    const targetIdx = specificOrderId
      ? pool.findIndex(i => i.id === specificOrderId)
      : Math.floor(Math.random() * pool.length);

    const safeIdx = targetIdx >= 0 ? targetIdx : 0;
    pool.splice(safeIdx, 1);
    const randomSlot = Math.floor(Math.random() * pool.length);
    pool.splice(randomSlot, 0, {
      id: `GIGA-${String(Math.floor(1 + Math.random() * 999)).padStart(3, '0')}`,
      backgroundOrderId: backgroundOrderId,
      amount: 1,
      price: 30.00,
      status: 'Available'
    });

    while (pool.length < 100) {
      pool.push({
        id: `GIGA-${String(pool.length + 1).padStart(3, '0')}`,
        backgroundOrderId: `GIGA-ORD-${Math.floor(100000 + Math.random() * 900000)}`,
        amount: 1,
        price: 30.00,
        status: 'Available'
      });
    }
    savePool(pool);

    // Add to user activity history
    const txHash = generateTxHash();
    logUserActivity({
      type: 'Buy GIGA',
      asset: '1 GIGA ($30.00)',
      amount: '-$30.00 USDT',
      rawAmount: 30.00,
      txHash: txHash,
      orderId: sellOrderId,
      status: 'Completed',
      notes: `Bought 1 GIGA ($30.00) — Placed in Sell Queue (${sellOrderId})`
    });

    // ✅ Sync with Supabase Database via API
    try {
      fetch('/api/marketplace-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id || localStorage.getItem('supabase_user_id'),
          email: currentUser.email,
          username: currentUser.username,
          background_order_id: backgroundOrderId
        })
      }).catch(e => console.warn('Marketplace buy API sync notice:', e.message));
    } catch (e) { }

    localStorage.setItem('gigachain_current_user', JSON.stringify(currentUser));
    syncBalanceToSupabase('buy_giga');
    recordTxToSupabase('buy_giga', 30.00, 1, sellOrderId, 'Bought 1 GIGA for $30.00');

    // Re-render UI
    renderPoolTable(searchInput ? searchInput.value : '');
    renderPendingSells();

    // Open Buy Successfully Popup Modal
    openSuccessModal(sellOrderId);
    showToast(`Successfully bought 1 GIGA for $30.00! Placed in Sell queue as Pending`, 'success');
  }

  // 6. Sync user's marketplace orders from Supabase on load
  async function syncMarketplaceOrdersFromDb() {
    try {
      const email = currentUser.email;
      const uid = currentUser.id || localStorage.getItem('supabase_user_id');
      if (!email && !uid) return;

      const res = await fetch(`/api/get-marketplace-orders?email=${encodeURIComponent(email || '')}&user_id=${encodeURIComponent(uid || '')}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.orders) && json.orders.length > 0) {
        const localPending = getPendingSells();
        let changed = false;

        json.orders.forEach(dbOrder => {
          const existing = localPending.find(p => p.orderId === dbOrder.sell_order_code || p.backgroundOrderId === dbOrder.order_id);
          if (existing) {
            const wasComplete = existing.status === 'Completed';
            if (existing.matchedBuyers !== dbOrder.matched_buyers || existing.status !== dbOrder.status) {
              existing.matchedBuyers = dbOrder.matched_buyers;
              existing.status = dbOrder.status === 'completed' ? 'Completed' : 'Pending';
              changed = true;
            }
            if (!wasComplete && dbOrder.status === 'completed') {
              logUserActivity({
                type: 'Sell Profit',
                asset: 'USDT',
                amount: '+$50.00 USDT',
                rawAmount: 50.00,
                txHash: generateTxHash(),
                orderId: dbOrder.sell_order_code || dbOrder.order_id,
                status: 'Completed',
                notes: `Sell Queue ${dbOrder.sell_order_code || dbOrder.order_id} completed — +$50.00 Profit credited`
              });
            }
          } else {
            localPending.unshift({
              orderId: dbOrder.sell_order_code || `#SELL-${Math.floor(100000 + Math.random() * 900000)}`,
              backgroundOrderId: dbOrder.order_id,
              amount: parseFloat(dbOrder.amount) || 1,
              price: parseFloat(dbOrder.unit_price) || 30.00,
              profit: parseFloat(dbOrder.profit_amount) || 50.00,
              matchedBuyers: dbOrder.matched_buyers || 0,
              requiredBuyers: dbOrder.required_buyers || 2,
              timestamp: new Date(dbOrder.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              status: dbOrder.status === 'completed' ? 'Completed' : 'Pending'
            });
            changed = true;
          }
        });

        if (changed) {
          savePendingSells(localPending);
          renderPendingSells();
        }
      }
    } catch (e) {
      console.warn('Marketplace DB sync skipped (offline or initial setup):', e.message);
    }
  }

  // Sync on load
  syncMarketplaceOrdersFromDb();

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

/* --------------------------------------------------------------------------
   8. System Notifications & Admin Broadcasts (Ready for Admin Panel)
   -------------------------------------------------------------------------- */
function initNotificationSystem() {
  const notifBtn = document.getElementById('notificationBtn');
  const notifModal = document.getElementById('notificationModal');
  const closeBtn = document.getElementById('closeNotificationModal');
  const closeFooterBtn = document.getElementById('closeNotificationModalBtn');
  const notifBadge = document.getElementById('notifBadge');
  const listContainer = document.getElementById('notificationListContainer');

  function openNotif() {
    if (!notifModal) return;
    notifModal.classList.remove('hidden');
    notifModal.classList.add('flex');
    if (notifBadge) {
      // Fade out badge ping once user opens notifications
      notifBadge.style.opacity = '0.35';
    }
  }

  function closeNotif() {
    if (!notifModal) return;
    notifModal.classList.add('hidden');
    notifModal.classList.remove('flex');
  }

  if (notifBtn) notifBtn.addEventListener('click', openNotif);
  if (closeBtn) closeBtn.addEventListener('click', closeNotif);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeNotif);

  if (notifModal) {
    notifModal.addEventListener('click', (e) => {
      if (e.target === notifModal) closeNotif();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifModal && !notifModal.classList.contains('hidden')) {
      closeNotif();
    }
  });

  // Load public broadcast announcements from Admin Panel
  try {
    fetch('/api/admin?action=get_public_notifications')
      .then(r => r.json())
      .then(data => {
        if (data && data.success && Array.isArray(data.notifications) && data.notifications.length > 0) {
          if (listContainer) {
            listContainer.innerHTML = '';
            data.notifications.forEach(n => {
              const item = document.createElement('div');
              item.className = 'p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 shadow-2xs';
              item.innerHTML = `
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full ${n.priority === 'high' ? 'bg-rose-500' : 'bg-amber-500'} animate-pulse"></span>
                    <span class="text-xs font-bold text-amber-950 uppercase tracking-wide">${n.type || 'Broadcast'}</span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono">${n.created_at ? new Date(n.created_at).toLocaleDateString() : 'Active'}</span>
                </div>
                <h4 class="text-sm font-bold text-slate-900 mt-2 leading-snug">${n.title || ''}</h4>
                <p class="text-xs text-slate-600 mt-1 leading-relaxed">${n.message || ''}</p>
              `;
              listContainer.appendChild(item);
            });
            if (notifBadge) notifBadge.style.opacity = '1';
          }
        }
      })
      .catch(() => { });
  } catch (e) { }

  // Global helper ready for Admin Panel integration
  window.showAdminBroadcast = function (data) {
    if (!data) return;
    if (listContainer) {
      const item = document.createElement('div');
      item.className = 'p-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-300 shadow-2xs';
      item.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span class="text-xs font-bold text-amber-950 uppercase tracking-wide">${data.type || 'Admin Broadcast'}</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">${data.date || 'Just now'}</span>
        </div>
        <h4 class="text-sm font-bold text-slate-900 mt-2 leading-snug">${data.title || 'Announcement'}</h4>
        <p class="text-xs text-slate-600 mt-1 leading-relaxed">${data.message || ''}</p>
      `;
      listContainer.prepend(item);
    }
    if (notifBadge) notifBadge.style.opacity = '1';
    // Open full screen automatically on arrival
    openNotif();
  };
}

/* --------------------------------------------------------------------------
   About Us & Official Whitepaper Modal Management
   -------------------------------------------------------------------------- */
function initAboutUsModal() {
  const openBtn = document.getElementById('openAboutUsBtn');
  const modal = document.getElementById('aboutUsModal');
  const closeBtn = document.getElementById('closeAboutUsModal');
  const closeFooterBtn = document.getElementById('closeAboutUsModalBtn');
  const aboutTabBtn = document.getElementById('aboutTabBtn');
  const whitepaperTabBtn = document.getElementById('whitepaperTabBtn');
  const aboutTabContent = document.getElementById('aboutTabContent');
  const whitepaperTabContent = document.getElementById('whitepaperTabContent');

  function openModal() {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  }

  function switchTab(activeTab) {
    if (!aboutTabContent || !whitepaperTabContent || !aboutTabBtn || !whitepaperTabBtn) return;
    if (activeTab === 'about') {
      aboutTabContent.classList.remove('hidden');
      whitepaperTabContent.classList.add('hidden');

      aboutTabBtn.className = 'flex-1 py-2 px-4 rounded-lg font-bold text-xs sm:text-sm text-slate-900 bg-white shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200';
      whitepaperTabBtn.className = 'flex-1 py-2 px-4 rounded-lg font-bold text-xs sm:text-sm text-slate-500 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1.5';
    } else {
      aboutTabContent.classList.add('hidden');
      whitepaperTabContent.classList.remove('hidden');

      whitepaperTabBtn.className = 'flex-1 py-2 px-4 rounded-lg font-bold text-xs sm:text-sm text-slate-900 bg-white shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200';
      aboutTabBtn.className = 'flex-1 py-2 px-4 rounded-lg font-bold text-xs sm:text-sm text-slate-500 hover:text-slate-900 transition-all cursor-pointer flex items-center justify-center gap-1.5';
    }
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', closeModal);

  if (aboutTabBtn) aboutTabBtn.addEventListener('click', () => switchTab('about'));
  if (whitepaperTabBtn) whitepaperTabBtn.addEventListener('click', () => switchTab('whitepaper'));

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  // Global trigger
  window.openAboutUsModal = openModal;
}

/* --------------------------------------------------------------------------
   User Profile Modal (Username, Full Name, Register Date, Email)
   -------------------------------------------------------------------------- */
function initUserProfileModal() {
  const modal = document.getElementById('userProfileModal');
  const closeBtn = document.getElementById('closeUserProfileModal');
  const closeFooterBtn = document.getElementById('closeUserProfileModalBtn');
  const welcomeTrigger = document.getElementById('welcomeUsernameContainer');
  const headerTrigger = document.getElementById('headerUsernameContainer');
  const headerUserSpan = document.getElementById('headerUsername');
  const welcomeUserSpan = document.getElementById('welcomeUsername');

  const modalUsername = document.getElementById('profileModalUsername');
  const modalName = document.getElementById('profileModalName');
  const modalEmail = document.getElementById('profileModalEmail');
  const modalRegisterDate = document.getElementById('profileModalRegisterDate');
  const avatarInitial = document.getElementById('profileAvatarInitial');
  const copyUserBtn = document.getElementById('copyProfileUsernameBtn');
  const copyEmailBtn = document.getElementById('copyProfileEmailBtn');

  function formatDate(isoStr) {
    if (!isoStr) return 'Verified Member';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Verified Member';
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return 'Verified Member';
    }
  }

  function updateModalValues() {
    const uName = currentUser.username || 'GIGA000000';
    if (modalUsername) modalUsername.textContent = uName;

    // Display Name
    const fName = currentUser.fullName || currentUser.name || (currentUser.email ? currentUser.email.split('@')[0] : 'Chainviora Member');
    if (modalName) modalName.textContent = fName;

    // Avatar Initial
    if (avatarInitial) {
      const initial = (fName || uName || 'G').trim().charAt(0).toUpperCase();
      avatarInitial.textContent = initial || 'G';
    }

    // Email
    const uEmail = currentUser.email || 'member@chainviora.com';
    if (modalEmail) modalEmail.textContent = uEmail;

    // Register Date
    let regDate = currentUser.createdAt || currentUser.created_at;
    if (!regDate) {
      const savedUserJson = localStorage.getItem('gigachain_current_user');
      if (savedUserJson) {
        try {
          const parsed = JSON.parse(savedUserJson);
          regDate = parsed.createdAt || parsed.loginTime || parsed.passwordUpdated;
        } catch (e) { }
      }
    }
    if (modalRegisterDate) {
      modalRegisterDate.textContent = formatDate(regDate);
    }
  }

  window.openProfileModal = function () {
    if (!modal) return;
    updateModalValues();

    // Fetch live fresh profile details from server
    if (currentUser.email) {
      fetch(`/api/update-balance?email=${encodeURIComponent(currentUser.email)}`)
        .then(r => r.json())
        .then(d => {
          if (d && d.success) {
            if (d.full_name) currentUser.fullName = d.full_name;
            if (d.created_at) currentUser.createdAt = d.created_at;
            if (d.username) currentUser.username = d.username;
            updateModalValues();
            localStorage.setItem('gigachain_current_user', JSON.stringify(currentUser));
          }
        })
        .catch(() => { });
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
  };

  window.closeProfileModal = function () {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
  };

  if (welcomeTrigger) welcomeTrigger.addEventListener('click', window.openProfileModal);
  if (welcomeUserSpan) welcomeUserSpan.addEventListener('click', (e) => {
    e.stopPropagation();
    window.openProfileModal();
  });
  if (headerTrigger) headerTrigger.addEventListener('click', (e) => {
    if (e.target.closest('#copyUsernameBtn')) return;
    window.openProfileModal();
  });
  if (headerUserSpan) headerUserSpan.addEventListener('click', (e) => {
    e.stopPropagation();
    window.openProfileModal();
  });

  if (closeBtn) closeBtn.addEventListener('click', window.closeProfileModal);
  if (closeFooterBtn) closeFooterBtn.addEventListener('click', window.closeProfileModal);

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) window.closeProfileModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      window.closeProfileModal();
    }
  });

  // Copy Username in modal
  if (copyUserBtn) {
    copyUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const txt = modalUsername ? modalUsername.textContent : currentUser.username;
      navigator.clipboard.writeText(txt).then(() => {
        showToast('Username copied to clipboard! 📋', 'success');
      });
    });
  }

  // Copy Email in modal
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const txt = modalEmail ? modalEmail.textContent : currentUser.email;
      navigator.clipboard.writeText(txt).then(() => {
        showToast('Email address copied to clipboard! 📋', 'success');
      });
    });
  }
}




