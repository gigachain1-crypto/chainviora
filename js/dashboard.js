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

  // Cache: addresses per currency for the current user
  const addressesCache = {};

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

    // 1. If in-memory cache exists
    if (addressesCache[curKey]) {
      updateBadgeAndNote(curKey, addressesCache[curKey], true);
      renderQRCode(addressesCache[curKey]);
      return;
    }

    // 2. Check localStorage cache
    const user = currentUser;
    const localKey = user && user.id ? `gigachain_dep_${user.id}_${curKey}` : null;
    if (localKey) {
      const savedAddr = localStorage.getItem(localKey);
      if (savedAddr) {
        addressesCache[curKey] = savedAddr;
        updateBadgeAndNote(curKey, savedAddr, true);
        renderQRCode(savedAddr);
        return;
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

  function openDeposit() {
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      // Set to selected or default to BEP20
      const currentCur = assetSelect ? assetSelect.value : 'usdtbsc';
      loadDepositAddress(currentCur);
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
      if (!addrInput.value || addrInput.value === '') {
        showToast('Address not loaded yet. Please wait...', 'error');
        return;
      }
      navigator.clipboard.writeText(addrInput.value).then(() => {
        showToast('Deposit address copied to clipboard! 📋', 'success');
      });
    });
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
      const asset = assetSelect ? assetSelect.value : 'USDT';
      const maxAvailable = asset === 'GIGA' ? currentUser.gigaBalance : currentUser.usdtBalance;
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

        // Add to transaction history table with 6% service charge noted
        const txHash = generateTxHash();
        addTransactionRow('Withdrawal', `${asset} (-6% Fee)`, `-${amount.toFixed(2)}`, txHash, 'Just now', 'Confirmed');

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
              Pending Sell
            </span>
            <p class="text-[10px] font-mono font-bold text-slate-500 mt-0.5">In Queue</p>
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

  // 6. Background 2-Buyer Matching & Profit Distribution Engine (Silent Background Processing)
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
      // Silently schedule the second buyer in background (no popup)
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
      addTransactionRow('Sell Complete', '1 GIGA ($50.00)', '+$50.00', txHash, 'Just now', 'Completed');
      // Silently completed in background (no popup)
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


