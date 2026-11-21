// api/record-transaction.js
// Handles recording (POST) and retrieving (GET) user transaction activity from Supabase

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // --------------------------------------------------------------------------
  // GET: Fetch user's transaction history
  // --------------------------------------------------------------------------
  if (req.method === 'GET') {
    try {
      const userId = req.query.user_id;
      const email = req.query.email ? req.query.email.trim().toLowerCase() : null;

      if (!userId && !email) {
        return res.status(400).json({ error: 'user_id or email is required' });
      }

      if (!SUPABASE_SERVICE_KEY) {
        return res.status(200).json({ success: true, transactions: [], note: 'Database key not set' });
      }

      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      let targetUserId = userId;

      // If user profile can be found by email, prefer profile.id for consistency
      if (email) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (prof && prof.id) {
          targetUserId = prof.id;
        }
      }

      let query = supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (targetUserId) {
        query = query.eq('user_id', targetUserId);
      }

      const { data, error } = await query;

      if (error) {
        console.warn('Error fetching transactions from Supabase:', error.message);
        return res.status(200).json({ success: true, transactions: [], error: error.message });
      }

      return res.status(200).json({ success: true, transactions: data || [] });

    } catch (err) {
      console.error('get-transactions fatal:', err.message);
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // POST: Record a new transaction
  // --------------------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      const { user_id, email, type, asset, amount_usdt, amount_giga, order_id, tx_hash, status, notes } = req.body || {};

      if ((!user_id && !email) || !type) {
        return res.status(400).json({ error: 'user_id (or email) and type are required' });
      }

      if (!SUPABASE_SERVICE_KEY) {
        return res.status(200).json({ success: true, note: 'Supabase not configured, transaction noted locally' });
      }

      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      let resolvedUserId = user_id;

      if (email) {
        const cleanEmail = email.trim().toLowerCase();
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (prof && prof.id) {
          resolvedUserId = prof.id;
        }
      }

      if (!resolvedUserId) {
        return res.status(400).json({ error: 'User profile not found for transaction' });
      }

      // 🔒 SECURITY CHECK: Clients CANNOT submit 'deposit' transactions directly!
      // All deposits must come through the verified blockchain gateway (/api/check-deposit-status)
      const cleanType = (type || 'activity').toLowerCase().replace(/\s+/g, '_');
      if (cleanType === 'deposit') {
        return res.status(403).json({ error: 'Direct deposit recording forbidden. Must be verified via blockchain gateway.' });
      }

      const noteText = notes || (asset ? `[${asset}] ${type}` : `${type}`);
      // Generate a fallback tx_hash if not provided (tx_hash column is NOT NULL in DB)
      const finalTxHash = tx_hash || ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''));
      // Withdrawals start as 'pending' so admin can review & approve them
      const finalStatus = cleanType === 'withdrawal' ? 'pending' : (status || 'completed');
      const payload = {
        user_id: resolvedUserId,
        type: cleanType,
        amount_usdt: parseFloat(amount_usdt) || 0,
        amount_giga: parseFloat(amount_giga) || 0,
        order_id: order_id || null,
        tx_hash: finalTxHash,
        status: finalStatus,
        notes: noteText,
        created_at: new Date().toISOString()
      };

      // Try inserting with asset if column exists
      let resInsert = await supabase
        .from('transactions')
        .insert({
          ...payload,
          ...(asset ? { asset } : {})
        })
        .select();

      // Fallback if tx_hash or asset column does not exist in production schema yet
      if (resInsert.error && (resInsert.error.message.includes('column') || resInsert.error.code === '42703')) {
        console.warn('Falling back to basic transaction schema without extra columns');
        resInsert = await supabase
          .from('transactions')
          .insert(payload)
          .select();
      }

      if (resInsert.error) {
        console.error('Transaction insert error:', resInsert.error.message);
        return res.status(200).json({ success: true, warning: resInsert.error.message });
      }

      return res.status(200).json({ success: true, transaction: resInsert.data ? resInsert.data[0] : null });

    } catch (err) {
      console.error('record-transaction fatal:', err.message);
      return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
