// api/get-marketplace-orders.js
// Fetches user's marketplace sell queue orders (both pending and completed) from Supabase

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user_id = req.query.user_id || req.body?.user_id;
    const email = req.query.email || req.body?.email;
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(200).json({ success: true, orders: [], note: 'Local mode' });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let query = supabase.from('marketplace_orders').select('*');
    if (user_id) {
      query = query.or(`seller_id.eq.${user_id},seller_email.eq.${cleanEmail || ''}`);
    } else if (cleanEmail) {
      query = query.eq('seller_email', cleanEmail);
    } else {
      return res.status(400).json({ error: 'user_id or email is required' });
    }

    const { data: orders, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching marketplace orders:', error.message);
      return res.status(200).json({ success: true, orders: [] });
    }

    return res.status(200).json({
      success: true,
      orders: orders || []
    });

  } catch (err) {
    console.error('get-marketplace-orders error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
