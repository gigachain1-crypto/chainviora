// api/get-deposit-address.js
// Generates or retrieves a unique permanent TRC20 USDT deposit address for each user via NOWPayments

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, email } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Init Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Check if user already has a deposit address
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('deposit_address, deposit_address_currency')
      .eq('id', user_id)
      .single();

    if (profileErr && profileErr.code !== 'PGRST116') {
      console.error('Supabase profile error:', profileErr);
      return res.status(500).json({ error: 'Database error' });
    }

    // If address already exists, return it
    if (profile && profile.deposit_address) {
      return res.status(200).json({
        success: true,
        address: profile.deposit_address,
        currency: profile.deposit_address_currency || 'usdttrc20',
        cached: true
      });
    }

    // 2. No address yet — create one via NOWPayments API
    // We use the "Create Payment" endpoint to get a unique TRC20 address
    const nowResponse = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        price_amount: 1,          // Nominal amount (address works for any amount)
        price_currency: 'usd',
        pay_currency: 'usdttrc20',
        order_id: `deposit_${user_id}`,
        order_description: `Gigachain deposit address for user ${user_id}`,
        is_fixed_rate: false,
        is_fee_paid_by_user: false
      })
    });

    const nowData = await nowResponse.json();
    console.log('NOWPayments response:', JSON.stringify(nowData));

    if (!nowResponse.ok || !nowData.pay_address) {
      console.error('NOWPayments error:', nowData);
      return res.status(502).json({
        error: 'Failed to generate deposit address from payment gateway',
        details: nowData
      });
    }

    const depositAddress = nowData.pay_address;
    const currency = nowData.pay_currency || 'usdttrc20';

    // 3. Save address permanently to Supabase profile
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        deposit_address: depositAddress,
        deposit_address_currency: currency
      })
      .eq('id', user_id);

    if (updateErr) {
      console.error('Supabase update error:', updateErr);
      // Still return the address even if save fails
    }

    return res.status(200).json({
      success: true,
      address: depositAddress,
      currency: currency,
      cached: false
    });

  } catch (err) {
    console.error('get-deposit-address error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
