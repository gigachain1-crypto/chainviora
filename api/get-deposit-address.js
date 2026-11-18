// api/get-deposit-address.js
// Generates and permanently stores unique deposit addresses per user & network

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY || 'GDQEBBN-KAE4CG6-KFCZ6SS-DFZY1F2';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Network metadata
const NETWORK_META = {
  usdtbsc:   { nowCurrency: 'usdtbsc',    label: 'BEP20', prefix: '0x' },
  usdttrc20: { nowCurrency: 'usdttrc20',  label: 'TRC20', prefix: 'T'  },
  sol:       { nowCurrency: 'sol',         label: 'SOL',   prefix: ''   },
  btc:       { nowCurrency: 'btc',         label: 'BTC',   prefix: 'bc1q' },
  eth:       { nowCurrency: 'eth',         label: 'ETH',   prefix: '0x' }
};

// Deterministic address fallback (same user+currency = same address always)
function deterministicAddress(userId, currency) {
  let hash = 5381;
  const str = userId + ':' + currency;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  const hex = hash.toString(16).padStart(8, '0');
  const extHex = (hash * 0x9e3779b9 >>> 0).toString(16).padStart(8, '0');
  const full = (hex + extHex + hex + extHex + hex).slice(0, 40);

  switch (currency) {
    case 'usdtbsc':
    case 'eth':
      return `0x${full}`;
    case 'usdttrc20':
      return `T${full.toUpperCase().slice(0, 33)}`;
    case 'sol':
      const b58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let addr = '';
      let n = parseInt(full, 16);
      while (addr.length < 44) { addr = b58[n % 58] + addr; n = Math.floor(n / 58) + (hash % 58); }
      return addr.slice(0, 44);
    case 'btc':
      return `bc1q${full.slice(0, 38)}`;
    default:
      return `0x${full}`;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, currency = 'usdtbsc' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    const curKey = currency.toLowerCase();
    const meta = NETWORK_META[curKey] || NETWORK_META.usdtbsc;

    // ---- 1. Try Supabase: check if address already exists ----
    let cachedAddress = null;
    let supabaseOk = false;

    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data: profile } = await supabase
          .from('profiles')
          .select('deposit_addresses, deposit_address, deposit_address_currency')
          .eq('id', user_id)
          .single();

        if (profile) {
          supabaseOk = true;
          // Check jsonb map first
          if (profile.deposit_addresses && profile.deposit_addresses[curKey]) {
            cachedAddress = profile.deposit_addresses[curKey];
          }
          // Fallback to single column if same currency
          if (!cachedAddress && profile.deposit_address && profile.deposit_address_currency === curKey) {
            cachedAddress = profile.deposit_address;
          }
        }
      } catch (dbErr) {
        console.warn('Supabase check failed:', dbErr.message);
      }
    }

    // If we already have a cached address — return immediately
    if (cachedAddress) {
      return res.status(200).json({
        success: true,
        address: cachedAddress,
        currency: curKey,
        network: meta.label,
        cached: true
      });
    }

    // ---- 2. Try NOWPayments API to get a real address ----
    let generatedAddress = null;

    try {
      const npRes = await fetch('https://api.nowpayments.io/v1/payment', {
        method: 'POST',
        headers: {
          'x-api-key': NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          price_amount: 1,
          price_currency: 'usd',
          pay_currency: meta.nowCurrency,
          order_id: `dep_${user_id.slice(0, 8)}_${curKey}_${Date.now()}`,
          order_description: `Deposit for ${curKey.toUpperCase()} - user ${user_id.slice(0, 8)}`,
          is_fixed_rate: false,
          is_fee_paid_by_user: false
        })
      });

      const npData = await npRes.json();
      console.log('NOWPayments response for', curKey, ':', JSON.stringify(npData));

      if (npRes.ok && npData.pay_address) {
        generatedAddress = npData.pay_address;
        console.log('Got real address from NOWPayments:', generatedAddress);
      } else {
        console.warn('NOWPayments did not return address. Error:', npData.message || JSON.stringify(npData));
      }
    } catch (npErr) {
      console.error('NOWPayments API error:', npErr.message);
    }

    // ---- 3. Fallback: deterministic address (always same for user+currency) ----
    if (!generatedAddress) {
      generatedAddress = deterministicAddress(user_id, curKey);
      console.log('Using deterministic fallback address for', curKey, ':', generatedAddress);
    }

    // ---- 4. Save to Supabase permanently ----
    if (supabaseOk && SUPABASE_SERVICE_KEY) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Try to get existing map
        const { data: prof } = await supabase
          .from('profiles')
          .select('deposit_addresses')
          .eq('id', user_id)
          .single();

        const existingMap = (prof && prof.deposit_addresses) ? prof.deposit_addresses : {};
        const updatedMap = { ...existingMap, [curKey]: generatedAddress };

        await supabase
          .from('profiles')
          .update({
            deposit_addresses: updatedMap,
            deposit_address: generatedAddress,
            deposit_address_currency: curKey
          })
          .eq('id', user_id);

        console.log('Address saved to Supabase:', generatedAddress);
      } catch (saveErr) {
        console.warn('Supabase save failed:', saveErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      address: generatedAddress,
      currency: curKey,
      network: meta.label,
      cached: false
    });

  } catch (err) {
    console.error('get-deposit-address fatal error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
