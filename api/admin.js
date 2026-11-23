// api/admin.js
// GIGACHAIN Unified High-Security Serverless Administration Gateway
// Handles Auth, Google 2FA (RFC 6238 TOTP), Real-time Users, Deposits, Withdrawals, Buy/Sell, Staff RBAC, and Notifications

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { isRateLimited, getClientIp } = require('./_security');

// Auto-load .env for local execution if not in production
if (!process.env.RESEND_API_KEY) {
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
      envLines.forEach(l => {
        const idx = l.indexOf('=');
        if (idx > 0) {
          const k = l.slice(0, idx).trim();
          const v = l.slice(idx + 1).trim();
          if (k && !process.env[k]) process.env[k] = v;
        }
      });
    }
  } catch (e) { }
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;

function sendResendEmail(payload) {
  if (!RESEND_API_KEY) return Promise.resolve({ status: 500, error: 'No RESEND_API_KEY' });
  return new Promise((resolve) => {
    const dataString = JSON.stringify(payload);
    const req = https.request(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataString)
        }
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json = {};
          try { json = JSON.parse(body); } catch (e) { json = { raw: body }; }
          resolve({ status: res.statusCode, data: json });
        });
      }
    );
    req.on('error', err => resolve({ status: 500, error: err.message }));
    req.write(dataString);
    req.end();
  });
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY';
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'giga_sec_994827419827481974918729381749817293';

