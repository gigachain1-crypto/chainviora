// api/get-referrals.js
// Fetches the full list of users referred by a user's referral code with username, email, and deposit/bonus status

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const code = req.query?.ref_code || req.body?.ref_code || '';
    if (!code) {
      return res.status(400).json({ error: 'ref_code is required' });
    }

    const cleanRef = code.trim().toUpperCase().slice(0, 6);

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY || 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY'
    );

    // 1. Fetch from referrals table
    let refList = [];
    try {
      const { data: rows } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_code', cleanRef)
        .order('created_at', { ascending: false });
      if (rows) refList = rows;
    } catch (e) { }

    // 2. Fetch from profiles table where referred_by = cleanRef (cross-verify)
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username, email, usdt_balance, created_at')
        .eq('referred_by', cleanRef);

      if (profiles && profiles.length > 0) {
        profiles.forEach(p => {
          const userBal = parseFloat(p.usdt_balance || 0);
          const isQual = userBal >= 30;
          const exists = refList.find(r => r.referred_email?.toLowerCase() === p.email?.toLowerCase());
          if (exists) {
            exists.deposit_amount = Math.max(parseFloat(exists.deposit_amount || 0), userBal);
            if (isQual) {
              exists.bonus_awarded = true;
              exists.bonus_amount = 5.00;
            }
          } else {
            refList.push({
              referrer_code: cleanRef,
              referred_email: p.email,
              referred_username: p.username,
              deposit_amount: userBal,
              bonus_awarded: isQual,
              bonus_amount: isQual ? 5.00 : 0.00,
              created_at: p.created_at
            });
          }
        });
      }
    } catch (e) { }

    let totalEarned = 0;
    const formatted = refList.map(item => {
      const deposited = parseFloat(item.deposit_amount || 0) >= 30 || item.bonus_awarded === true;
      if (deposited) totalEarned += 5.00;

      return {
        username: item.referred_username || 'Member',
        email: item.referred_email,
        date: item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent',
        deposit_amount: parseFloat(item.deposit_amount || 0),
        bonus_awarded: deposited,
        bonus_amount: deposited ? 5.00 : 0.00,
        status: deposited ? 'Qualified ($5 Bonus Earned)' : 'Pending Deposit ($30+ needed)'
      };
    });

    return res.status(200).json({
      success: true,
      referrer_code: cleanRef,
      referrals: formatted,
      total_invited: formatted.length,
      total_earned: totalEarned
    });

  } catch (err) {
    console.error('get-referrals error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
