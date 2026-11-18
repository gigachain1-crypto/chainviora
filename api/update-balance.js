// api/update-balance.js
// Securely updates user USDT/GIGA balance and profit in Supabase
// Called from dashboard after buy/sell actions

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, usdt_balance, giga_balance, lifetime_profit, action } = req.body;

    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (!SUPABASE_SERVICE_KEY) {
      return res.status(200).json({ success: true, note: 'Supabase not configured, balance saved locally' });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Check if profile exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .single();

    const updateData = {};
    if (usdt_balance !== undefined) updateData.usdt_balance = parseFloat(usdt_balance) || 0;
    if (giga_balance !== undefined) updateData.giga_balance = parseFloat(giga_balance) || 0;
    if (lifetime_profit !== undefined) updateData.lifetime_profit = parseFloat(lifetime_profit) || 0;
    updateData.last_updated = new Date().toISOString();

    let result;
    if (existing) {
      result = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user_id)
        .select();
    } else {
      updateData.id = user_id;
      result = await supabase
        .from('profiles')
        .insert(updateData)
        .select();
    }

    if (result.error) {
      console.error('Balance update error:', result.error.message);
      return res.status(500).json({ error: result.error.message });
    }

    return res.status(200).json({ success: true, action, data: result.data });

  } catch (err) {
    console.error('update-balance fatal:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
