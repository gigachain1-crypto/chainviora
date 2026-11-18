// api/process-deposit.js
// Handles user crypto deposits & awards fixed $5 referral bonus to inviter if deposit >= $30

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, email, amount, currency = 'usdtbsc', tx_hash } = req.body;

    const depositAmount = parseFloat(amount);
    if (!depositAmount || depositAmount <= 0) {
      return res.status(400).json({ error: 'Valid deposit amount is required' });
    }

    const cleanEmail = email ? email.trim().toLowerCase() : null;

    if (!SUPABASE_SERVICE_KEY) {
      return res.status(200).json({
        success: true,
        note: 'Saved locally',
        deposit_amount: depositAmount,
        qualifies_for_bonus: depositAmount >= 30
      });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Fetch depositing user's profile
    let profile = null;
    if (user_id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user_id).maybeSingle();
      profile = data;
    }
    if (!profile && cleanEmail) {
      const { data } = await supabase.from('profiles').select('*').eq('email', cleanEmail).maybeSingle();
      profile = data;
    }

    let currentBalance = profile ? parseFloat(profile.usdt_balance || 0) : 0;
    const newBalance = currentBalance + depositAmount;

    // 2. Update user's USDT balance in Supabase
    if (profile) {
      await supabase
        .from('profiles')
        .update({
          usdt_balance: newBalance,
          last_updated: new Date().toISOString()
        })
        .eq('id', profile.id);
    }

    // 3. Record Deposit Transaction
    const hash = tx_hash || '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    try {
      await supabase.from('transactions').insert({
        user_id: profile ? profile.id : user_id,
        type: 'deposit',
        amount_usdt: depositAmount,
        amount_giga: 0,
        tx_hash: hash,
        status: 'completed',
        notes: `Deposited $${depositAmount.toFixed(2)} USDT via ${currency.toUpperCase()}`,
        created_at: new Date().toISOString()
      });
    } catch (txErr) {
      console.warn('Transaction log warning:', txErr.message);
    }

    // 4. Check Referral Bonus Condition ($30 or more deposit)
    let bonusAwarded = false;
    let referrerCode = profile?.referred_by || null;

    if (depositAmount >= 30 && referrerCode) {
      // Check if bonus was already given for this referred user
      const { data: refRow } = await supabase
        .from('referrals')
        .select('*')
        .eq('referred_email', profile ? profile.email : cleanEmail)
        .maybeSingle();

      const alreadyAwarded = refRow && refRow.bonus_awarded === true;

      if (!alreadyAwarded) {
        // Find Referrer by referral_code
        const { data: referrer } = await supabase
          .from('profiles')
          .select('*')
          .eq('referral_code', referrerCode)
          .maybeSingle();

        if (referrer) {
          const referrerNewUsdt = parseFloat(referrer.usdt_balance || 0) + 5.00;
          const referrerNewBonus = parseFloat(referrer.referral_bonus_earned || 0) + 5.00;

          // Credit $5.00 to Referrer's USDT balance (available for withdrawal!)
          await supabase
            .from('profiles')
            .update({
              usdt_balance: referrerNewUsdt,
              referral_bonus_earned: referrerNewBonus,
              last_updated: new Date().toISOString()
            })
            .eq('id', referrer.id);

          // Update referrals table
          await supabase
            .from('referrals')
            .upsert({
              referrer_code: referrerCode,
              referred_email: profile ? profile.email : cleanEmail,
              referred_username: profile?.username || null,
              deposit_amount: depositAmount,
              bonus_awarded: true,
              bonus_amount: 5.00,
              updated_at: new Date().toISOString()
            }, { onConflict: 'referred_email' });

          // Record bonus transaction for Referrer
          await supabase.from('transactions').insert({
            user_id: referrer.id,
            type: 'referral_bonus',
            amount_usdt: 5.00,
            amount_giga: 0,
            status: 'completed',
            notes: `Referral bonus ($5.00) from ${profile?.username || cleanEmail} deposit of $${depositAmount.toFixed(2)}`,
            created_at: new Date().toISOString()
          });

          bonusAwarded = true;
          console.log(`✅ $5.00 Referral bonus awarded to ${referrer.username} (${referrer.email})!`);
        }
      }
    }

    return res.status(200).json({
      success: true,
      deposit_amount: depositAmount,
      new_balance: newBalance,
      bonus_awarded: bonusAwarded,
      referrer_code: referrerCode
    });

  } catch (err) {
    console.error('process-deposit error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
