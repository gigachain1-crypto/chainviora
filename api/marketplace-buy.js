// api/marketplace-buy.js
// Handles GIGA purchase ($30), 2-buyer matching logic, and Supabase database persistence

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bhcddgzlzyzovecccmrj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user_id, email, username, background_order_id } = req.body;

    const cleanEmail = email ? email.trim().toLowerCase() : null;
    const cleanUsername = username ? username.trim() : 'GIGA Member';
    const bgOrderId = background_order_id || `GIGA-ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const sellCode = `#SELL-${Math.floor(100000 + Math.random() * 900000)}`;
    const cost = 30.00;

    // Fallback if Supabase service key is not set in local dev
    if (!SUPABASE_SERVICE_KEY) {
      return res.status(200).json({
        success: true,
        note: 'Saved locally',
        order_id: bgOrderId,
        sell_order_code: sellCode,
        matched_buyers: 0,
        required_buyers: 2,
        status: 'pending'
      });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Fetch current buyer profile
    let buyer = null;
    if (user_id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user_id).maybeSingle();
      buyer = data;
    }
    if (!buyer && cleanEmail) {
      const { data } = await supabase.from('profiles').select('*').eq('email', cleanEmail).maybeSingle();
      buyer = data;
    }

    const currentUsdt = buyer ? parseFloat(buyer.usdt_balance || 0) : 0;
    if (buyer && currentUsdt < cost) {
      return res.status(400).json({
        error: `Insufficient balance! You have $${currentUsdt.toFixed(2)}, but need $30.00 to buy 1 GIGA.`
      });
    }

    // 2. Deduct $30 from buyer's USDT balance
    const updatedUsdt = Math.max(0, currentUsdt - cost);
    if (buyer) {
      await supabase
        .from('profiles')
        .update({
          usdt_balance: updatedUsdt,
          last_updated: new Date().toISOString()
        })
        .eq('id', buyer.id);
    }

    // 3. Matchmaker Engine: Find oldest pending order with matched_buyers < 2
    let matchedSellerOrder = null;
    let sellerCompleted = false;

    try {
      // Find oldest pending order
      const { data: pendingOrders } = await supabase
        .from('marketplace_orders')
        .select('*')
        .eq('status', 'pending')
        .lt('matched_buyers', 2)
        .order('created_at', { ascending: true })
        .limit(5);

      if (pendingOrders && pendingOrders.length > 0) {
        // Prefer matching orders from other sellers first
        let target = pendingOrders.find(o => o.seller_id !== (buyer ? buyer.id : null) && o.seller_email !== cleanEmail);
        if (!target) target = pendingOrders[0]; // fallback to any pending order for solo testing

        if (target) {
          const newMatched = (target.matched_buyers || 0) + 1;
          const isComplete = newMatched >= 2;
          const existingBuyers = Array.isArray(target.buyer_ids) ? target.buyer_ids : [];
          existingBuyers.push({
            buyer_id: buyer ? buyer.id : null,
            email: cleanEmail,
            bought_at: new Date().toISOString()
          });

          const updatePayload = {
            matched_buyers: newMatched,
            buyer_ids: existingBuyers,
            status: isComplete ? 'completed' : 'pending'
          };
          if (isComplete) {
            updatePayload.completed_at = new Date().toISOString();
          }

          await supabase
            .from('marketplace_orders')
            .update(updatePayload)
            .eq('id', target.id);

          matchedSellerOrder = target;
          sellerCompleted = isComplete;

          // If 2nd buyer matched -> Seller gets +$50.00 Profit!
          if (isComplete) {
            let sellerProfile = null;
            if (target.seller_id) {
              const { data: sp } = await supabase.from('profiles').select('*').eq('id', target.seller_id).maybeSingle();
              sellerProfile = sp;
            }
            if (!sellerProfile && target.seller_email) {
              const { data: sp } = await supabase.from('profiles').select('*').eq('email', target.seller_email).maybeSingle();
              sellerProfile = sp;
            }

            if (sellerProfile) {
              const newSellerUsdt = parseFloat(sellerProfile.usdt_balance || 0) + 50.00;
              const newSellerProfit = parseFloat(sellerProfile.lifetime_profit || 0) + 50.00;

              await supabase
                .from('profiles')
                .update({
                  usdt_balance: newSellerUsdt,
                  lifetime_profit: newSellerProfit,
                  last_updated: new Date().toISOString()
                })
                .eq('id', sellerProfile.id);

              // Record sell_complete transaction for seller
              await supabase.from('transactions').insert({
                user_id: sellerProfile.id,
                type: 'sell_complete',
                amount_usdt: 50.00,
                amount_giga: 1.0000,
                order_id: target.sell_order_code || target.order_id,
                status: 'completed',
                notes: 'Sell completed (2 of 2 buyers matched) — +$50.00 profit credited'
              });
            }
          }
        }
      }
    } catch (matchingErr) {
      console.warn('Marketplace matching error (non-fatal):', matchingErr.message);
    }

    // 4. Create new pending sell order for this buyer in marketplace_orders
    const newOrderData = {
      order_id: bgOrderId,
      sell_order_code: sellCode,
      seller_id: buyer ? buyer.id : null,
      seller_email: cleanEmail || 'guest@example.com',
      seller_username: cleanUsername,
      amount: 1.0000,
      unit_price: 30.00,
      profit_amount: 50.00,
      matched_buyers: 0,
      required_buyers: 2,
      buyer_ids: [],
      status: 'pending'
    };

    try {
      await supabase.from('marketplace_orders').insert(newOrderData);
    } catch (orderInsertErr) {
      console.warn('marketplace_orders insert failed (table may need schema run):', orderInsertErr.message);
    }

    // 5. Record buy transaction in transactions table
    if (buyer) {
      try {
        await supabase.from('transactions').insert({
          user_id: buyer.id,
          type: 'buy_giga',
          amount_usdt: 30.00,
          amount_giga: 1.0000,
          order_id: sellCode,
          status: 'completed',
          notes: `Bought 1 GIGA ($30.00) — placed in sell queue (${sellCode})`
        });
      } catch (txErr) {
        console.warn('buy_giga transaction record error:', txErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      new_usdt_balance: updatedUsdt,
      order: newOrderData,
      matched_seller: matchedSellerOrder ? {
        sell_order_code: matchedSellerOrder.sell_order_code,
        completed: sellerCompleted
      } : null
    });

  } catch (err) {
    console.error('Marketplace buy error:', err);
    return res.status(500).json({ error: err.message || 'Server error processing GIGA buy' });
  }
};
