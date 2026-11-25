// api/update-balance.js
// 100% Cross-Device Real-Time Sync between Desktop & Mobile via Supabase Database
// Includes Server-Authoritative Balances & Automatic Referral Bonus Crediting

const { applySecurityMiddleware } = require('./_security');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Helper to verify and permanently credit qualified $5 referral bonuses on the server
async function ensureReferralBonusesCredited(supabase, profile) {
  if (!profile || !profile.referral_code) return profile;

  try {
    const cleanRef = profile.referral_code.toString().trim().toUpperCase().slice(0, 6);

    // 1. Fetch all users who registered with this user's referral code
    const { data: referredUsers } = await supabase
      .from('profiles')
      .select('id, email, username, usdt_balance, created_at')
      .eq('referred_by', cleanRef);

    // 2. Also check referrals table
    let referralsTableRows = [];
    try {
      const { data: rows } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_code', cleanRef);
      if (rows) referralsTableRows = rows;
    } catch (e) { }

    const existingMap = (profile.deposit_addresses && typeof profile.deposit_addresses === 'object')
      ? profile.deposit_addresses
      : {};
    const existingSync = existingMap.sync_state || {};
    const creditedUsersMap = existingSync.credited_referral_users || {};

    let newlyCreditedBonus = 0;
    const updatedCreditedUsers = { ...creditedUsersMap };

    const candidates = [];
    if (referredUsers && Array.isArray(referredUsers)) {
      referredUsers.forEach(u => candidates.push(u));
    }
    referralsTableRows.forEach(r => {
      if (!candidates.find(c => c.email && r.referred_email && c.email.toLowerCase() === r.referred_email.toLowerCase())) {
        candidates.push({
          email: r.referred_email,
          username: r.referred_username,
          usdt_balance: parseFloat(r.deposit_amount || 0),
          bonus_awarded: r.bonus_awarded
        });
      }
    });

    // 3. Fetch transaction history to ensure strictly 1-time bonus per referred user
    let existingBonusTxs = [];
    try {
      const { data: txs } = await supabase
        .from('transactions')
        .select('notes')
        .eq('user_id', profile.id)
        .eq('type', 'referral_bonus');
      if (txs) existingBonusTxs = txs;
    } catch (e) { }

    for (const refUser of candidates) {
      const refEmail = (refUser.email || '').toLowerCase().trim();
      if (!refEmail) continue;

      const userBal = parseFloat(refUser.usdt_balance || 0);
      // Qualified if user deposited >= 30 USDT or bonus_awarded is true
      const isQualified = userBal >= 30 || refUser.bonus_awarded === true;

      const alreadyCreditedInMap = Boolean(updatedCreditedUsers[refEmail]);
      const alreadyCreditedInTx = existingBonusTxs.some(t => t.notes && t.notes.toLowerCase().includes(refEmail));

      // Strictly 1-TIME BONUS per referred user: Skip if already credited once
      if (isQualified && !alreadyCreditedInMap && !alreadyCreditedInTx) {
        newlyCreditedBonus += 5.00;
        updatedCreditedUsers[refEmail] = {
          time: new Date().toISOString(),
          amount: 5.00,
          referred_user: refUser.username || refEmail
        };

        // Ensure referrals table is marked awarded
        try {
          await supabase.from('referrals').upsert({
            referrer_code: cleanRef,
            referred_email: refEmail,
            referred_username: refUser.username || 'Member',
            deposit_amount: userBal,
            bonus_awarded: true,
            bonus_amount: 5.00
          }, { onConflict: 'referred_email' });
        } catch (e) { }
      }
    }

    if (newlyCreditedBonus > 0) {
      const currentBal = parseFloat(profile.usdt_balance || 0);
      const newBal = currentBal + newlyCreditedBonus;

      const newActivities = Array.isArray(existingSync.activities) ? [...existingSync.activities] : [];
      newActivities.unshift({
        id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        time: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        type: 'Referral Bonus',
        asset: 'USDT',
        amount: `+$${newlyCreditedBonus.toFixed(2)} USDT`,
        status: 'Completed',
        notes: `Referral Bonus: +$${newlyCreditedBonus.toFixed(2)} USDT from qualified referral deposit ($30+ USDT)`,
        rawAmount: newlyCreditedBonus
      });

      const newSyncState = {
        ...existingSync,
        usdt_balance: newBal,
        credited_referral_users: updatedCreditedUsers,
        activities: newActivities.slice(0, 50)
      };

      const updatePayload = {
        usdt_balance: newBal,
        deposit_addresses: {
          ...existingMap,
          sync_state: newSyncState
        },
        last_updated: new Date().toISOString()
      };

      await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', profile.id);

      // Record in transactions table
      try {
        await supabase.from('transactions').insert({
          user_id: profile.id,
          type: 'referral_bonus',
          amount_usdt: newlyCreditedBonus,
          amount_giga: 0,
          status: 'completed',
          notes: `Referral Bonus: +$${newlyCreditedBonus.toFixed(2)} USDT from qualified referral deposit (${Object.keys(updatedCreditedUsers).join(', ')})`,
          created_at: new Date().toISOString()
        });
      } catch (e) { }

      profile.usdt_balance = newBal;
      profile.deposit_addresses = { ...existingMap, sync_state: newSyncState };
    }
  } catch (err) {
    console.warn('ensureReferralBonusesCredited error:', err.message);
  }

  return profile;
}

