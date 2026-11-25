// api/marketplace-buy.js
// Handles GIGA purchase ($30), 2-buyer matching logic, and Supabase database persistence
// Strictly updates seller and buyer cross-device sync_state in Supabase

const crypto = require('crypto');
const { applySecurityMiddleware } = require('./_security');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_HwMEDaihTWj54hP1s90VDA_ndMsJnJY';

module.exports = async (req, res) => {
  // 🔒 Security: 10 buy requests per minute per IP
  const proceed = await applySecurityMiddleware(req, res, {
    endpoint: 'marketplace-buy',
    rateLimit: { max: 10, windowMs: 60 * 1000 }
  });
  if (!proceed) return;

  try {
    const { user_id, email, username, background_order_id } = req.body || {};

    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const cleanUsername = username ? username.trim() : 'GIGA Member';
    const bgOrderId = background_order_id || `GIGA-ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const sellCode = `#SELL-${Math.floor(100000 + Math.random() * 900000)}`;
    const cost = 30.00;

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY
    );

    // 1. Fetch current buyer profile
    let buyer = null;
    if (user_id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user_id).maybeSingle();
      buyer = data;
    }
    if (!buyer && cleanEmail) {
      const { data } = await supabase.from('profiles').select('*').ilike('email', cleanEmail).maybeSingle();
      buyer = data;
    }

    if (!buyer) {
      return res.status(404).json({
        error: 'User profile not found. Please log out and log back in.'
      });
    }

    const currentUsdt = parseFloat(buyer.usdt_balance || 0);
    if (currentUsdt < cost) {
      return res.status(400).json({
        error: `Insufficient balance! You have $${currentUsdt.toFixed(2)}, but need $30.00 to buy 1 GIGA.`
      });
    }

    // 🔒 Double-click / rapid purchase debounce guard: reject calls within 3 seconds of last GIGA buy
    const existingBuyerMap = (buyer.deposit_addresses && typeof buyer.deposit_addresses === 'object') ? buyer.deposit_addresses : {};
    const existingBuyerSync = existingBuyerMap.sync_state || {};
    if (existingBuyerSync.last_buy_at) {
      const diffMs = Date.now() - new Date(existingBuyerSync.last_buy_at).getTime();
      if (diffMs >= 0 && diffMs < 3000) {
        return res.status(429).json({
          error: 'Purchase in progress. Please wait a moment before trying again.'
        });
      }
    }

    // 🔒 ATOMIC BALANCE LOCK: Deduct $30 ONLY if DB usdt_balance >= $30 right now
    // Prevents concurrent requests or double-clicks from ever buying 2 GIGA with $30
    const updatedUsdt = Math.max(0, parseFloat((currentUsdt - cost).toFixed(2)));
    const buyTimestampIso = new Date().toISOString();
    const { data: lockedRows, error: lockErr } = await supabase
      .from('profiles')
      .update({
        usdt_balance: updatedUsdt,
        balance_usdt: updatedUsdt,
        last_updated: buyTimestampIso
      })
      .eq('id', buyer.id)
      .gte('usdt_balance', cost)
      .select('*');

    if (lockErr || !lockedRows || lockedRows.length === 0) {
      return res.status(400).json({
        error: 'Insufficient USDT balance or concurrent purchase already processed.'
      });
    }
    buyer = lockedRows[0];
    const newPendingOrder = {
      orderId: sellCode,
      backgroundOrderId: bgOrderId,
      amount: 1,
      price: cost,
      profit: 50.00,
      matchedBuyers: 0,
      requiredBuyers: 3,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Pending',
      created_at: new Date().toISOString()
    };

    // 3. Matchmaker Engine: Find pending order from ANOTHER seller in profiles
    let matchedSellerOrder = null;
    let sellerCompleted = false;

    try {
      const buyerId = buyer ? buyer.id : '00000000-0000-0000-0000-000000000000';
      const { data: otherProfiles } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', buyerId)
        .limit(50);

      if (otherProfiles && Array.isArray(otherProfiles)) {
        for (const seller of otherProfiles) {
          if (cleanEmail && seller.email && seller.email.toLowerCase() === cleanEmail) continue;

          const sMap = (seller.deposit_addresses && typeof seller.deposit_addresses === 'object') ? seller.deposit_addresses : {};
          const sSync = sMap.sync_state || {};
          const sPending = Array.isArray(sSync.pending_sells) ? sSync.pending_sells : [];

          const targetOrder = sPending.find(item => item.status === 'Pending' && (item.matchedBuyers || 0) < 3);
          if (targetOrder) {
            targetOrder.matchedBuyers = (targetOrder.matchedBuyers || 0) + 1;
            const isComplete = targetOrder.matchedBuyers >= 3;
            if (isComplete) {
              targetOrder.status = 'Completed';
              targetOrder.completedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            const sellerUsdt = parseFloat(seller.usdt_balance || 0);
            const sellerProfit = parseFloat(seller.lifetime_profit || 0);
            const newSellerUsdt = isComplete ? sellerUsdt + 50.00 : sellerUsdt;
            const newSellerProfit = isComplete ? sellerProfit + 50.00 : sellerProfit;
            const newSellerSold = isComplete ? (parseInt(sSync.total_giga_sold || 0, 10) + 1) : (parseInt(sSync.total_giga_sold || 0, 10));

            const sActivities = Array.isArray(sSync.activities) ? [...sSync.activities] : [];
            if (isComplete) {
              sActivities.unshift({
                id: 'profit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                time: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                type: 'Sell Profit',
                asset: 'USDT',
                amount: '+$50.00 USDT',
                status: 'Completed',
                notes: `Sell Queue ${targetOrder.orderId} completed (3 buyers matched) — +$50.00 Profit credited`,
                rawAmount: 50.00,
                orderId: targetOrder.orderId
              });
            }

            const updatedSellerSync = {
              ...sSync,
              usdt_balance: newSellerUsdt,
              lifetime_profit: newSellerProfit,
              total_giga_sold: newSellerSold,
              pending_sells: sPending,
              activities: sActivities.slice(0, 50)
            };

            await supabase
              .from('profiles')
              .update({
                usdt_balance: newSellerUsdt,
                lifetime_profit: newSellerProfit,
                deposit_addresses: {
                  ...sMap,
                  sync_state: updatedSellerSync
                },
                last_updated: new Date().toISOString()
              })
              .eq('id', seller.id);

            if (isComplete) {
              try {
                const sellerTxHash = '0x' + crypto.randomBytes(32).toString('hex');
                await supabase.from('transactions').insert({
                  user_id: seller.id,
                  type: 'sell_giga',
                  amount_usdt: 50.00,
                  amount_giga: 1.0000,
                  tx_hash: sellerTxHash,
                  order_id: targetOrder.orderId,
                  status: 'completed',
                  notes: `Sell completed (3 of 3 buyers matched) — +$50.00 profit credited`,
                  created_at: new Date().toISOString()
                });
              } catch (e) { }
            }

            matchedSellerOrder = targetOrder;
            sellerCompleted = isComplete;
            break; // Matched 1 pending order from oldest seller
          }
        }
      }
    } catch (matchingErr) {
      console.warn('Marketplace matching error (non-fatal):', matchingErr.message);
    }

    // 4. Update Buyer: Save new Pending Sell Order & Activity (USDT balance already atomically deducted above)
    let buyerTxHash = null;
    let buyActivity = null;
    let newGigaBalance = parseInt(buyer.giga_balance || 0, 10) + 1;

    if (buyer) {
      buyerTxHash = '0x' + crypto.randomBytes(32).toString('hex');
      const buyerMap = (buyer.deposit_addresses && typeof buyer.deposit_addresses === 'object') ? buyer.deposit_addresses : {};
      const buyerSync = buyerMap.sync_state || {};
      const existingPending = Array.isArray(buyerSync.pending_sells) ? buyerSync.pending_sells : [];
      const updatedPending = [newPendingOrder, ...existingPending];
      const newTotalBought = Math.max((parseInt(buyerSync.total_giga_bought || 0, 10)) + 1, newGigaBalance);

      const existingActivities = Array.isArray(buyerSync.activities) ? buyerSync.activities : [];
      buyActivity = {
        id: 'buy_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        time: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        isoTime: new Date().toISOString(),
        type: 'Buy GIGA',
        asset: '1 GIGA ($30.00)',
        amount: '-$30.00 USDT',
        status: 'Completed',
        txHash: buyerTxHash,
        notes: `Bought 1 GIGA ($30.00) — Placed in Sell Queue (${sellCode})`,
        rawAmount: 30.00,
        orderId: sellCode
      };
      const updatedActivities = [buyActivity, ...existingActivities].slice(0, 50);

      const updatedSync = {
        ...buyerSync,
        usdt_balance: updatedUsdt,
        giga_balance: newGigaBalance,
        total_giga_bought: newTotalBought,
        last_buy_at: buyTimestampIso,
        pending_sells: updatedPending,
        activities: updatedActivities
      };

      await supabase
        .from('profiles')
        .update({
          usdt_balance: updatedUsdt,
          balance_usdt: updatedUsdt,
          giga_balance: newGigaBalance,
          balance_giga: newGigaBalance,
          deposit_addresses: {
            ...buyerMap,
            sync_state: updatedSync
          },
          last_updated: new Date().toISOString()
        })
        .eq('id', buyer.id);

      // Record transaction once on server
      try {
        await supabase.from('transactions').insert({
          user_id: buyer.id,
          type: 'buy_giga',
          amount_usdt: 30.00,
          amount_giga: 1.0000,
          tx_hash: buyerTxHash,
          order_id: sellCode,
          status: 'completed',
          notes: `Bought 1 GIGA ($30.00) — placed in sell queue (${sellCode})`,
          created_at: new Date().toISOString()
        });
      } catch (txErr) {
        console.warn('buy_giga transaction record error:', txErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      new_usdt_balance: updatedUsdt,
      new_giga_balance: newGigaBalance,
      tx_hash: buyerTxHash,
      activity: buyActivity,
      order: newPendingOrder,
      matched_seller: matchedSellerOrder ? {
        orderId: matchedSellerOrder.orderId,
        completed: sellerCompleted
      } : null
    });

  } catch (err) {
    console.error('Marketplace buy error:', err);
    return res.status(500).json({ error: err.message || 'Server error processing GIGA buy' });
  }
};