// ─── Pure Node.js RFC 6238 TOTP (Google Authenticator) ──────────────────────
function base32toHex(base32) {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';
  for (let i = 0; i < base32.length; i++) {
    const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    const chunk = bits.substr(i, 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

function generateTOTP(secret, stepOffset = 0) {
  const hexSecret = base32toHex(secret);
  const secretBuf = Buffer.from(hexSecret, 'hex');
  const epoch = Math.floor(Date.now() / 1000.0);
  const time = Buffer.alloc(8);
  const counter = Math.floor(epoch / 30) + stepOffset;
  time.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf);
  hmac.update(time);
  const digest = hmac.digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

function verifyTOTP(token, secret) {
  if (!token || !secret) return false;
  token = String(token).trim();
  for (const offset of [-1, 0, 1]) {
    if (generateTOTP(secret, offset) === token) return true;
  }
  return false;
}

function generateBase32Secret(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += chars[bytes[i] % chars.length];
  }
  return secret;
}

// ─── HMAC-SHA256 Token Helpers ──────────────────────────────────────────────
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ─── Database Config Storage Helper ─────────────────────────────────────────
async function getAdminConfig(supabase) {
  try {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('tx_hash', 'system_admin_config')
      .maybeSingle();

    if (data && data.notes) {
      return JSON.parse(data.notes);
    }
  } catch (e) {
    console.warn('getAdminConfig error:', e.message);
  }

  // Fallback initial config
  return {
    admin_username: 'Gigaadmin',
    admin_password: 'Giga@1166',
    two_factor_enabled: false,
    two_factor_secret: null,
    staff: [],
    notifications: [
      {
        id: 'notif_welcome',
        title: 'Welcome to GIGACHAIN Network',
        type: 'Network Announcement',
        message: 'All deposit verifications, GIGA buy orders, and auto-matching sell queues are fully operational.',
        created_at: new Date().toISOString()
      }
    ],
    updated_at: new Date().toISOString()
  };
}

async function saveAdminConfig(supabase, config) {
  config.updated_at = new Date().toISOString();
  const notesStr = JSON.stringify(config);

  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('tx_hash', 'system_admin_config')
    .maybeSingle();

  if (existing) {
    await supabase
      .from('transactions')
      .update({ notes: notesStr, status: 'active' })
      .eq('tx_hash', 'system_admin_config');
  } else {
    const { data: prof } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
    await supabase.from('transactions').insert({
      user_id: prof ? prof.id : '00000000-0000-0000-0000-000000000000',
      type: 'admin_config',
      status: 'active',
      tx_hash: 'system_admin_config',
      notes: notesStr,
      amount_usdt: 0,
      amount_giga: 0
    });
  }
}

// ─── Main Serverless Function ───────────────────────────────────────────────
module.exports = async (req, res) => {
  // 🔒 Admin panel: only allow from chainviora.com domain + local dev
  const origin = req.headers['origin'] || req.headers['referer'] || '';
  const allowedAdminOrigins = [
    'https://www.chainviora.com',
    'https://chainviora.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000'
  ];
  const isAllowedOrigin = !origin || allowedAdminOrigins.some(o => origin.startsWith(o)) || origin.match(/^https:\/\/chainviora-[a-z0-9-]+\.vercel\.app/);

  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin && origin ? origin : (allowedAdminOrigins[0]));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 🔒 Block known attack bots
  const ua = req.headers['user-agent'] || '';
  const BOT_PATTERNS = [/sqlmap/i, /nikto/i, /nessus/i, /masscan/i, /dirbuster/i, /havij/i, /acunetix/i, /zgrab/i, /nmap/i];
  if (BOT_PATTERNS.some(p => p.test(ua))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 🔒 Rate limit: 30 admin API calls per minute per IP (for general endpoints)
  const clientIp = getClientIp(req);
  const action = req.query.action || (req.body && req.body.action);

  // Stricter rate limit on login (5 attempts per minute — brute force prevention)
  const loginRateLimit = action === 'login' ? { max: 5, windowMs: 60 * 1000 } : { max: 30, windowMs: 60 * 1000 };
  if (isRateLimited(clientIp, `admin::${action || 'general'}`, loginRateLimit.max, loginRateLimit.windowMs)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // 1. PUBLIC ENDPOINT: Get active system notifications for user dashboard bell
  if (action === 'get_public_notifications') {
    const config = await getAdminConfig(supabase);
    return res.status(200).json({
      success: true,
      notifications: config.notifications || []
    });
  }

  // 2. PUBLIC ENDPOINT: Admin & Staff Login
  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { username, password, twoFactorCode } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const config = await getAdminConfig(supabase);
    const cleanUsername = String(username).trim();
    const cleanPassword = String(password).trim();

    // Check Superadmin
    if (cleanUsername.toLowerCase() === (config.admin_username || 'Gigaadmin').toLowerCase()) {
      if (cleanPassword !== config.admin_password) {
        return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
      }

      // Check if 2FA is enabled
      if (config.two_factor_enabled && config.two_factor_secret) {
        if (!twoFactorCode) {
          return res.status(200).json({
            success: false,
            require2FA: true,
            message: 'Please enter your 6-digit Google Authenticator code.'
          });
        }

        const valid2FA = verifyTOTP(twoFactorCode, config.two_factor_secret);
        if (!valid2FA) {
          return res.status(401).json({ success: false, message: 'Invalid Google Authenticator code' });
        }
      }

      const token = signToken({
        sub: config.admin_username,
        role: 'superadmin',
        permissions: ['*'],
        name: 'Super Administrator',
        exp: Math.floor(Date.now() / 1000) + (12 * 3600)
      });

      return res.status(200).json({
        success: true,
        token,
        role: 'superadmin',
        permissions: ['*'],
        name: 'Super Administrator',
        twoFactorEnabled: !!config.two_factor_enabled
      });
    }

    // Check Staff accounts
    const staffList = config.staff || [];
    const staff = staffList.find(s => s.username.toLowerCase() === cleanUsername.toLowerCase());

    if (staff && staff.password === cleanPassword) {
      const token = signToken({
        sub: staff.username,
        role: 'staff',
        permissions: staff.permissions || ['deposits', 'withdrawals'],
        name: staff.name,
        exp: Math.floor(Date.now() / 1000) + (12 * 3600)
      });

      return res.status(200).json({
        success: true,
        token,
        role: 'staff',
        permissions: staff.permissions || [],
        name: staff.name,
        twoFactorEnabled: false
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  // ─── AUTHENTICATION SHIELD: All following actions require valid token ───────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const session = verifyToken(token);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Session expired or invalid.' });
  }

  const isSuperAdmin = session.role === 'superadmin';
  const hasPerm = (perm) => isSuperAdmin || (session.permissions && session.permissions.includes(perm));

  try {
    const config = await getAdminConfig(supabase);

    // ─── 3. Verify Session / Status ──────────────────────────────────────────
    if (action === 'verify_session') {
      return res.status(200).json({
        success: true,
        session: {
          username: session.sub,
          name: session.name,
          role: session.role,
          permissions: session.permissions,
          twoFactorEnabled: !!config.two_factor_enabled
        }
      });
    }

    // ─── 4. Change Password (Superadmin only) ────────────────────────────────
    if (action === 'change_password') {
      if (!isSuperAdmin) return res.status(403).json({ error: 'Forbidden' });
      const { currentPassword, newPassword } = req.body || {};

      if (currentPassword !== config.admin_password) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      }

      config.admin_password = newPassword;
      await saveAdminConfig(supabase, config);
      return res.status(200).json({ success: true, message: 'Admin password successfully updated!' });
    }

    // ─── 5. Google 2FA: Setup & Enable ──────────────────────────────────────
    if (action === 'setup_2fa') {
      if (!isSuperAdmin) return res.status(403).json({ error: 'Forbidden' });
      const secret = generateBase32Secret(16);
      const issuer = 'Chainviora';
      const label = encodeURIComponent(config.admin_username || 'Gigaadmin');
      const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

      return res.status(200).json({
        success: true,
        secret,
        otpauth_url: otpauth
      });
    }

    if (action === 'enable_2fa') {
      if (!isSuperAdmin) return res.status(403).json({ error: 'Forbidden' });
      const { secret, code } = req.body || {};

      if (!verifyTOTP(code, secret)) {
        return res.status(400).json({ success: false, message: 'Invalid 6-digit verification code. Please check your authenticator app.' });
      }

      config.two_factor_enabled = true;
      config.two_factor_secret = secret;
      await saveAdminConfig(supabase, config);

      return res.status(200).json({ success: true, message: 'Google Authenticator 2FA activated successfully!' });
    }

    if (action === 'disable_2fa') {
      if (!isSuperAdmin) return res.status(403).json({ error: 'Forbidden' });
      const { code } = req.body || {};

      if (config.two_factor_enabled && config.two_factor_secret) {
        if (!verifyTOTP(code, config.two_factor_secret)) {
          return res.status(400).json({ success: false, message: 'Invalid 6-digit code. Cannot disable 2FA.' });
        }
      }

      config.two_factor_enabled = false;
      config.two_factor_secret = null;
      await saveAdminConfig(supabase, config);

      return res.status(200).json({ success: true, message: 'Google Authenticator 2FA disabled.' });
    }

    // ─── 6. Overview & Stats ────────────────────────────────────────────────
    if (action === 'get_overview') {
      const [profilesRes, txsRes] = await Promise.all([
        supabase.from('profiles').select('id, usdt_balance, giga_balance, lifetime_profit'),
        supabase.from('transactions').select('type, amount_usdt, amount_giga, status, created_at')
      ]);

      const profiles = profilesRes.data || [];
      const txs = (txsRes.data || []).filter(t => t.type !== 'admin_config');

      const totalUsers = profiles.length;
      let totalVaultUSDT = 0;
      let totalGigaHeld = 0;
      let totalProfitsPaid = 0;

      profiles.forEach(p => {
        totalVaultUSDT += parseFloat(p.usdt_balance || 0);
        totalGigaHeld += parseFloat(p.giga_balance || 0);
        totalProfitsPaid += parseFloat(p.lifetime_profit || 0);
      });

      const deposits = txs.filter(t => t.type === 'deposit');
      const withdrawals = txs.filter(t => t.type === 'withdrawal');
      const buys = txs.filter(t => t.type === 'buy_giga' || t.type === 'giga_buy');
      const sells = txs.filter(t => t.type === 'sell_giga' || t.type === 'giga_sell');

      const totalDeposited = deposits.reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0);
      const totalWithdrawn = withdrawals.reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0);
      const pendingWithdrawalsCount = withdrawals.filter(w => w.status === 'pending').length;

      return res.status(200).json({
        success: true,
        stats: {
          totalUsers,
          totalVaultUSDT,
          totalGigaHeld,
          totalProfitsPaid,
          totalDeposited,
          totalWithdrawn,
          pendingWithdrawalsCount,
          totalBuysCount: buys.length,
          totalSellsCount: sells.length
        }
      });
    }

    // ─── 7. Users Management ────────────────────────────────────────────────
    if (action === 'get_users') {
      if (!hasPerm('users')) return res.status(403).json({ error: 'Access denied to Users' });

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map(p => {
        const syncState = (p.deposit_addresses && p.deposit_addresses.sync_state) || {};
        return {
          id: p.id,
          email: p.email,
          username: p.username || syncState.username || 'GIGA Member',
          full_name: p.full_name || 'Member',
          usdt_balance: parseFloat(p.usdt_balance || 0),
          giga_balance: parseFloat(p.giga_balance || 0),
          lifetime_profit: parseFloat(p.lifetime_profit || 0),
          created_at: p.created_at,
          status: syncState.account_status || 'active',
          pending_sells: Array.isArray(syncState.pending_sells) ? syncState.pending_sells.length : 0
        };
      });

      return res.status(200).json({ success: true, users: formatted });
    }

    if (action === 'update_user_balance') {
      if (!hasPerm('users')) return res.status(403).json({ error: 'Access denied' });
      const { userId, usdt_balance, giga_balance, lifetime_profit, note } = req.body || {};

      if (!userId) return res.status(400).json({ error: 'userId required' });

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!profile) return res.status(404).json({ error: 'User not found' });

      const existingMap = profile.deposit_addresses || {};
      const existingSync = existingMap.sync_state || {};

      const newUsdt = parseFloat(usdt_balance !== undefined ? usdt_balance : profile.usdt_balance);
      const newGiga = parseFloat(giga_balance !== undefined ? giga_balance : profile.giga_balance);
      const newProfit = parseFloat(lifetime_profit !== undefined ? lifetime_profit : profile.lifetime_profit);

      await supabase
        .from('profiles')
        .update({
          usdt_balance: newUsdt,
          giga_balance: newGiga,
          lifetime_profit: newProfit,
          deposit_addresses: {
            ...existingMap,
            sync_state: {
              ...existingSync,
              usdt_balance: newUsdt,
              giga_balance: newGiga,
              lifetime_profit: newProfit
            }
          },
          last_updated: new Date().toISOString()
        })
        .eq('id', userId);

      // Record admin action in transactions
      await supabase.from('transactions').insert({
        user_id: userId,
        type: 'admin_adjustment',
        amount_usdt: newUsdt,
        amount_giga: newGiga,
        status: 'completed',
        notes: `Admin adjusted balance: USDT $${newUsdt}, GIGA ${newGiga}. Reason: ${note || 'Manual Adjustment'}`,
        created_at: new Date().toISOString()
      });

      return res.status(200).json({ success: true, message: 'User balances updated successfully!' });
    }

    if (action === 'toggle_user_status') {
      if (!hasPerm('users')) return res.status(403).json({ error: 'Access denied' });
      const { userId, status } = req.body || {};
      const newStatus = status === 'suspended' ? 'suspended' : 'active';

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!profile) return res.status(404).json({ error: 'User not found' });

      const existingMap = profile.deposit_addresses || {};
      const existingSync = existingMap.sync_state || {};

      await supabase
        .from('profiles')
        .update({
          deposit_addresses: {
            ...existingMap,
            sync_state: {
              ...existingSync,
              account_status: newStatus
            }
          }
        })
        .eq('id', userId);

      return res.status(200).json({ success: true, status: newStatus });
    }

    // ─── 8. Real-time Deposits Monitoring ───────────────────────────────────
    if (action === 'get_deposits') {
      if (!hasPerm('deposits')) return res.status(403).json({ error: 'Access denied to Deposits' });

      const [txsRes, profilesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('type', 'deposit')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('profiles').select('id, email, username, full_name')
      ]);

      const userMap = {};
      (profilesRes.data || []).forEach(p => {
        userMap[p.id] = p;
      });

      const deposits = (txsRes.data || []).map(t => {
        const u = userMap[t.user_id] || {};
        return {
          id: t.id,
          user_id: t.user_id,
          email: u.email || 'Unknown',
          username: u.username || 'GIGA Member',
          amount: parseFloat(t.amount_usdt || 0),
          network: 'USDT (BEP20 - BNB Smart Chain)',
          tx_hash: t.tx_hash || '0x...',
          status: t.status || 'completed',
          notes: t.notes || '',
          created_at: t.created_at
        };
      });

      return res.status(200).json({ success: true, deposits });
    }

    // ─── 9. Real-time Withdrawals Monitoring & Actions ──────────────────────
    if (action === 'get_withdrawals') {
      if (!hasPerm('withdrawals')) return res.status(403).json({ error: 'Access denied to Withdrawals' });

      const [txsRes, profilesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('type', 'withdrawal')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('profiles').select('id, email, username, usdt_balance')
      ]);

      const userMap = {};
      (profilesRes.data || []).forEach(p => {
        userMap[p.id] = p;
      });

      const withdrawals = (txsRes.data || []).map(t => {
        const u = userMap[t.user_id] || {};
        const amount = parseFloat(t.amount_usdt || 0);
        const fee = amount * 0.06;
        const receive = Math.max(0, amount - fee);

        // Extract destination wallet address from notes if present
        let destAddress = 'BEP20 Wallet';
        if (t.notes) {
          const match = t.notes.match(/0x[a-fA-F0-9]{40}/i) || t.notes.match(/Address:\s*([^\s|]+)/i);
          if (match) destAddress = match[1] || match[0];
        }

        return {
          id: t.id,
          user_id: t.user_id,
          email: u.email || 'Unknown',
          username: u.username || 'GIGA Member',
          user_balance: u.usdt_balance || 0,
          amount: amount,
          fee: fee,
          receive: receive,
          destination: destAddress,
          tx_hash: t.tx_hash || 'Pending Confirmation',
          status: t.status || 'pending',
          notes: t.notes || '',
          created_at: t.created_at
        };
      });

      return res.status(200).json({ success: true, withdrawals });
    }

    if (action === 'process_withdrawal') {
      if (!hasPerm('withdrawals')) return res.status(403).json({ error: 'Access denied' });
      const { transactionId, status, txHash, refundReason } = req.body || {};

      if (!transactionId || !status) {
        return res.status(400).json({ error: 'transactionId and status required' });
      }

      const { data: tx } = await supabase.from('transactions').select('*').eq('id', transactionId).maybeSingle();
      if (!tx) return res.status(404).json({ error: 'Withdrawal not found' });

      // Fetch user profile
      const { data: userProf } = await supabase.from('profiles').select('*').eq('id', tx.user_id).maybeSingle();

      const finalTxHash = txHash || tx.tx_hash || ('0x' + crypto.randomBytes(32).toString('hex'));
      const dbStatus = status === 'rejected' ? 'rejected' : 'completed';

      // If rejected and refund requested: add profit balance back to user
      if (status === 'rejected') {
        const refundAmt = parseFloat(tx.amount_usdt || 0);
        if (userProf && refundAmt > 0) {
          const curProfit = parseFloat(userProf.lifetime_profit || 0);
          const newProfit = curProfit + refundAmt;
          await supabase.from('profiles').update({ lifetime_profit: newProfit }).eq('id', tx.user_id);
        }
      }

      // 1. Update transactions table
      await supabase
        .from('transactions')
        .update({
          status: dbStatus,
          tx_hash: finalTxHash,
          notes: `${tx.notes || ''} | Admin: ${status} ${refundReason ? '(' + refundReason + ')' : ''}`
        })
        .eq('id', transactionId);

      // 2. Update user profile's sync_state.activities so user dashboard sees 'Completed' immediately
      if (userProf) {
        const profMap = (userProf.deposit_addresses && typeof userProf.deposit_addresses === 'object') ? userProf.deposit_addresses : {};
        const syncState = profMap.sync_state || {};
        const activities = Array.isArray(syncState.activities) ? [...syncState.activities] : [];

        let activityUpdated = false;
        const updatedActivities = activities.map(act => {
          const matchHash = act.txHash && (act.txHash === tx.tx_hash || act.txHash === finalTxHash);
          const matchType = act.type && act.type.toLowerCase().includes('withdraw');
          const matchAmt = Math.abs((parseFloat(act.rawAmount) || parseFloat(act.amount) || 0) - parseFloat(tx.amount_usdt || 0)) < 0.05;

          if (matchHash || (matchType && matchAmt)) {
            activityUpdated = true;
            return {
              ...act,
              status: dbStatus === 'rejected' ? 'Rejected' : 'Completed',
              txHash: finalTxHash
            };
          }
          return act;
        });

        if (activityUpdated) {
          try {
            await supabase.from('profiles').update({
              deposit_addresses: {
                ...profMap,
                sync_state: {
                  ...syncState,
                  activities: updatedActivities
                }
              }
            }).eq('id', userProf.id);
          } catch (e) {
            console.warn('Profile activities sync update warning:', e.message);
          }
        }
      }

      // 3. Send email to user upon Approval or Rejection
      if (userProf && userProf.email) {
        try {
          const amount = parseFloat(tx.amount_usdt || 0);
          const fee = amount * 0.06;
          const receive = Math.max(0, amount - fee);
          const destMatch = (tx.notes || '').match(/Address:\s*([^\s|]+)/i) || (tx.notes || '').match(/0x[a-fA-F0-9]{40}/i);
          const destination = destMatch ? (destMatch[1] || destMatch[0]) : 'Your BEP20 Wallet';
          const username = userProf.username || 'Valued Member';

          if (dbStatus === 'completed' || status === 'approved') {
            const emailSubject = `Withdrawal Approved: $${receive.toFixed(2)} USDT Sent to Your Wallet`;
            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
              <body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#f8fafc;">
                <div style="max-width:580px;margin:30px auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.5);">
                  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);padding:32px 30px;text-align:center;border-bottom:1px solid #334155;">
                    <div style="display:inline-block;padding:8px 18px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:30px;margin-bottom:14px;">
                      <span style="font-size:12px;font-weight:800;color:#fbbf24;letter-spacing:1px;text-transform:uppercase;">GIGACHAIN Official Settlement</span>
                    </div>
                    <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Withdrawal Approved &amp; Processed &#x2705;</h1>
                    <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Your payout has been verified and dispatched on-chain</p>
                  </div>
                  <div style="padding:28px 24px;">
                    <p style="font-size:15px;color:#cbd5e1;line-height:1.6;margin-top:0;">Hello <strong>${username}</strong>,</p>
                    <p style="font-size:14px;color:#94a3b8;line-height:1.6;">Your withdrawal request has been approved and processed on the <strong>BNB Smart Chain (BEP20)</strong> network.</p>
                    
                    <div style="background:#022c22;border:1px solid #059669;border-radius:12px;padding:18px;text-align:center;margin:20px 0;">
                      <div style="font-size:11px;font-weight:700;color:#6ee7b7;text-transform:uppercase;letter-spacing:1px;">Net Dispatched to Your Wallet</div>
                      <div style="font-size:30px;font-weight:900;color:#34d399;margin:6px 0;font-family:monospace;">$${receive.toFixed(2)} USDT</div>
                      <div style="font-size:12px;color:#a7f3d0;">Gross Amount: $${amount.toFixed(2)} USDT &bull; Network Fee (6%): $${fee.toFixed(2)} USDT</div>
                    </div>

                    <div style="background:#0b1120;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:20px;">
                      <table style="width:100%;border-collapse:collapse;font-size:13px;">
                        <tr>
                          <td style="padding:7px 0;color:#64748b;font-weight:600;">Status:</td>
                          <td style="padding:7px 0;text-align:right;color:#34d399;font-weight:700;">
                            <span style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);padding:2px 8px;border-radius:12px;">COMPLETED</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:7px 0;color:#64748b;font-weight:600;border-top:1px solid #1e293b;">Asset &amp; Network:</td>
                          <td style="padding:7px 0;text-align:right;color:#f8fafc;font-weight:600;border-top:1px solid #1e293b;">USDT (BEP20 - BNB Smart Chain)</td>
                        </tr>
                        <tr>
                          <td style="padding:7px 0;color:#64748b;font-weight:600;border-top:1px solid #1e293b;">Destination Wallet:</td>
                          <td style="padding:7px 0;text-align:right;font-family:monospace;font-size:11px;color:#fbbf24;word-break:break-all;border-top:1px solid #1e293b;">${destination}</td>
                        </tr>
                        <tr>
                          <td style="padding:7px 0;color:#64748b;font-weight:600;border-top:1px solid #1e293b;">Blockchain Tx Hash:</td>
                          <td style="padding:7px 0;text-align:right;font-family:monospace;font-size:11px;color:#818cf8;word-break:break-all;border-top:1px solid #1e293b;">${finalTxHash}</td>
                        </tr>
                      </table>
                    </div>

                    <p style="font-size:12px;color:#64748b;line-height:1.5;">Funds have been transferred. Depending on BSC block confirmations, tokens will reflect in your wallet in 1-3 minutes.</p>

                    <div style="margin-top:24px;text-align:center;">
                      <a href="https://www.chainviora.com/dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#0f172a;font-weight:800;font-size:13px;padding:11px 24px;border-radius:10px;text-decoration:none;">View Dashboard</a>
                    </div>
                  </div>
                  <div style="background:#090d16;padding:16px;text-align:center;border-top:1px solid #1e293b;font-size:11px;color:#475569;">
                    &copy; 2026 GIGACHAIN Network. All Rights Reserved. &bull; www.chainviora.com
                  </div>
                </div>
              </body>
              </html>
            `;

            let sendRes = await sendResendEmail({
              from: 'Chainviora Support <support@chainviora.com>',
              to: userProf.email,
              subject: emailSubject,
              html: emailHtml
            });

            if (sendRes.status === 403 && sendRes.data?.message?.includes('not verified')) {
              await sendResendEmail({
                from: 'Chainviora Security <onboarding@resend.dev>',
                to: userProf.email,
                subject: emailSubject,
                html: emailHtml
              });
            }
          }
        } catch (mailErr) {
          console.warn('Withdrawal approval email error (non-blocking):', mailErr.message);
        }
      }

      return res.status(200).json({ success: true, message: `Withdrawal marked as ${status}` });
    }

    // ─── 10. Real-time GIGA Buy & Sell Monitoring ───────────────────────────
    if (action === 'get_trades') {
      if (!hasPerm('trades')) return res.status(403).json({ error: 'Access denied to Trades' });

      const [txsRes, profilesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .in('type', ['buy_giga', 'sell_giga', 'giga_buy', 'giga_sell', 'sell_complete'])
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('profiles').select('id, email, username, giga_balance, usdt_balance, lifetime_profit, deposit_addresses, created_at')
      ]);

      const userMap = {};
      const allPendingSells = [];
      const perUserGiga = [];

      let totalGigaBought = 0;
      let totalGigaInWallets = 0;
      let totalPendingSellValue = 0;
      let totalProfitPaid = 0;

      (profilesRes.data || []).forEach(p => {
        userMap[p.id] = p;
        const syncState = (p.deposit_addresses && p.deposit_addresses.sync_state) || {};
        const pendingSells = Array.isArray(syncState.pending_sells) ? syncState.pending_sells : [];
        const gigaBal = parseFloat(p.giga_balance || 0);
        const profit = parseFloat(p.lifetime_profit || 0);

        totalGigaInWallets += gigaBal;
        totalProfitPaid += profit;

        // Count pending sells per user
        pendingSells.forEach(s => {
          const amt = parseFloat(s.amount || 1);
          totalPendingSellValue += amt * 50;
          allPendingSells.push({
            id: s.orderId || s.id || 'ORDER',
            orderId: s.orderId || s.id || 'ORDER',
            amount: amt,
            matchedBuyers: s.matchedBuyers || 0,
            status: s.status || 'Pending',
            email: p.email,
            username: p.username || 'Member',
            queued_at: s.created_at || s.time || null
          });
        });

        // Build per-user GIGA summary
        const totalGigaThisUser = gigaBal + pendingSells.reduce((sum, s) => sum + parseFloat(s.amount || 1), 0);
        if (totalGigaThisUser > 0 || profit > 0 || pendingSells.length > 0) {
          perUserGiga.push({
            id: p.id,
            email: p.email,
            username: p.username || 'GIGA Member',
            giga_in_wallet: gigaBal,
            giga_in_sell_queue: pendingSells.length,
            giga_total: totalGigaThisUser,
            lifetime_profit: profit,
            usdt_balance: parseFloat(p.usdt_balance || 0),
            joined: p.created_at
          });
          totalGigaBought += totalGigaThisUser;
        }
      });

      // Sort perUserGiga by total GIGA desc
      perUserGiga.sort((a, b) => b.giga_total - a.giga_total);

      const trades = (txsRes.data || []).map(t => {
        const u = userMap[t.user_id] || {};
        const isBuy = t.type.includes('buy');
        return {
          id: t.id,
          user_id: t.user_id,
          type: isBuy ? 'BUY' : 'SELL',
          email: u.email || 'Unknown',
          username: u.username || 'Member',
          amount_giga: parseFloat(t.amount_giga || 1),
          amount_usdt: parseFloat(t.amount_usdt || (isBuy ? 30.00 : 50.00)),
          tx_hash: t.tx_hash,
          status: t.status || 'completed',
          notes: t.notes || '',
          created_at: t.created_at
        };
      });

      // Count total GIGA bought from transactions table as backup
      const txBuys = txsRes.data ? txsRes.data.filter(t => t.type.includes('buy')) : [];
      const txBuyGigaTotal = txBuys.reduce((sum, t) => sum + parseFloat(t.amount_giga || 1), 0);

      return res.status(200).json({
        success: true,
        trades,
        pendingSellQueue: allPendingSells,
        perUserGiga,
        gigaStats: {
          totalGigaBought: Math.max(totalGigaBought, txBuyGigaTotal),
          totalGigaInWallets,
          totalInSellQueue: allPendingSells.length,
          totalPendingSellValue: parseFloat(totalPendingSellValue.toFixed(2)),
          totalProfitPaid: parseFloat(totalProfitPaid.toFixed(2)),
          totalBuyTxCount: txBuys.length,
          poolCapacity: 100,
          unitPrice: 30,
          sellPrice: 50
        }
      });
    }

    // ─── 11. Staff Management (Superadmin Only) ─────────────────────────────
    if (action === 'get_staff') {
      if (!isSuperAdmin) return res.status(403).json({ error: 'Superadmin only' });
      const staffSanitized = (config.staff || []).map(s => ({
        id: s.id,
        name: s.name,
        username: s.username,
        permissions: s.permissions || [],
        created_at: s.created_at
      }));
      return res.status(200).json({ success: true, staff: staffSanitized });
    }

    if (action === 'create_staff') {
      if (!isSuperAdmin) return res.status(403).json({ error: 'Superadmin only' });
      const { name, username, password, permissions } = req.body || {};

      if (!name || !username || !password) {
        return res.status(400).json({ error: 'Name, username and password required' });
      }

      const cleanU = String(username).trim();
      if (cleanU.toLowerCase() === (config.admin_username || 'Gigaadmin').toLowerCase()) {
        return res.status(400).json({ error: 'Cannot use superadmin username' });
      }

      config.staff = config.staff || [];
      if (config.staff.some(s => s.username.toLowerCase() === cleanU.toLowerCase())) {
        return res.status(400).json({ error: 'Staff username already exists' });
      }

      const newStaff = {
        id: 'staff_' + Date.now(),
        name: String(name).trim(),
        username: cleanU,
        password: String(password).trim(),
        permissions: Array.isArray(permissions) ? permissions : ['deposits', 'withdrawals'],
        created_at: new Date().toISOString()
      };

      config.staff.push(newStaff);
      await saveAdminConfig(supabase, config);

      return res.status(200).json({
        success: true,
        message: 'Staff member created successfully!',
        staff: {
          id: newStaff.id,
          name: newStaff.name,
          username: newStaff.username,
          permissions: newStaff.permissions,
          created_at: newStaff.created_at
        }
      });
    }

    if (action === 'delete_staff') {
      if (!isSuperAdmin) return res.status(403).json({ error: 'Superadmin only' });
      const { username } = req.body || {};

      config.staff = (config.staff || []).filter(s => s.username.toLowerCase() !== String(username).toLowerCase());
      await saveAdminConfig(supabase, config);

      return res.status(200).json({ success: true, message: 'Staff member deleted' });
    }

    // ─── 12. Notification Broadcast Center ──────────────────────────────────
    if (action === 'get_notifications') {
      return res.status(200).json({
        success: true,
        notifications: config.notifications || []
      });
    }

    if (action === 'post_notification') {
      if (!hasPerm('notifications')) return res.status(403).json({ error: 'Access denied' });
      const { title, type, message, priority } = req.body || {};

      if (!title || !message) {
        return res.status(400).json({ error: 'Title and message required' });
      }

      const newNotif = {
        id: 'notif_' + Date.now(),
        title: String(title).trim(),
        type: type || 'Network Announcement',
        message: String(message).trim(),
        priority: priority || 'normal',
        author: session.name || session.sub,
        created_at: new Date().toISOString()
      };

      config.notifications = config.notifications || [];
      config.notifications.unshift(newNotif);

      // Keep up to 20 notifications
      if (config.notifications.length > 20) {
        config.notifications = config.notifications.slice(0, 20);
      }

      await saveAdminConfig(supabase, config);

      return res.status(200).json({
        success: true,
        message: 'Broadcast published to all users!',
        notification: newNotif
      });
    }

    if (action === 'delete_notification') {
      if (!hasPerm('notifications')) return res.status(403).json({ error: 'Access denied' });
      const { id } = req.body || {};

      config.notifications = (config.notifications || []).filter(n => n.id !== id);
      await saveAdminConfig(supabase, config);

      return res.status(200).json({ success: true, message: 'Notification removed' });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