module.exports = async (req, res) => {
  // 🔒 Security: 60 sync requests per minute per IP (dashboard polls frequently)
  const proceed = await applySecurityMiddleware(req, res, {
    endpoint: 'update-balance',
    allowGet: true,
    rateLimit: { max: 60, windowMs: 60 * 1000 }
  });
  if (!proceed) return;

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY || 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY'
    );

    // --------------------------------------------------------------------------
    // 1. GET: Retrieve user's live cross-device state (Balances, Sells & Portfolio)
    // --------------------------------------------------------------------------
    if (req.method === 'GET') {
      const email = req.query.email ? req.query.email.trim().toLowerCase() : null;
      const userId = req.query.user_id;

      if (!email && !userId) {
        return res.status(400).json({ error: 'email or user_id required' });
      }

      let query = supabase.from('profiles').select('*');
      if (email) {
        query = query.ilike('email', email);
      } else {
        query = query.eq('id', userId);
      }

      let { data: profile, error } = await query.maybeSingle();

      if (error || !profile) {
        return res.status(200).json({
          success: false,
          message: 'Profile not found'
        });
      }

      // Check and permanently credit any qualified referral bonuses on the server
      profile = await ensureReferralBonusesCredited(supabase, profile);

      const syncState = (profile.deposit_addresses && profile.deposit_addresses.sync_state)
        ? profile.deposit_addresses.sync_state
        : {};

      const defaultUsername = profile.email
        ? 'GIGA' + (profile.email.split('@')[0].replace(/[^0-9]/g, '').slice(-6) || Math.floor(100000 + Math.random() * 900000))
        : 'GIGA' + Math.floor(100000 + Math.random() * 900000);

      const usdtBal = (profile.usdt_balance !== undefined && profile.usdt_balance !== null)
        ? parseFloat(profile.usdt_balance)
        : (syncState.usdt_balance !== undefined ? parseFloat(syncState.usdt_balance) : 0.00);

      const profitBal = (profile.lifetime_profit !== undefined && profile.lifetime_profit !== null)
        ? parseFloat(profile.lifetime_profit)
        : (syncState.lifetime_profit !== undefined ? parseFloat(syncState.lifetime_profit) : 0.00);

      const gigaBought = (profile.giga_balance !== undefined && profile.giga_balance !== null)
        ? parseInt(profile.giga_balance, 10)
        : (syncState.total_giga_bought !== undefined ? parseInt(syncState.total_giga_bought, 10) : 0);

      const gigaSold = syncState.total_giga_sold !== undefined
        ? parseInt(syncState.total_giga_sold, 10)
        : 0;

      // Calculate total referral stats to return directly to frontend
      let totalReferralEarned = 0;
      let totalInvitedCount = 0;
      if (profile.referral_code) {
        const cleanRef = profile.referral_code.toString().trim().toUpperCase().slice(0, 6);
        const { data: refs } = await supabase.from('profiles').select('email, usdt_balance').eq('referred_by', cleanRef);
        if (refs) {
          totalInvitedCount = refs.length;
          refs.forEach(r => {
            if (parseFloat(r.usdt_balance || 0) >= 30) totalReferralEarned += 5.00;
          });
        }
      }

      // Ensure pending_sells contains at least total_giga_bought items if user has bought GIGA
      let serverPendingSells = Array.isArray(syncState.pending_sells) ? syncState.pending_sells : [];
      const totalBoughtServer = Math.max(gigaBought, parseInt(profile.giga_balance || 0, 10));
      if (totalBoughtServer > serverPendingSells.length) {
        const missing = totalBoughtServer - serverPendingSells.length;
        for (let i = 0; i < missing; i++) {
          serverPendingSells.unshift({
            orderId: `#SELL-${Math.floor(100000 + Math.random() * 900000)}`,
            backgroundOrderId: `GIGA-ORD-${Math.floor(100000 + Math.random() * 900000)}`,
            amount: 1,
            price: 30.00,
            profit: 50.00,
            matchedBuyers: 0,
            requiredBuyers: 3,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'Pending',
            created_at: new Date().toISOString()
          });
        }
        syncState.pending_sells = serverPendingSells;
        try {
          await supabase.from('profiles').update({
            deposit_addresses: {
              ...profile.deposit_addresses,
              sync_state: syncState
            }
          }).eq('id', profile.id);
        } catch (e) { }
      }

      // Cross-reference user's activities with the transactions table so approved/completed
      // withdrawals and deposits always show 'Completed' with their verified tx_hash.
      let resolvedActivities = Array.isArray(syncState.activities) ? [...syncState.activities] : [];
      try {
        const { data: userTxs } = await supabase
          .from('transactions')
          .select('id, type, status, tx_hash, amount_usdt, notes, created_at')
          .eq('user_id', profile.id);

        const extractApprovedAt = (notes) => {
          if (!notes) return null;
          const m = String(notes).match(/ApprovedAt:\s*([^\s|]+)/i);
          return m ? m[1] : null;
        };

        if (userTxs && userTxs.length > 0) {
          const txHashMap = {};
          userTxs.forEach(t => {
            if (t.tx_hash) {
              txHashMap[t.tx_hash.toLowerCase()] = t;
            }
          });

          let anyActivityFixed = false;
          resolvedActivities = resolvedActivities.map(act => {
            const h = (act.txHash || '').toLowerCase();
            const directMatch = txHashMap[h];

            if (directMatch) {
              const mappedStatus = (directMatch.status === 'completed' || directMatch.status === 'approved')
                ? 'Completed'
                : (directMatch.status === 'rejected' ? 'Rejected' : act.status);
              const approvedTime = mappedStatus === 'Completed'
                ? (act.completedAt || extractApprovedAt(directMatch.notes) || directMatch.created_at)
                : act.completedAt;
              if (act.status !== mappedStatus || (approvedTime && act.completedAt !== approvedTime)) {
                anyActivityFixed = true;
                return {
                  ...act,
                  status: mappedStatus,
                  id: act.id || directMatch.id,
                  ...(approvedTime ? { completedAt: approvedTime } : {})
                };
              }
              return act;
            }

            // Fallback match for withdrawals by type and amount
            if (act.type && act.type.toLowerCase().includes('withdraw')) {
              const actAmt = Math.abs(parseFloat(act.rawAmount || (act.amount + '').replace(/[^0-9.-]/g, '') || 0));
              const txMatch = userTxs.find(t =>
                t.type === 'withdrawal' &&
                Math.abs(parseFloat(t.amount_usdt || 0) - actAmt) < 0.05
              );

              if (txMatch) {
                const mappedStatus = (txMatch.status === 'completed' || txMatch.status === 'approved')
                  ? 'Completed'
                  : (txMatch.status === 'rejected' ? 'Rejected' : act.status);
                const approvedTime = mappedStatus === 'Completed'
                  ? (act.completedAt || extractApprovedAt(txMatch.notes) || txMatch.created_at)
                  : act.completedAt;
                if (act.status !== mappedStatus || (txMatch.tx_hash && act.txHash !== txMatch.tx_hash) || (approvedTime && act.completedAt !== approvedTime)) {
                  anyActivityFixed = true;
                  return {
                    ...act,
                    status: mappedStatus,
                    txHash: txMatch.tx_hash || act.txHash,
                    id: act.id || txMatch.id,
                    ...(approvedTime ? { completedAt: approvedTime } : {})
                  };
                }
              }
            }
            return act;
          });

          // Persist corrected activities back to profile so cross-device state stays consistent
          if (anyActivityFixed) {
            try {
              syncState.activities = resolvedActivities;
              await supabase.from('profiles').update({
                deposit_addresses: {
                  ...profile.deposit_addresses,
                  sync_state: syncState
                }
              }).eq('id', profile.id);
            } catch (e) { }
          }
        }
      } catch (e) {
        console.warn('Activities db cross-reference check error:', e.message);
      }

      return res.status(200).json({
        success: true,
        user_id: profile.id,
        email: profile.email,
        username: profile.username || syncState.username || defaultUsername,
        full_name: profile.full_name || profile.name || null,
        created_at: profile.created_at || null,
        referral_code: profile.referral_code || null,
        usdt_balance: isNaN(usdtBal) ? 0.00 : usdtBal,
        lifetime_profit: isNaN(profitBal) ? 0.00 : profitBal,
        giga_balance: parseFloat(profile.giga_balance || 0),
        total_giga_bought: isNaN(gigaBought) ? 0 : gigaBought,
        total_giga_sold: isNaN(gigaSold) ? 0 : gigaSold,
        referral_earned: totalReferralEarned,
        referral_count: totalInvitedCount,
        pending_sells: serverPendingSells,
        activities: resolvedActivities
      });
    }

    // --------------------------------------------------------------------------
    // 2. POST: Save user's UI preferences/queues (SERVER-AUTHORITATIVE BALANCES)
    // --------------------------------------------------------------------------
    if (req.method === 'POST') {
      const body = req.body || {};
      const email = body.email ? body.email.trim().toLowerCase() : null;
      const userId = body.user_id;

      if (!email && !userId) {
        return res.status(400).json({ error: 'email or user_id required' });
      }

      // Find profile
      let query = supabase.from('profiles').select('*');
      if (email) {
        query = query.ilike('email', email);
      } else {
        query = query.eq('id', userId);
      }

      let { data: profile } = await query.maybeSingle();

      if (!profile) {
        return res.status(200).json({ success: true, note: 'Profile not found' });
      }

      // Check and permanently credit any qualified referral bonuses on the server
      profile = await ensureReferralBonusesCredited(supabase, profile);

      const existingMap = (profile.deposit_addresses && typeof profile.deposit_addresses === 'object')
        ? profile.deposit_addresses
        : {};

      const existingSync = existingMap.sync_state || {};

      // 🔒 TAMPER-PROOF SECURITY: BALANCES ARE 100% SERVER-AUTHORITATIVE!
      // Clients are STRICTLY FORBIDDEN from dictating or altering their own balances via POST!
      const authoritativeUsdt = parseFloat(profile.usdt_balance || 0.00);
      const authoritativeGiga = parseFloat(profile.giga_balance || 0);
      let authoritativeProfit = parseFloat(profile.lifetime_profit || 0.00);

      // Handle OTP-verified atomic withdrawal strictly from Total Profit
      let withdrawalResult = null;
      let updatedUsedTokens = Array.isArray(existingSync.used_withdrawal_tokens) ? [...existingSync.used_withdrawal_tokens] : [];
      if (body.action === 'withdrawal') {
        const crypto = require('crypto');
        const OTP_SECRET = process.env.OTP_SECRET || 'chainviora-secret-key-otp-2026';
        const withdrawAmt = parseFloat(body.amount) || 0;
        const destination = String(body.destination || '').trim();
        const assetName = String(body.asset || 'USDT').trim();
        const otp = String(body.otp || '').trim();
        const otpToken = String(body.otp_token || '').trim();
        const targetEmail = (profile.email || email || '').trim().toLowerCase();

        if (withdrawAmt < 50) {
          return res.status(400).json({ error: 'Minimum withdrawal amount is $50.00 USDT.' });
        }
        if (!destination || destination.length < 10) {
          return res.status(400).json({ error: 'Valid destination wallet address is required.' });
        }
        if (!/^\d{6}$/.test(otp) || !otpToken || !otpToken.includes('.')) {
          return res.status(403).json({ error: 'Valid 6-digit Email OTP and verification token are required.' });
        }

        const [expectedHash, expiresAtStr] = otpToken.split('.');
        const expiresAt = parseInt(expiresAtStr, 10);
        if (isNaN(expiresAt) || Date.now() > expiresAt) {
          return res.status(400).json({ error: 'Withdrawal OTP has expired. Please request a new OTP.' });
        }

        const tokenSig = crypto.createHash('sha256').update(otpToken).digest('hex').slice(0, 24);
        if (updatedUsedTokens.includes(tokenSig)) {
          return res.status(409).json({ error: 'This withdrawal OTP has already been used. Please request a new OTP.' });
        }

        const computedHash = crypto
          .createHmac('sha256', OTP_SECRET)
          .update(`${targetEmail}:${otp}:${expiresAt}`)
          .digest('hex');

        const isOtpValid = expectedHash.length === computedHash.length &&
          crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(expectedHash, 'hex'));

        if (!isOtpValid) {
          return res.status(403).json({ error: 'Invalid withdrawal Email OTP. Authorization denied.' });
        }

        if (authoritativeProfit < withdrawAmt) {
          return res.status(400).json({ error: `Insufficient profit balance. Available: $${authoritativeProfit.toFixed(2)}` });
        }

        const nextProfit = parseFloat(Math.max(0, authoritativeProfit - withdrawAmt).toFixed(2));
        const { data: lockedProfRows, error: lockErr } = await supabase
          .from('profiles')
          .update({
            lifetime_profit: nextProfit,
            last_updated: new Date().toISOString()
          })
          .eq('id', profile.id)
          .gte('lifetime_profit', withdrawAmt)
          .select('id, lifetime_profit');

        if (lockErr || !lockedProfRows || lockedProfRows.length === 0) {
          return res.status(400).json({ error: 'Insufficient profit balance or concurrent withdrawal already processed.' });
        }

        authoritativeProfit = nextProfit;
        updatedUsedTokens = [tokenSig, ...updatedUsedTokens].slice(0, 20);

        const fee = parseFloat((withdrawAmt * 0.06).toFixed(2));
        const receive = parseFloat((withdrawAmt - fee).toFixed(2));
        const wTxHash = '0x' + crypto.randomBytes(32).toString('hex');
        const nowIso = new Date().toISOString();
        const wNotes = `Address: ${destination} | Net: ${receive.toFixed(2)} ${assetName} | Fee: ${fee.toFixed(2)} ${assetName}`;

        await supabase.from('transactions').insert({
          user_id: profile.id,
          type: 'withdrawal',
          amount_usdt: withdrawAmt,
          amount_giga: 0,
          tx_hash: wTxHash,
          status: 'pending',
          notes: `[${assetName} (-6% Fee)] ${wNotes} (Tx: ${wTxHash.slice(0, 10)}...)`,
          created_at: nowIso
        });

        withdrawalResult = {
          id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          type: 'Withdrawal',
          asset: `${assetName} (-6% Fee)`,
          amount: `-${withdrawAmt.toFixed(2)} ${assetName}`,
          rawAmount: withdrawAmt,
          txHash: wTxHash,
          time: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          isoTime: nowIso,
          status: 'Pending',
          notes: wNotes
        };
      }

      const defaultUsername = profile.email
        ? 'GIGA' + (profile.email.split('@')[0].replace(/[^0-9]/g, '').slice(-6) || Math.floor(100000 + Math.random() * 900000))
        : 'GIGA' + Math.floor(100000 + Math.random() * 900000);

      // Preserve authoritative server pending sells (never let stale client state overwrite DB orders)
      let resolvedPendingSells = Array.isArray(existingSync.pending_sells) ? existingSync.pending_sells : [];
      if (resolvedPendingSells.length === 0 && Array.isArray(body.pending_sells) && body.pending_sells.length > 0 && authoritativeGiga > 0) {
        resolvedPendingSells = body.pending_sells.slice(0, Math.max(1, Math.floor(authoritativeGiga)));
      }
      if (authoritativeGiga > resolvedPendingSells.length) {
        const missing = authoritativeGiga - resolvedPendingSells.length;
        for (let i = 0; i < missing; i++) {
          resolvedPendingSells.unshift({
            orderId: `#SELL-${Math.floor(100000 + Math.random() * 900000)}`,
            backgroundOrderId: `GIGA-ORD-${Math.floor(100000 + Math.random() * 900000)}`,
            amount: 1,
            price: 30.00,
            profit: 50.00,
            matchedBuyers: 0,
            requiredBuyers: 3,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'Pending',
            created_at: new Date().toISOString()
          });
        }
      }

      let resolvedActivities = Array.isArray(existingSync.activities) ? existingSync.activities : [];
      if (withdrawalResult) {
        resolvedActivities = [withdrawalResult, ...resolvedActivities].slice(0, 50);
      } else if (Array.isArray(body.activities) && body.activities.length > 0) {
        // Build map of already completed transactions to preserve status
        const completedMap = {};
        resolvedActivities.forEach(a => {
          if (a.txHash && a.status === 'Completed') {
            completedMap[a.txHash.toLowerCase()] = a;
          }
        });

        resolvedActivities = body.activities.map(a => {
          const h = (a.txHash || '').toLowerCase();
          if (completedMap[h] && a.status === 'Pending') {
            return { ...a, status: 'Completed', txHash: completedMap[h].txHash || a.txHash };
          }
          return a;
        });
      }

      const newSyncState = {
        ...existingSync,
        username: profile.username || existingSync.username || defaultUsername,
        usdt_balance: authoritativeUsdt,
        giga_balance: authoritativeGiga,
        lifetime_profit: authoritativeProfit,
        total_giga_bought: authoritativeGiga,
        total_giga_sold: existingSync.total_giga_sold || 0,
        used_withdrawal_tokens: updatedUsedTokens,
        pending_sells: resolvedPendingSells,
        activities: resolvedActivities
      };

      const updatePayload = {
        last_updated: new Date().toISOString(),
        deposit_addresses: {
          ...existingMap,
          sync_state: newSyncState
        }
      };

      if (body.username && !profile.username) {
        updatePayload.username = body.username;
      }

      await supabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', profile.id);

      // Return the TRUE authoritative server balances back to the client
      return res.status(200).json({
        success: true,
        action: body.action || 'sync',
        usdt_balance: authoritativeUsdt,
        giga_balance: authoritativeGiga,
        lifetime_profit: authoritativeProfit,
        withdrawal: withdrawalResult,
        state: newSyncState
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('update-balance error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
