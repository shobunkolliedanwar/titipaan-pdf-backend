import express from 'express';
import { supabase } from '../server.js';
import { verifyRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = express.Router();

// Verify admin
router.use(verifyRole(['admin']));

// Categories Management
router.post('/categories', async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const { data: category, error } = await supabase
      .from('categories')
      .insert([{ name, description, is_active: true }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

// Subcategories Management
router.post('/subcategories', async (req, res, next) => {
  try {
    const { category_id, name, description } = req.body;

    const { data: subcategory, error } = await supabase
      .from('subcategories')
      .insert([{ category_id, name, description, is_active: true }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(subcategory);
  } catch (error) {
    next(error);
  }
});

// Products Management
router.post('/products', async (req, res, next) => {
  try {
    const {
      category_id,
      subcategory_id,
      title,
      description,
      price,
      file_url,
      thumbnail_url
    } = req.body;

    const { data: product, error } = await supabase
      .from('products')
      .insert([{
        category_id,
        subcategory_id,
        title,
        description,
        price,
        file_url,
        thumbnail_url,
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

// Update product
router.put('/products/:id', async (req, res, next) => {
  try {
    const {
      title,
      description,
      price,
      file_url,
      thumbnail_url,
      is_active
    } = req.body;

    const { data: product, error } = await supabase
      .from('products')
      .update({
        title,
        description,
        price,
        file_url,
        thumbnail_url,
        is_active
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Delete product
router.delete('/products/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
});

// Dashboard stats
router.get('/dashboard/stats', async (req, res, next) => {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user');

    // Total products
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    // Total revenue
    const { data: revenueData } = await supabase
      .from('transactions')
      .select('amount')
      .eq('status', 'paid');

    const totalRevenue = revenueData?.reduce((sum, t) => sum + t.amount, 0) || 0;

    // Recent transactions
    const { data: recentTransactions } = await supabase
      .from('transactions')
      .select(`
        id,
        amount,
        status,
        created_at,
        product:products(title),
        user:users(email)
      `)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      totalUsers: totalUsers || 0,
      totalProducts: totalProducts || 0,
      totalRevenue,
      recentTransactions: recentTransactions || []
    });
  } catch (error) {
    next(error);
  }
});

export default router;
