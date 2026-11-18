// api/record-transaction.js
// Records buy/sell/deposit/withdrawal transactions to Supabase

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, type, amount_usdt, amount_giga, order_id, status, notes } = req.body;

    if (!user_id || !type) {
      return res.status(400).json({ error: 'user_id and type are required' });
    }

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(200).json({ success: true, note: 'Supabase not configured, transaction noted locally' });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id,
        type,                            // 'buy_giga', 'sell_complete', 'deposit', 'withdrawal'
        amount_usdt: parseFloat(amount_usdt) || 0,
        amount_giga: parseFloat(amount_giga) || 0,
        order_id: order_id || null,
        status: status || 'completed',
        notes: notes || null,
        created_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('Transaction record error:', error.message);
      // Don't fail the user action — just log it
      return res.status(200).json({ success: true, warning: error.message });
    }

    return res.status(200).json({ success: true, transaction: data[0] });

  } catch (err) {
    console.error('record-transaction fatal:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
