// api/get-marketplace-orders.js
// Fetches user's marketplace sell queue orders (both pending and completed) from Supabase profiles sync_state

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user_id = req.query.user_id || req.body?.user_id;
    const email = req.query.email || req.body?.email;
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    if (!cleanEmail && !user_id) {
      return res.status(400).json({ error: 'user_id or email is required' });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY
    );

    let query = supabase.from('profiles').select('id, email, giga_balance, deposit_addresses');
    if (user_id) {
      query = query.eq('id', user_id);
    } else {
      query = query.ilike('email', cleanEmail);
    }

    const { data: profile, error } = await query.maybeSingle();

    if (error || !profile) {
      return res.status(200).json({ success: true, orders: [] });
    }

    const syncState = (profile.deposit_addresses && profile.deposit_addresses.sync_state)
      ? profile.deposit_addresses.sync_state
      : {};

    const orders = Array.isArray(syncState.pending_sells) ? syncState.pending_sells : [];

    return res.status(200).json({
      success: true,
      orders: orders
    });

  } catch (err) {
    console.error('get-marketplace-orders error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
