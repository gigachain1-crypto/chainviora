// api/admin.js
// GIGACHAIN Unified High-Security Serverless Administration Gateway
// Handles Auth, Google 2FA (RFC 6238 TOTP), Real-time Users, Deposits, Withdrawals, Buy/Sell, Staff RBAC, and Notifications

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const action = req.query.action || (req.body && req.body.action);

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

      // If rejected and refund requested: add balance back to user
      if (status === 'rejected') {
        const refundAmt = parseFloat(tx.amount_usdt || 0);
        const { data: userProf } = await supabase.from('profiles').select('*').eq('id', tx.user_id).maybeSingle();
        if (userProf && refundAmt > 0) {
          const curBal = parseFloat(userProf.usdt_balance || 0);
          const newBal = curBal + refundAmt;
          await supabase.from('profiles').update({ usdt_balance: newBal }).eq('id', tx.user_id);
        }
      }

      await supabase
        .from('transactions')
        .update({
          status: status,
          tx_hash: txHash || tx.tx_hash,
          notes: `${tx.notes || ''} | Admin: ${status} ${refundReason ? '(' + refundReason + ')' : ''}`
        })
        .eq('id', transactionId);

      return res.status(200).json({ success: true, message: `Withdrawal marked as ${status}` });
    }

    // ─── 10. Real-time GIGA Buy & Sell Monitoring ───────────────────────────
    if (action === 'get_trades') {
      if (!hasPerm('trades')) return res.status(403).json({ error: 'Access denied to Trades' });

      const [txsRes, profilesRes] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .in('type', ['buy_giga', 'sell_giga', 'giga_buy', 'giga_sell'])
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('profiles').select('id, email, username, deposit_addresses')
      ]);

      const userMap = {};
      const allPendingSells = [];

      (profilesRes.data || []).forEach(p => {
        userMap[p.id] = p;
        const syncState = (p.deposit_addresses && p.deposit_addresses.sync_state) || {};
        if (Array.isArray(syncState.pending_sells)) {
          syncState.pending_sells.forEach(s => {
            allPendingSells.push({
              ...s,
              email: p.email,
              username: p.username || 'Member'
            });
          });
        }
      });

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

      return res.status(200).json({
        success: true,
        trades,
        pendingSellQueue: allPendingSells
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
