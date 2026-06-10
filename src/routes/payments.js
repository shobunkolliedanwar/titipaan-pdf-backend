import express from 'express';
import { supabase } from '../server.js';
import { verifyToken } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import midtransClient from 'midtrans-client'
import crypto from 'crypto'

const router = express.Router();

const snap = new midtransClient.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// Create payment
router.post('/create', verifyToken, async (req, res, next) => {
  try {
    const { product_id, quantity = 1 } = req.body;
    const userId = req.user.id;

    // 1. Get product
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      throw new ApiError('Product not found', 404);
    }

    // 2. SAFE TYPE CONVERSION (IMPORTANT FIX)
    const price = parseInt(product.price, 10);
    const qty = parseInt(quantity, 10);

    if (!price || !qty) {
      throw new ApiError('Invalid price or quantity', 400);
    }

    const amount = price * qty;

    // 3. Stable order ID (anti duplicate + safer format)
    const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    // 4. Save transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert([
        {
          user_id: userId,
          product_id,
          order_id: orderId,
          amount,
          quantity: qty,
          status: 'pending',
          payment_method: 'midtrans'
        }
      ])
      .select()
      .single();

    if (transactionError) throw transactionError;

    // 5. Midtrans parameter (STRICT FORMAT)
    const parameter = {
      transaction_details: {
        order_id: orderId,
        gross_amount: amount
      },
      item_details: [
        {
          id: product.id,
          price: price,
          quantity: qty,
          name: (product.title || 'Product').substring(0, 50)
        }
      ],
      customer_details: {
        email: req.user.email,
        first_name: req.user.full_name || 'User'
      }
    };

    console.log("MIDTRANS PARAMETER:", JSON.stringify(parameter, null, 2));

    // 6. Create transaction Midtrans
    const transactionMidtrans = await snap.createTransaction(parameter);

    console.log("MIDTRANS RESPONSE:", transactionMidtrans);

    if (!transactionMidtrans?.token) {
      throw new ApiError('Failed to create Midtrans transaction', 500);
    }

    // 7. Response
    res.json({
      transaction_id: transaction.id,
      order_id: orderId,
      snap_token: transactionMidtrans.token,
      redirect_url: transactionMidtrans.redirect_url,
      gross_amount: amount
    });

  } catch (error) {
    next(error);
  }
});

// Verify payment
router.post('/verify', async (req, res, next) => {
  try {
    const { order_id } = req.body;

    // Get transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('order_id', order_id)
      .single();

    if (transactionError || !transaction) {
      throw new ApiError('Transaction not found', 404);
    }

    // In production, verify with Midtrans
    // For now, mark as paid
    const { data: updated, error: updateError } = await supabase
      .from('transactions')
      .update({
        status: 'paid',
        paid_at: new Date()
      })
      .eq('id', transaction.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create purchase record
    await supabase
      .from('purchases')
      .insert([{
        user_id: transaction.user_id,
        product_id: transaction.product_id,
        transaction_id: transaction.id
      }]);

    res.json({ message: 'Payment verified', transaction: updated });
  } catch (error) {
    next(error);
  }
});

// Get user's transactions
router.get('/my-transactions', verifyToken, async (req, res, next) => {
  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        product:products(title, price)
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(transactions);
  } catch (error) {
    next(error);
  }
});

router.post('/notification', async (req, res, next) => {
  try {
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status
    } = req.body

    // Validasi signature Midtrans
    const serverKey = process.env.MIDTRANS_SERVER_KEY

    const hash = crypto
      .createHash('sha512')
      .update(
        order_id +
        status_code +
        gross_amount +
        serverKey
      )
      .digest('hex')

    if (hash !== signature_key) {
      return res.status(403).json({
        message: 'Invalid signature'
      })
    }

    // Cari transaksi
    const { data: transaction } = await supabase
      .from('transactions')
      .select('*')
      .eq('order_id', order_id)
      .single()

    if (!transaction) {
      return res.status(404).json({
        message: 'Transaction not found'
      })
    }

    // Settlement = sukses bayar
    if (
      transaction_status === 'settlement' ||
      (transaction_status === 'capture' &&
        fraud_status === 'accept')
    ) {
      await supabase
        .from('transactions')
        .update({
          status: 'paid',
          paid_at: new Date()
        })
        .eq('id', transaction.id)

      // Cegah duplicate purchase
      const { data: purchase } = await supabase
        .from('purchases')
        .select('id')
        .eq('transaction_id', transaction.id)
        .maybeSingle()

      if (!purchase) {
        await supabase
          .from('purchases')
          .insert([
            {
              user_id: transaction.user_id,
              product_id: transaction.product_id,
              transaction_id: transaction.id
            }
          ])
      }
    }

    // Expired
    if (
      transaction_status === 'expire' ||
      transaction_status === 'cancel'
    ) {
      await supabase
        .from('transactions')
        .update({
          status: 'expired'
        })
        .eq('id', transaction.id)
    }

    res.status(200).json({
      success: true
    })
  } catch (error) {
    next(error)
  }
})

export default router;
