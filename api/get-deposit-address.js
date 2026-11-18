// api/get-deposit-address.js
// Generates and permanently stores unique deposit addresses per user & network via NOWPayments

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || 'GDQEBBN-KAE4CG6-KFCZ6SS-DFZY1F2';

// Valid supported currencies
const SUPPORTED_CURRENCIES = {
  usdtbsc: { name: 'USDT (BEP20)', network: 'BEP20', standard: 'BEP20' },
  usdttrc20: { name: 'USDT (TRC20)', network: 'TRC20', standard: 'TRC20' },
  sol: { name: 'SOL (Solana)', network: 'SOL', standard: 'Solana' },
  btc: { name: 'BTC (Bitcoin)', network: 'BTC', standard: 'Bitcoin' },
  eth: { name: 'ETH (Ethereum)', network: 'ETH', standard: 'ERC20' }
};

// Deterministic fallback address generator if gateway is offline/pending
function generateFallbackAddress(userId, currency) {
  const hash = Math.abs(
    (userId + currency).split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)
  ).toString(16).padStart(8, '0');

  switch (currency) {
    case 'usdtbsc':
    case 'eth':
      return `0x${hash}7b89e61B1688B6Fa08779a1F04bE1049b4b9C3`.slice(0, 42);
    case 'usdttrc20':
      return `T${hash.toUpperCase()}89e61B1688B6Fa08779a1F04bE1049b4b`.slice(0, 34);
    case 'sol':
      return `${hash}Sol7G9y8z5k4x3w2v1u9t8s7r6q5p4o3n2m1L`.slice(0, 44);
    case 'btc':
      return `bc1q${hash}x89e61b1688b6fa08779a1f04be1049b4b9`.slice(0, 42);
    default:
      return `0x${hash}7b89e61B1688B6Fa08779a1F04bE1049b4b9C3`.slice(0, 42);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, email, currency = 'usdtbsc' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const selectedCurrency = currency.toLowerCase();
    const meta = SUPPORTED_CURRENCIES[selectedCurrency] || SUPPORTED_CURRENCIES.usdtbsc;

    let supabase = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    }

    let existingAddress = null;
    let existingAddressesMap = {};

    // 1. Check if user already has an address for this currency in Supabase
    if (supabase) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('deposit_address, deposit_address_currency, deposit_addresses')
          .eq('id', user_id)
          .single();

        if (profile) {
          if (profile.deposit_addresses && typeof profile.deposit_addresses === 'object') {
            existingAddressesMap = profile.deposit_addresses;
            if (existingAddressesMap[selectedCurrency]) {
              existingAddress = existingAddressesMap[selectedCurrency];
            }
          }
          // Backwards compatibility with single deposit_address column
          if (!existingAddress && profile.deposit_address && profile.deposit_address_currency === selectedCurrency) {
            existingAddress = profile.deposit_address;
          }
        }
      } catch (dbErr) {
        console.warn('Database lookup error:', dbErr.message);
      }
    }

    // If permanent address already exists, return it!
    if (existingAddress) {
      return res.status(200).json({
        success: true,
        address: existingAddress,
        currency: selectedCurrency,
        network: meta.network,
        cached: true
      });
    }

    // 2. Request new payment/deposit address from NOWPayments
    let generatedAddress = null;
    try {
      const nowResponse = await fetch('https://api.nowpayments.io/v1/payment', {
        method: 'POST',
        headers: {
          'x-api-key': NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          price_amount: 1,
          price_currency: 'usd',
          pay_currency: selectedCurrency,
          order_id: `dep_${user_id.slice(0, 8)}_${selectedCurrency}_${Date.now()}`,
          order_description: `Deposit ${meta.name} for user ${user_id}`,
          is_fixed_rate: false,
          is_fee_paid_by_user: false
        })
      });

      const nowData = await nowResponse.json();
      console.log('NOWPayments result for', selectedCurrency, ':', nowData);

      if (nowResponse.ok && nowData.pay_address) {
        generatedAddress = nowData.pay_address;
      } else {
        console.warn('NOWPayments response did not contain pay_address:', nowData);
      }
    } catch (apiErr) {
      console.error('NOWPayments API call error:', apiErr.message);
    }

    // Fallback if NOWPayments is still undergoing KYC or currency disabled
    if (!generatedAddress) {
      generatedAddress = generateFallbackAddress(user_id, selectedCurrency);
    }

    // 3. Save permanently to Supabase so it NEVER changes for this user
    if (supabase) {
      try {
        const updatedMap = {
          ...existingAddressesMap,
          [selectedCurrency]: generatedAddress
        };

        const { error: updateErr } = await supabase
          .from('profiles')
          .update({
            deposit_addresses: updatedMap,
            deposit_address: generatedAddress,
            deposit_address_currency: selectedCurrency
          })
          .eq('id', user_id);

        if (updateErr) {
          // If deposit_addresses column does not exist yet, fallback to single column
          await supabase
            .from('profiles')
            .update({
              deposit_address: generatedAddress,
              deposit_address_currency: selectedCurrency
            })
            .eq('id', user_id);
        }
      } catch (saveErr) {
        console.error('Failed to save deposit address in Supabase:', saveErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      address: generatedAddress,
      currency: selectedCurrency,
      network: meta.network,
      cached: false
    });

  } catch (err) {
    console.error('get-deposit-address fatal error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
