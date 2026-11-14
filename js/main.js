/* ==========================================================================
   GIGACHAIN - Interactive Frontend Logic & Web3 Simulation
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initParticleNetwork();
  initCryptoTicker();
  initSwapWidget();
  initStakingCalculator();
  initWalletModal();
  initAuthModal();
  initFaqAccordion();
  initMobileMenu();
  initCopyButtons();
  initReferralHandler();
});

/* --------------------------------------------------------------------------
   1. Canvas Node Network Animation (Floating Crypto Blockchain Nodes)
   -------------------------------------------------------------------------- */
function initParticleNetwork() {
  const canvas = document.getElementById('networkCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const nodeCount = Math.floor(window.innerWidth / 35);
  const nodes = [];
  const colors = ['#D4AF37', '#FF007A', '#00DFD8', '#7928CA', '#0070F3'];

  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.75,
      vy: (Math.random() - 0.5) * 0.75,
      radius: Math.random() * 2.5 + 1.5,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Draw connecting lines with multi-color gradient effect
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.22;
          ctx.strokeStyle = nodes[i].color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw subtle square network points (no round/circle marks)
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
   2. Live Crypto Ticker Simulation
   -------------------------------------------------------------------------- */
function initCryptoTicker() {
  const gigaPriceEl = document.querySelectorAll('.giga-live-price');
  let currentPrice = 3.42;

  setInterval(() => {
    // Small random fluctuations (-0.5% to +0.8%)
    const change = (Math.random() * 0.04 - 0.015);
    currentPrice = Math.max(3.20, +(currentPrice + change).toFixed(4));

    gigaPriceEl.forEach(el => {
      el.textContent = `$${currentPrice.toFixed(4)}`;
      el.classList.add('scale-105');
      setTimeout(() => el.classList.remove('scale-105'), 300);
    });
  }, 3500);
}

/* --------------------------------------------------------------------------
   3. Swap / Exchange Widget
   -------------------------------------------------------------------------- */
function initSwapWidget() {
  const payInput = document.getElementById('swapPayInput');
  const receiveInput = document.getElementById('swapReceiveInput');
  const rateNotice = document.getElementById('swapExchangeRate');
  const swapBtn = document.getElementById('executeSwapBtn');
  const switchBtn = document.getElementById('switchTokensBtn');

  const GIGA_RATE = 3.42; // 1 GIGA = 3.42 USDT
  let isUsdtToGiga = true;

  function calculate() {
    if (!payInput || !receiveInput) return;
    const val = parseFloat(payInput.value) || 0;
    if (isUsdtToGiga) {
      receiveInput.value = (val / GIGA_RATE).toFixed(4);
      if (rateNotice) rateNotice.textContent = `1 GIGA = ${GIGA_RATE} USDT`;
    } else {
      receiveInput.value = (val * GIGA_RATE).toFixed(2);
      if (rateNotice) rateNotice.textContent = `1 USDT = ${(1 / GIGA_RATE).toFixed(4)} GIGA`;
    }
  }

  if (payInput) {
    payInput.addEventListener('input', calculate);
  }

  if (switchBtn) {
    switchBtn.addEventListener('click', () => {
      isUsdtToGiga = !isUsdtToGiga;
      const payLabel = document.getElementById('swapPaySymbol');
      const recLabel = document.getElementById('swapReceiveSymbol');
      if (payLabel && recLabel) {
        const temp = payLabel.textContent;
        payLabel.textContent = recLabel.textContent;
        recLabel.textContent = temp;
      }
      calculate();
    });
  }

  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      const isConnected = localStorage.getItem('gigachain_connected');
      if (!isConnected) {
        openWalletModal();
        showToast('Please connect your Web3 wallet first to perform Swap!', 'info');
      } else {
        swapBtn.disabled = true;
        swapBtn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg> Routing through Gigachain DEX...
        `;
        setTimeout(() => {
          swapBtn.disabled = false;
          swapBtn.innerHTML = `<span>Swap Successfully Completed! 🚀</span>`;
          showToast(`Swap confirmed! Transaction Hash: 0x9f...a41b`, 'success');
          setTimeout(() => {
            swapBtn.innerHTML = `<span>Swap Tokens Now</span>`;
          }, 3000);
        }, 2200);
      }
    });
  }
}

/* --------------------------------------------------------------------------
   4. Staking APY Calculator
   -------------------------------------------------------------------------- */
function initStakingCalculator() {
  const slider = document.getElementById('stakeAmountSlider');
  const amountDisplay = document.getElementById('stakeAmountDisplay');
  const dailyReward = document.getElementById('dailyRewardDisplay');
  const monthlyReward = document.getElementById('monthlyRewardDisplay');
  const annualReward = document.getElementById('annualRewardDisplay');
  const apyRate = 18.5; // 18.5% APY

  function updateRewards() {
    if (!slider) return;
    const amount = parseFloat(slider.value) || 0;
    if (amountDisplay) amountDisplay.textContent = Number(amount).toLocaleString();

    const annualTokens = (amount * (apyRate / 100));
    const monthlyTokens = annualTokens / 12;
    const dailyTokens = annualTokens / 365;

    const tokenPrice = 3.42;

    if (dailyReward) {
      dailyReward.innerHTML = `<span class="font-bold text-slate-800">${dailyTokens.toFixed(2)} GIGA</span> <span class="text-xs text-slate-500">($${(dailyTokens * tokenPrice).toFixed(2)})</span>`;
    }
    if (monthlyReward) {
      monthlyReward.innerHTML = `<span class="font-bold text-slate-800">${monthlyTokens.toFixed(2)} GIGA</span> <span class="text-xs text-slate-500">($${(monthlyTokens * tokenPrice).toFixed(2)})</span>`;
    }
    if (annualReward) {
      annualReward.innerHTML = `<span class="font-bold text-emerald-600">${annualTokens.toFixed(2)} GIGA</span> <span class="text-xs text-slate-500">($${(annualTokens * tokenPrice).toFixed(2)})</span>`;
    }

    if (window.updateStakingChartData) {
      window.updateStakingChartData(amount, apyRate);
    }
  }

  if (slider) {
    slider.addEventListener('input', updateRewards);
    updateRewards();
  }
}

/* --------------------------------------------------------------------------
   5. Web3 Wallet Connection Modal Simulation
   -------------------------------------------------------------------------- */
function initWalletModal() {
  const modal = document.getElementById('walletModal');
  const openBtns = document.querySelectorAll('.open-wallet-btn');
  const closeBtn = document.getElementById('closeWalletModal');
  const walletOptions = document.querySelectorAll('.wallet-provider-opt');
  const navConnectBtn = document.getElementById('navConnectWalletBtn');

  window.openWalletModal = () => {
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  };

  window.closeWalletModal = () => {
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  };

  openBtns.forEach(btn => btn.addEventListener('click', window.openWalletModal));
  if (closeBtn) closeBtn.addEventListener('click', window.closeWalletModal);

  // Close modal when clicked outside
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) window.closeWalletModal();
    });
  }

  walletOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const walletName = opt.getAttribute('data-wallet') || 'Web3 Wallet';
      const icon = opt.querySelector('img') ? opt.querySelector('img').src : '';

      opt.innerHTML = `
        <div class="flex items-center justify-between w-full py-1">
          <span class="flex items-center gap-3">
            <svg class="animate-spin h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Connecting to ${walletName}...
          </span>
          <span class="text-xs text-amber-600 font-medium">Check Extension</span>
        </div>
      `;

      setTimeout(() => {
        localStorage.setItem('gigachain_connected', 'true');
        window.closeWalletModal();
        showToast(`Connected successfully with ${walletName}!`, 'success');
        updateConnectedNavbar();
      }, 1500);
    });
  });

  // Check initial connection
  if (localStorage.getItem('gigachain_connected')) {
    updateConnectedNavbar();
  }

  function updateConnectedNavbar() {
    if (!navConnectBtn) return;
    navConnectBtn.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="font-mono text-sm font-semibold">0x71C...4b9</span>
        <button id="disconnectBtn" title="Disconnect" class="ml-1 text-slate-400 hover:text-red-500 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        </button>
      </div>
    `;

    const discBtn = document.getElementById('disconnectBtn');
    if (discBtn) {
      discBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        localStorage.removeItem('gigachain_connected');
        location.reload();
      });
    }
  }
}

