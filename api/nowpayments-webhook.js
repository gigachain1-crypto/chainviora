// api/nowpayments-webhook.js
// Handles Instant Payment Notifications (IPN / Webhooks) from NOWPayments
// Automatically credits user balance and logs completed deposit

const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-nowpayments-sig');

  // Handle health check / preflight
  if (req.method === 'OPTIONS' || req.method === 'GET') {
    return res.status(200).json({ status: 'active', gateway: 'NOWPayments IPN Webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('NOWPayments IPN received:', JSON.stringify(payload));

    if (!payload || !payload.payment_id) {
      return res.status(400).json({ error: 'Invalid payload: payment_id required' });
    }

    const paymentId = payload.payment_id;
    const paymentStatus = payload.payment_status; // 'waiting', 'confirming', 'confirmed', 'sending', 'finished', 'failed', 'expired'
    const actuallyPaid = parseFloat(payload.actually_paid || payload.price_amount || 0);
    const orderId = payload.order_id || '';
    const payAddress = payload.pay_address || '';
    const payCurrency = payload.pay_currency || 'usdtbsc';
    const txHash = payload.payin_hash || payload.payout_hash || ('0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''));

    // We only credit when payment is finished or confirmed
    if (paymentStatus !== 'finished' && paymentStatus !== 'confirmed' && paymentStatus !== 'sending') {
      console.log(`Payment ${paymentId} status is ${paymentStatus}. No credit action needed yet.`);
      return res.status(200).json({
        success: true,
        message: `Notification received for status: ${paymentStatus}`
      });
    }

    if (!SUPABASE_SERVICE_KEY) {
      console.warn('Supabase service key missing. Cannot update database.');
      return res.status(200).json({ success: true, note: 'Processed without DB sync' });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Check if this payment_id has already been credited to prevent duplicate credit
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('notes', `NOWPayments Deposit ID: ${paymentId}`)
      .maybeSingle();

    if (existingTx) {
      console.log(`Payment ${paymentId} was already credited in transaction ${existingTx.id}.`);
      return res.status(200).json({ success: true, message: 'Already credited' });
    }

    // 2. Find target user profile
    // Method A: From order_id format "dep_{user_id}_{curKey}_{timestamp}"
    let profile = null;

    if (orderId && orderId.startsWith('dep_')) {
      const parts = orderId.split('_');
      if (parts.length >= 2) {
        const potentialIdPrefix = parts[1];
        // Query profiles starting with this prefix or full ID
        const { data: matchedProfiles } = await supabase
          .from('profiles')
          .select('*')
          .ilike('id', `${potentialIdPrefix}%`)
          .limit(1);

        if (matchedProfiles && matchedProfiles.length > 0) {
          profile = matchedProfiles[0];
        }
      }
    }

    // Method B: Match by pay_address in profiles.deposit_addresses JSON
    if (!profile && payAddress) {
      const { data: matchedProfiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('deposit_address', payAddress)
        .limit(1);

      if (matchedProfiles && matchedProfiles.length > 0) {
        profile = matchedProfiles[0];
      }
    }

    if (!profile) {
      console.warn(`Could not locate user profile for payment ${paymentId}, address: ${payAddress}, order: ${orderId}`);
      // Record unassigned transaction for audit
      try {
        await supabase.from('transactions').insert({
          type: 'deposit',
          amount_usdt: actuallyPaid,
          amount_giga: 0,
          tx_hash: txHash,
          status: 'completed',
          notes: `NOWPayments Deposit ID: ${paymentId} (Unassigned - Address: ${payAddress})`,
          created_at: new Date().toISOString()
        });
      } catch (e) {}

      return res.status(200).json({ success: true, message: 'Logged unassigned' });
    }

    // 3. Credit user's USDT Balance in Supabase
    const curBalance = parseFloat(profile.usdt_balance || 0);
    const newBalance = curBalance + actuallyPaid;

    await supabase
      .from('profiles')
      .update({
        usdt_balance: newBalance,
        last_updated: new Date().toISOString()
      })
      .eq('id', profile.id);

    console.log(`Credited $${actuallyPaid} USDT to user ${profile.id} (${profile.email}). New balance: $${newBalance}`);

    // 4. Insert completed transaction
    await supabase.from('transactions').insert({
      user_id: profile.id,
      type: 'deposit',
      amount_usdt: actuallyPaid,
      amount_giga: 0,
      tx_hash: txHash,
      status: 'completed',
      notes: `NOWPayments Deposit ID: ${paymentId}`,
      created_at: new Date().toISOString()
    });

    // 5. Award $5 Referral bonus if deposit >= $30 and referred_by exists
    if (actuallyPaid >= 30 && profile.referred_by) {
      try {
        const { data: refRow } = await supabase
          .from('referrals')
          .select('*')
          .eq('referred_email', profile.email)
          .maybeSingle();

        if (!refRow || !refRow.bonus_awarded) {
          const { data: referrer } = await supabase
            .from('profiles')
            .select('*')
            .eq('referral_code', profile.referred_by)
            .maybeSingle();

          if (referrer) {
            const refCur = parseFloat(referrer.usdt_balance || 0);
            await supabase
              .from('profiles')
              .update({
                usdt_balance: refCur + 5.0,
                total_profit: parseFloat(referrer.total_profit || 0) + 5.0
              })
              .eq('id', referrer.id);

            await supabase.from('referrals').upsert({
              referrer_id: referrer.id,
              referred_id: profile.id,
              referred_email: profile.email,
              bonus_awarded: true,
              bonus_amount: 5.0,
              status: 'active',
              created_at: new Date().toISOString()
            }, { onConflict: 'referred_email' });

            console.log(`Awarded $5 referral bonus to referrer ${referrer.email}`);
          }
        }
      } catch (refErr) {
        console.warn('Referral bonus processing warning:', refErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      credited: true,
      user_id: profile.id,
      amount: actuallyPaid,
      payment_id: paymentId,
      tx_hash: txHash
    });

  } catch (err) {
    console.error('NOWPayments Webhook Error:', err);
    return res.status(500).json({ error: 'Webhook processing error', message: err.message });
  }
};
