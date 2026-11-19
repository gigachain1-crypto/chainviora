// api/update-balance.js
// 100% Cross-Device Real-Time Sync between Desktop & Mobile via Supabase Database

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

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

      const { data: profile, error } = await query.maybeSingle();

      if (error || !profile) {
        return res.status(200).json({
          success: false,
          message: 'Profile not found'
        });
      }

      const syncState = (profile.deposit_addresses && profile.deposit_addresses.sync_state)
        ? profile.deposit_addresses.sync_state
        : {};

      const defaultUsername = profile.email
        ? 'GIGA' + (profile.email.split('@')[0].replace(/[^0-9]/g, '').slice(-6) || Math.floor(100000 + Math.random() * 900000))
        : 'GIGA' + Math.floor(100000 + Math.random() * 900000);

      const usdtBal = syncState.usdt_balance !== undefined
        ? parseFloat(syncState.usdt_balance)
        : (profile.usdt_balance !== undefined ? parseFloat(profile.usdt_balance) : 0.00);

      const profitBal = syncState.lifetime_profit !== undefined
        ? parseFloat(syncState.lifetime_profit)
        : (profile.lifetime_profit !== undefined ? parseFloat(profile.lifetime_profit) : 0.00);

      const gigaBought = syncState.total_giga_bought !== undefined
        ? parseInt(syncState.total_giga_bought, 10)
        : (profile.giga_balance !== undefined ? parseInt(profile.giga_balance, 10) : 0);

      const gigaSold = syncState.total_giga_sold !== undefined
        ? parseInt(syncState.total_giga_sold, 10)
        : 0;

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
        pending_sells: Array.isArray(syncState.pending_sells) ? syncState.pending_sells : [],
        activities: Array.isArray(syncState.activities) ? syncState.activities : []
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

      const { data: profile } = await query.maybeSingle();

      if (!profile) {
        return res.status(200).json({ success: true, note: 'Profile not found' });
      }

      const existingMap = (profile.deposit_addresses && typeof profile.deposit_addresses === 'object')
        ? profile.deposit_addresses
        : {};

      const existingSync = existingMap.sync_state || {};

      // 🔒 TAMPER-PROOF SECURITY: BALANCES ARE 100% SERVER-AUTHORITATIVE!
      // Clients are STRICTLY FORBIDDEN from dictating or altering their own balances via POST!
      // Balances can ONLY ever be changed by:
      // 1) /api/check-deposit-status (Verified on-chain blockchain deposits)
      // 2) /api/marketplace-buy (Verified server-side GIGA order transactions)
      // 3) /api/admin (Cryptographically signed Administrator adjustments)
      //
      // Any balance numbers sent in body.usdt_balance, body.giga_balance, or
      // body.lifetime_profit are COMPLETELY DISCARDED by the server.
      const authoritativeUsdt = parseFloat(profile.usdt_balance || 0.00);
      const authoritativeGiga = parseFloat(profile.giga_balance || 0);
      const authoritativeProfit = parseFloat(profile.lifetime_profit || 0.00);

      const newSyncState = {
        ...existingSync,
        username: profile.username || existingSync.username || defaultUsername,
        usdt_balance: authoritativeUsdt,
        giga_balance: authoritativeGiga,
        lifetime_profit: authoritativeProfit,
        total_giga_bought: authoritativeGiga,
        total_giga_sold: existingSync.total_giga_sold || 0,
        pending_sells: Array.isArray(body.pending_sells) ? body.pending_sells : (existingSync.pending_sells || []),
        activities: Array.isArray(body.activities) ? body.activities : (existingSync.activities || [])
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
        action: 'sync',
        usdt_balance: authoritativeUsdt,
        giga_balance: authoritativeGiga,
        lifetime_profit: authoritativeProfit,
        state: newSyncState
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('update-balance error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