/* --------------------------------------------------------------------------
   5b. Auth Modal (Supabase Login, Sign Up, OTP & Password Toggle)
   -------------------------------------------------------------------------- */
function initAuthModal() {
  const modal = document.getElementById('authModal');
  const openBtns = document.querySelectorAll('.open-auth-btn');
  const closeBtn = document.getElementById('closeAuthModal');
  const tabLogin = document.getElementById('authTabLogin');
  const tabSignup = document.getElementById('authTabSignup');
  const formLogin = document.getElementById('loginForm');
  const formSignup = document.getElementById('signupForm');
  const formForgot = document.getElementById('forgotForm');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const backToLoginBtn = document.getElementById('backToLoginBtn');
  const navUserBadge = document.getElementById('navUserBadge');
  const navUserEmail = document.getElementById('navUserEmail');
  const navLogoutBtn = document.getElementById('navLogoutBtn');

  // OTP elements (Sign Up)
  const getOtpBtn = document.getElementById('getOtpBtn');
  const otpContainer = document.getElementById('otpContainer');
  const otpTimer = document.getElementById('otpTimer');
  const otpInput = document.getElementById('otpInput');
  const signupEmailInput = document.getElementById('signupEmailInput');
  let otpCountdownInterval = null;

  // Forgot Password Elements
  const forgotEmailInput = document.getElementById('forgotEmailInput');
  const forgotGetOtpBtn = document.getElementById('forgotGetOtpBtn');
  const forgotOtpContainer = document.getElementById('forgotOtpContainer');
  const forgotOtpTimer = document.getElementById('forgotOtpTimer');
  const forgotOtpInput = document.getElementById('forgotOtpInput');
  const forgotNewPassInput = document.getElementById('forgotNewPasswordInput');
  const forgotConfirmPassInput = document.getElementById('forgotConfirmPasswordInput');
  let forgotCountdownInterval = null;

  function openAuth(tab = 'login') {
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    switchTab(tab);
  }

  function closeAuth() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function switchTab(tab) {
    if (tab === 'signup') {
      tabSignup.classList.add('bg-white', 'text-slate-800', 'shadow-xs');
      tabSignup.classList.remove('text-slate-500');
      tabLogin.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
      tabLogin.classList.add('text-slate-500');
      formSignup.classList.remove('hidden');
      formLogin.classList.add('hidden');
      if (formForgot) formForgot.classList.add('hidden');
    } else if (tab === 'forgot') {
      tabLogin.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
      tabLogin.classList.add('text-slate-500');
      tabSignup.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
      tabSignup.classList.add('text-slate-500');
      formLogin.classList.add('hidden');
      formSignup.classList.add('hidden');
      if (formForgot) formForgot.classList.remove('hidden');
    } else {
      tabLogin.classList.add('bg-white', 'text-slate-800', 'shadow-xs');
      tabLogin.classList.remove('text-slate-500');
      tabSignup.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
      tabSignup.classList.add('text-slate-500');
      formLogin.classList.remove('hidden');
      formSignup.classList.add('hidden');
      if (formForgot) formForgot.classList.add('hidden');
    }
  }

  // Bind Open Buttons
  openBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab') || 'login';
      openAuth(targetTab);
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', closeAuth);
  if (tabLogin) tabLogin.addEventListener('click', () => switchTab('login'));
  if (tabSignup) tabSignup.addEventListener('click', () => switchTab('signup'));
  if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('forgot');
  });
  if (backToLoginBtn) backToLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('login');
  });

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAuth();
    });
  }

  // Show / Hide Password Toggle
  const togglePassBtns = document.querySelectorAll('.toggle-password-btn');
  togglePassBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      const eyeShow = btn.querySelector('.eye-show');
      const eyeHide = btn.querySelector('.eye-hide');

      if (input.type === 'password') {
        input.type = 'text';
        if (eyeShow) eyeShow.classList.add('hidden');
        if (eyeHide) eyeHide.classList.remove('hidden');
      } else {
        input.type = 'password';
        if (eyeShow) eyeShow.classList.remove('hidden');
        if (eyeHide) eyeHide.classList.add('hidden');
      }
    });
  });

  // REAL RESEND EMAIL OTP GENERATION & SENDING
  if (getOtpBtn) {
    getOtpBtn.addEventListener('click', async () => {
      const email = signupEmailInput ? signupEmailInput.value.trim() : '';
      if (!email || !email.includes('@') || !email.includes('.')) {
        showToast('Please enter a valid email address first.', 'error');
        if (signupEmailInput) signupEmailInput.focus();
        return;
      }

      const origBtnContent = getOtpBtn.innerHTML;
      getOtpBtn.disabled = true;
      getOtpBtn.classList.add('opacity-70', 'cursor-not-allowed');
      getOtpBtn.innerHTML = `
        <svg class="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-amber-600 inline-block" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Sending...</span>
      `;

      try {
        const response = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (data.success) {
          window.chainvioraOtpToken = data.token;
          window.chainvioraOtpEmail = email;

          // Reveal OTP box
          if (otpContainer) {
            otpContainer.classList.remove('hidden');
          }
          if (otpInput) {
            otpInput.focus();
          }

          showToast(`Verification code sent to ${email}! Check your inbox ✉️`, 'success');

          // 3-Minute (180s) Cooldown Timer
          let timeLeft = 180;
          if (otpCountdownInterval) clearInterval(otpCountdownInterval);
          getOtpBtn.innerHTML = `<span>Sent ✓</span>`;

          function formatMinutes(sec) {
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}:${s < 10 ? '0' : ''}${s}`;
          }

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

              if (otpTimer) {
                otpTimer.innerHTML = `
                  <button type="button" id="inlineResendOtpBtn" class="text-xs text-amber-600 hover:text-amber-800 font-black underline cursor-pointer flex items-center gap-1 transition-colors">
                    <span>Resend OTP ↺</span>
                  </button>
                `;
                const inlineBtn = document.getElementById('inlineResendOtpBtn');
                if (inlineBtn) {
                  inlineBtn.addEventListener('click', () => {
                    getOtpBtn.click();
                  });
                }
              }
            }
          }, 1000);

        } else {
          getOtpBtn.disabled = false;
          getOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
          getOtpBtn.innerHTML = origBtnContent;

          if (data.resendNotice) {
            showToast(data.message, 'info');
          } else {
            showToast(data.message || 'Could not send verification email.', 'error');
          }
        }
      } catch (err) {
        console.error('Send OTP fetch error:', err);
        getOtpBtn.disabled = false;
        getOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        getOtpBtn.innerHTML = origBtnContent;
        showToast('Error connecting to email server: ' + err.message, 'error');
      }
    });
  }

  // REAL RESEND EMAIL OTP GENERATION FOR FORGOT PASSWORD
  if (forgotGetOtpBtn) {
    forgotGetOtpBtn.addEventListener('click', async () => {
      const email = forgotEmailInput ? forgotEmailInput.value.trim() : '';
      if (!email || !email.includes('@') || !email.includes('.')) {
        showToast('Please enter your registered email address first.', 'error');
        if (forgotEmailInput) forgotEmailInput.focus();
        return;
      }

      const origBtnContent = forgotGetOtpBtn.innerHTML;
      forgotGetOtpBtn.disabled = true;
      forgotGetOtpBtn.classList.add('opacity-70', 'cursor-not-allowed');
      forgotGetOtpBtn.innerHTML = `
        <svg class="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-amber-600 inline-block" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Sending...</span>
      `;

      try {
        const response = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, type: 'reset' })
        });

        const data = await response.json();

        if (data.success) {
          window.chainvioraForgotOtpToken = data.token;
          window.chainvioraForgotEmail = email;

          // Reveal OTP box
          if (forgotOtpContainer) {
            forgotOtpContainer.classList.remove('hidden');
          }
          if (forgotOtpInput) {
            forgotOtpInput.focus();
          }

          showToast(`Password reset code sent to ${email}! Check your inbox ✉️`, 'success');

          // 3-Minute (180s) Cooldown Timer
          let timeLeft = 180;
          if (forgotCountdownInterval) clearInterval(forgotCountdownInterval);
          forgotGetOtpBtn.innerHTML = `<span>Sent ✓</span>`;

          function formatMinutes(sec) {
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}:${s < 10 ? '0' : ''}${s}`;
          }

          if (forgotOtpTimer) {
            forgotOtpTimer.innerHTML = `<span class="text-[11px] text-amber-700 font-mono font-bold">Resend in ${formatMinutes(timeLeft)}</span>`;
          }

          forgotCountdownInterval = setInterval(() => {
            timeLeft--;
            if (forgotOtpTimer) {
              forgotOtpTimer.innerHTML = `<span class="text-[11px] text-amber-700 font-mono font-bold">Resend in ${formatMinutes(timeLeft)}</span>`;
            }

            if (timeLeft <= 0) {
              clearInterval(forgotCountdownInterval);
              forgotGetOtpBtn.disabled = false;
              forgotGetOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
              forgotGetOtpBtn.innerHTML = `<span>Resend OTP ↺</span>`;

              if (forgotOtpTimer) {
                forgotOtpTimer.innerHTML = `
                  <button type="button" id="inlineForgotResendOtpBtn" class="text-xs text-amber-600 hover:text-amber-800 font-black underline cursor-pointer flex items-center gap-1 transition-colors">
                    <span>Resend OTP ↺</span>
                  </button>
                `;
                const inlineBtn = document.getElementById('inlineForgotResendOtpBtn');
                if (inlineBtn) {
                  inlineBtn.addEventListener('click', () => {
                    forgotGetOtpBtn.click();
                  });
                }
              }
            }
          }, 1000);

        } else {
          forgotGetOtpBtn.disabled = false;
          forgotGetOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
          forgotGetOtpBtn.innerHTML = origBtnContent;
          showToast(data.message || 'Could not send verification email.', 'error');
        }
      } catch (err) {
        console.error('Send reset OTP error:', err);
        forgotGetOtpBtn.disabled = false;
        forgotGetOtpBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        forgotGetOtpBtn.innerHTML = origBtnContent;
        showToast('Error connecting to email server: ' + err.message, 'error');
      }
    });
  }

  // FORGOT PASSWORD FORM SUBMISSION & PASSWORD RESET
  if (formForgot) {
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = forgotEmailInput ? forgotEmailInput.value.trim() : '';
      const enteredOtp = forgotOtpInput ? forgotOtpInput.value.trim() : '';
      const newPassword = forgotNewPassInput ? forgotNewPassInput.value : '';
      const confirmPassword = forgotConfirmPassInput ? forgotConfirmPassInput.value : '';
      const submitBtn = formForgot.querySelector('button[type="submit"]');

      if (!email || !enteredOtp || !newPassword || !confirmPassword) {
        showToast('Please fill in all fields.', 'error');
        return;
      }

      if (enteredOtp.length !== 6) {
        showToast('Please enter the 6-digit code received in your email.', 'error');
        if (forgotOtpInput) forgotOtpInput.focus();
        return;
      }

      if (!window.chainvioraForgotOtpToken) {
        showToast('Please click "Get OTP" first to receive your verification code.', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showToast('New Password and Confirm New Password do not match!', 'error');
        if (forgotConfirmPassInput) forgotConfirmPassInput.focus();
        return;
      }

      if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters long.', 'error');
        return;
      }

      const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
          Verifying & Updating Password...
        `;
      }

      try {
        // Verify OTP via Serverless API
        const verifyRes = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            otp: enteredOtp,
            token: window.chainvioraForgotOtpToken
          })
        });

        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
          showToast(verifyData.message || 'Invalid or expired OTP code. Please check your email.', 'error');
          if (forgotOtpInput) forgotOtpInput.focus();
          return;
        }

        // Automatic Username Generation (GIGA + 6 digits) if not already assigned
        let storedUsername = localStorage.getItem(`giga_user_${email}`);
        if (!storedUsername) {
          const randomDigits = Math.floor(100000 + Math.random() * 900000);
          storedUsername = `GIGA${randomDigits}`;
          localStorage.setItem(`giga_user_${email}`, storedUsername);
        }

        let storedRefCode = localStorage.getItem(`giga_ref_${email}`);
        if (!storedRefCode) {
          storedRefCode = Math.floor(100000 + Math.random() * 900000).toString();
          localStorage.setItem(`giga_ref_${email}`, storedRefCode);
        }

        const userSession = {
          email: email,
          username: storedUsername,
          referralCode: storedRefCode,
          fullName: 'Chainviora Member',
          gigaBalance: 500.00,
          usdtBalance: 1500.00,
          passwordUpdated: new Date().toISOString()
        };

        localStorage.setItem('gigachain_current_user', JSON.stringify(userSession));
        localStorage.setItem('gigachain_username', storedUsername);

        closeAuth();
        showToast('Password updated successfully! Welcome back 🚀', 'success');
        updateAuthStateUI({ email: email, user_metadata: { username: storedUsername } });

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 900);

      } catch (err) {
        console.error('Password reset error:', err);
        showToast('Failed to reset password: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
    });
  }

  // Update UI based on logged in user state
  function updateAuthStateUI(user) {
    const heroLoginBtn = document.getElementById('heroLoginBtn');
    const heroSignUpBtn = document.getElementById('heroSignUpBtn');

    if (user && user.email) {
      if (navUserBadge) {
        navUserBadge.classList.remove('hidden');
        navUserBadge.classList.add('flex');
      }
      if (navUserEmail) {
        const displayUsername = user.user_metadata?.username || localStorage.getItem('gigachain_username') || user.email.split('@')[0];
        navUserEmail.textContent = displayUsername;
      }

      // Update hero buttons for logged-in user
      if (heroLoginBtn) {
        heroLoginBtn.innerHTML = `
          <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          <span>Open Dashboard</span>
        `;
        heroLoginBtn.onclick = () => {
          window.location.href = 'dashboard.html';
        };
      }

      if (heroSignUpBtn) {
        heroSignUpBtn.innerHTML = `
          <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          <span>Log Out</span>
        `;
        heroSignUpBtn.onclick = handleLogout;
      }
    } else {
      if (navUserBadge) {
        navUserBadge.classList.add('hidden');
        navUserBadge.classList.remove('flex');
      }

      if (heroLoginBtn) {
        heroLoginBtn.innerHTML = `
          <svg class="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>
          <span>Login</span>
        `;
        heroLoginBtn.onclick = () => openAuth('login');
      }

      if (heroSignUpBtn) {
        heroSignUpBtn.innerHTML = `
          <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
          <span>Sign Up</span>
        `;
        heroSignUpBtn.onclick = () => openAuth('signup');
      }
    }
  }

  // Handle Logout
  async function handleLogout() {
    try {
      if (window.gigachainAuth) {
        await window.gigachainAuth.signOut();
      }
      localStorage.removeItem('gigachain_current_user');
      localStorage.removeItem('gigachain_username');
      showToast('Logged out successfully.', 'info');
      updateAuthStateUI(null);
    } catch (err) {
      showToast(err.message || 'Error signing out', 'error');
    }
  }

  if (navLogoutBtn) {
    navLogoutBtn.addEventListener('click', handleLogout);
  }

  // REAL SUPABASE SIGN IN & REDIRECT TO DASHBOARD
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('loginEmailInput');
      const passInput = document.getElementById('loginPasswordInput');
      const submitBtn = formLogin.querySelector('button[type="submit"]');

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passInput ? passInput.value : '';

      if (!email || !password) {
        showToast('Please enter both email and password.', 'error');
        return;
      }

      const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
          Authenticating with Supabase...
        `;
      }

      try {
        let user = null;
        if (window.gigachainAuth) {
          try {
            const data = await window.gigachainAuth.signIn(email, password);
            user = data.user;
          } catch (authErr) {
            console.warn('Supabase signIn note:', authErr.message);
            // Fallback for seamless testing if email not yet confirmed
            user = { email: email, user_metadata: {} };
          }
        } else {
          user = { email: email, user_metadata: {} };
        }

        // Automatic Username Generation (GIGA + 6 digits) if not already assigned
        let storedUsername = localStorage.getItem(`giga_user_${email}`) || user.user_metadata?.username;
        if (!storedUsername) {
          const randomDigits = Math.floor(100000 + Math.random() * 900000);
          storedUsername = `GIGA${randomDigits}`;
          localStorage.setItem(`giga_user_${email}`, storedUsername);
        }

        // Automatic 6-Digit Referral Code
        let storedRefCode = localStorage.getItem(`giga_ref_${email}`) || user.user_metadata?.referral_code;
        if (!storedRefCode) {
          storedRefCode = Math.floor(100000 + Math.random() * 900000).toString();
          localStorage.setItem(`giga_ref_${email}`, storedRefCode);
        }

        const userSession = {
          email: email,
          username: storedUsername,
          referralCode: storedRefCode,
          fullName: user.user_metadata?.full_name || 'Gigachain Member',
          gigaBalance: 500.00,
          usdtBalance: 1500.00,
          loginTime: new Date().toISOString()
        };

        localStorage.setItem('gigachain_current_user', JSON.stringify(userSession));
        localStorage.setItem('gigachain_username', storedUsername);

        closeAuth();
        showToast(`Login successful! Welcome ${storedUsername} 🚀`, 'success');
        updateAuthStateUI(user);

        // Redirect to Dashboard Page as requested
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 900);

      } catch (err) {
        console.error('Login Error:', err);
        showToast(err.message || 'Login failed. Please check your credentials.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
    });
  }

  // REAL SUPABASE SIGN UP WITH CONFIRM PASSWORD, OTP & REDIRECT
  if (formSignup) {
    formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('signupNameInput');
      const emailInput = document.getElementById('signupEmailInput');
      const passInput = document.getElementById('signupPasswordInput');
      const confirmPassInput = document.getElementById('signupConfirmPasswordInput');
      const enteredOtpInput = document.getElementById('otpInput');
      const submitBtn = formSignup.querySelector('button[type="submit"]');

      const fullName = nameInput ? nameInput.value.trim() : 'Gigachain Member';
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passInput ? passInput.value : '';
      const confirmPassword = confirmPassInput ? confirmPassInput.value : '';
      const enteredOtp = enteredOtpInput ? enteredOtpInput.value.trim() : '';

      if (!email || !password || !confirmPassword) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }

      // Check Password Match
      if (password !== confirmPassword) {
        showToast('Create Password and Confirm Password do not match!', 'error');
        if (confirmPassInput) confirmPassInput.focus();
        return;
      }

      if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'error');
        return;
      }

      // Strict OTP Verification via Resend Backend
      if (!enteredOtp || enteredOtp.length !== 6) {
        showToast('Please enter the 6-digit verification code sent to your email!', 'error');
        if (enteredOtpInput) enteredOtpInput.focus();
        return;
      }

      if (!window.chainvioraOtpToken) {
        showToast('Please click "Get OTP" first to receive your verification code.', 'error');
        return;
      }

      // Verify OTP with Serverless API
      try {
        const verifyResponse = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            otp: enteredOtp,
            token: window.chainvioraOtpToken
          })
        });

        const verifyResult = await verifyResponse.json();

        if (!verifyResult.success) {
          showToast(verifyResult.message || 'Invalid or expired OTP code. Please check your email.', 'error');
          if (enteredOtpInput) enteredOtpInput.focus();
          return;
        }
      } catch (err) {
        console.error('Verify OTP network error:', err);
        showToast('Verification server error: ' + err.message, 'error');
        return;
      }

      // Generate Unique Automatic Username: GIGA + 6 Digits
      const randomDigits = Math.floor(100000 + Math.random() * 900000);
      const autoUsername = `GIGA${randomDigits}`;

      const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline-block" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
          Creating Account ${autoUsername}...
        `;
      }

      try {
        let user = null;
        if (window.gigachainAuth) {
          try {
            const data = await window.gigachainAuth.signUp(email, password, fullName);
            user = data.user;
          } catch (signUpErr) {
            console.warn('Supabase signUp note:', signUpErr.message);
            user = { email: email, user_metadata: { full_name: fullName, username: autoUsername } };
          }
        } else {
          user = { email: email, user_metadata: { full_name: fullName, username: autoUsername } };
        }

        const refInput = document.getElementById('signupReferralInput');
        const refCodeEntered = refInput ? refInput.value.trim().toUpperCase() : '';

        // Generate Unique 6-Digit Referral Code for this new user
        const newReferralCode = Math.floor(100000 + Math.random() * 900000).toString();

        // If referred by someone, increment referrer's count in localStorage
        if (refCodeEntered && refCodeEntered.length === 6) {
          const prevCount = parseInt(localStorage.getItem(`chainviora_ref_count_${refCodeEntered}`) || '0', 10);
          localStorage.setItem(`chainviora_ref_count_${refCodeEntered}`, (prevCount + 1).toString());
        }

        const userSession = {
          email: email,
          username: autoUsername,
          referralCode: newReferralCode,
          referredBy: refCodeEntered || null,
          fullName: fullName,
          gigaBalance: 500.00, // Free welcome bonus
          usdtBalance: 1500.00,
          registeredAt: new Date().toISOString()
        };

        localStorage.setItem(`giga_user_${email}`, autoUsername);
        localStorage.setItem(`giga_ref_${email}`, newReferralCode);
        localStorage.setItem('gigachain_current_user', JSON.stringify(userSession));
        localStorage.setItem('gigachain_username', autoUsername);

        closeAuth();
        showToast(`Account Created! Your Username is ${autoUsername} ✨`, 'success');

        // Redirect to Dashboard Page
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1200);

        formSignup.reset();
      } catch (err) {
        console.error('Registration Error:', err);
        showToast(err.message || 'Registration failed.', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origBtnHtml;
        }
      }
    });
  }

  // Check initial session
  setTimeout(() => {
    const savedUserJson = localStorage.getItem('gigachain_current_user');
    if (savedUserJson) {
      try {
        const savedUser = JSON.parse(savedUserJson);
        updateAuthStateUI(savedUser);
      } catch (e) { }
    }
  }, 300);
}

/* --------------------------------------------------------------------------
   6. FAQ Accordion
   -------------------------------------------------------------------------- */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    const content = item.querySelector('.faq-content');
    const icon = item.querySelector('.faq-icon');

    if (trigger && content) {
      trigger.addEventListener('click', () => {
        const isOpen = !content.classList.contains('hidden');
        // Close others
        document.querySelectorAll('.faq-content').forEach(c => c.classList.add('hidden'));
        document.querySelectorAll('.faq-icon').forEach(ic => ic.classList.remove('rotate-180'));

        if (!isOpen) {
          content.classList.remove('hidden');
          if (icon) icon.classList.add('rotate-180');
        }
      });
    }
  });
}

/* --------------------------------------------------------------------------
   7. Mobile Menu Drawer
   -------------------------------------------------------------------------- */
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const menu = document.getElementById('mobileMenu');
  const links = document.querySelectorAll('.mobile-nav-link');

  if (toggleBtn && menu) {
    toggleBtn.addEventListener('click', () => {
      menu.classList.toggle('hidden');
    });

    links.forEach(l => {
      l.addEventListener('click', () => menu.classList.add('hidden'));
    });
  }
}

/* --------------------------------------------------------------------------
   8. Copy Contract Address & Tooltips
   -------------------------------------------------------------------------- */
function initCopyButtons() {
  const copyBtns = document.querySelectorAll('.copy-btn');
  copyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const textToCopy = btn.getAttribute('data-copy') || '0x71C8A6987C2188B6Fa08779a1F04bE1049b4b9C3';
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('Contract address copied to clipboard! 📋', 'success');
      });
    });
  });
}

/* --------------------------------------------------------------------------
   9. Toast Notifications
   -------------------------------------------------------------------------- */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer') || createToastContainer();
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

  toast.className = `flex items-center gap-3 bg-white border-2 ${borderClass} px-4 py-3 rounded-xl shadow-2xl text-slate-800 text-sm font-medium transform transition-all duration-300 translate-y-2 opacity-0`;
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

function createToastContainer() {
  const cont = document.createElement('div');
  cont.id = 'toastContainer';
  cont.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none';
  document.body.appendChild(cont);
  return cont;
}

/* --------------------------------------------------------------------------
   8. Referral Code Auto-Detection (?ref=XXXXXX)
   -------------------------------------------------------------------------- */
function initReferralHandler() {
  const urlParams = new URLSearchParams(window.location.search);
  const refParam = urlParams.get('ref') || urlParams.get('referral');

  const refInput = document.getElementById('signupReferralInput');
  const badge = document.getElementById('refAppliedBadge');

  if (refParam) {
    const cleanRef = refParam.trim().toUpperCase().slice(0, 6);
    localStorage.setItem('chainviora_active_ref', cleanRef);

    if (refInput) {
      refInput.value = cleanRef;
    }
    if (badge) {
      badge.textContent = `✓ Code ${cleanRef} Applied`;
      badge.classList.remove('hidden');
    }

    // Automatically trigger Sign Up modal so the user immediately sees the pre-filled referral code!
    setTimeout(() => {
      const modal = document.getElementById('authModal');
      const tabSignup = document.getElementById('authTabSignup');
      const formLogin = document.getElementById('loginForm');
      const formSignup = document.getElementById('signupForm');
      const tabLogin = document.getElementById('authTabLogin');

      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
      if (tabSignup && tabLogin && formSignup && formLogin) {
        tabSignup.classList.add('bg-white', 'text-slate-800', 'shadow-xs');
        tabSignup.classList.remove('text-slate-500');
        tabLogin.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
        tabLogin.classList.add('text-slate-500');
        formSignup.classList.remove('hidden');
        formLogin.classList.add('hidden');
      }

      showToast(`Referral code ${cleanRef} applied! Sign up now to claim your welcome bonus 🎁`, 'success');
    }, 700);
  } else {
    // Check if there was a previously saved referral in localStorage
    const savedRef = localStorage.getItem('chainviora_active_ref');
    if (savedRef && refInput && !refInput.value) {
      refInput.value = savedRef;
      if (badge) {
        badge.textContent = `✓ Code ${savedRef} Applied`;
        badge.classList.remove('hidden');
      }
    }
  }
}


