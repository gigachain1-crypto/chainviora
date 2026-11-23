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

    const currentUsdt = buyer ? parseFloat(buyer.usdt_balance || 0) : 0;
    if (buyer && currentUsdt < cost) {
      return res.status(400).json({
        error: `Insufficient balance! You have $${currentUsdt.toFixed(2)}, but need $30.00 to buy 1 GIGA.`
      });
    }

    // 🔒 Double-click / rapid purchase debounce guard: reject calls within 2 seconds
    if (buyer && buyer.last_updated) {
      const diffMs = Date.now() - new Date(buyer.last_updated).getTime();
      if (diffMs > 0 && diffMs < 2000) {
        return res.status(429).json({
          error: 'Purchase in progress. Please wait a moment before trying again.'
        });
      }
    }

    // 2. Prepare new pending sell order for this buyer
    const updatedUsdt = Math.max(0, currentUsdt - cost);
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

    // 4. Update Buyer: Deduct $30 USDT and add new Pending Sell Order
    if (buyer) {
      const buyerMap = (buyer.deposit_addresses && typeof buyer.deposit_addresses === 'object') ? buyer.deposit_addresses : {};
      const buyerSync = buyerMap.sync_state || {};
      const existingPending = Array.isArray(buyerSync.pending_sells) ? buyerSync.pending_sells : [];
      const updatedPending = [newPendingOrder, ...existingPending];

      const existingActivities = Array.isArray(buyerSync.activities) ? buyerSync.activities : [];
      const buyActivity = {
        id: 'buy_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        time: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        type: 'Buy GIGA',
        asset: '1 GIGA ($30.00)',
        amount: '-$30.00 USDT',
        status: 'Completed',
        notes: `Bought 1 GIGA ($30.00) — Placed in Sell Queue (${sellCode})`,
        rawAmount: 30.00,
        orderId: sellCode
      };
      const updatedActivities = [buyActivity, ...existingActivities].slice(0, 50);

      const updatedSync = {
        ...buyerSync,
        usdt_balance: updatedUsdt,
        giga_balance: (parseInt(buyerSync.giga_balance || 0, 10)) + 1,
        total_giga_bought: (parseInt(buyerSync.total_giga_bought || 0, 10)) + 1,
        pending_sells: updatedPending,
        activities: updatedActivities
      };

      await supabase
        .from('profiles')
        .update({
          usdt_balance: updatedUsdt,
          giga_balance: (parseInt(buyer.giga_balance || 0, 10)) + 1,
          balance_giga: (parseInt(buyer.giga_balance || 0, 10)) + 1,
          deposit_addresses: {
            ...buyerMap,
            sync_state: updatedSync
          },
          last_updated: new Date().toISOString()
        })
        .eq('id', buyer.id);

      // Record transaction
      try {
        const buyerTxHash = '0x' + crypto.randomBytes(32).toString('hex');
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
