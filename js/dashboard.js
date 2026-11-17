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
});

// State
let currentUser = {
  username: 'GIGA' + Math.floor(100000 + Math.random() * 900000),
  email: 'crypto.member@chainviora.com',
  referralCode: Math.floor(100000 + Math.random() * 900000).toString(),
  gigaBalance: 0.00,
  usdtBalance: 0.00
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
        parsed.gigaBalance = 0.00;
        parsed.usdtBalance = 0.00;
        localStorage.setItem('gigachain_current_user', JSON.stringify(parsed));
        localStorage.setItem('chainviora_zero_data_v2', 'true');
      } else {
        if (parsed.gigaBalance !== undefined) currentUser.gigaBalance = parseFloat(parsed.gigaBalance) || 0;
        if (parsed.usdtBalance !== undefined) currentUser.usdtBalance = parseFloat(parsed.usdtBalance) || 0;
      }
    } catch (e) {
      console.warn('Error reading saved session:', e);
    }
  } else {
    currentUser.gigaBalance = 0.00;
    currentUser.usdtBalance = 0.00;
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

  const gigaVal = currentUser.gigaBalance * GIGA_PRICE;
  const usdtVal = currentUser.usdtBalance;
  const totalUsd = gigaVal + usdtVal;

  if (gigaDisplay) gigaDisplay.textContent = currentUser.gigaBalance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (gigaUsdDisplay) gigaUsdDisplay.textContent = `$${gigaVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (usdtDisplay) usdtDisplay.textContent = currentUser.usdtBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (usdtUsdDisplay) usdtUsdDisplay.textContent = `$${usdtVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (totalUsdDisplay) totalUsdDisplay.textContent = `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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


