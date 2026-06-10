import express from 'express';
import { supabase } from '../server.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = express.Router();

// Get user profile
router.get('/profile', async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, created_at')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Get user's purchases
router.get('/purchases', async (req, res, next) => {
  try {
    const { data: purchases, error } = await supabase
      .from('purchases')
      .select(`
        *,
        product:products(id, title, price, file_url, category:categories(name), subcategory:subcategories(name))
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(purchases);
  } catch (error) {
    next(error);
  }
});

// Get purchase details
router.get('/purchases/:id', async (req, res, next) => {
  try {
    const { data: purchase, error } = await supabase
      .from('purchases')
      .select(`
        *,
        product:products(*)
      `)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !purchase) {
      throw new ApiError('Purchase not found', 404);
    }

    res.json(purchase);
  } catch (error) {
    next(error);
  }
});

export default router;
