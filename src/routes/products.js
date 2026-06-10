import express from 'express';
import { supabase } from '../server.js';

const router = express.Router();

// Get all products with filters
router.get('/', async (req, res, next) => {
  try {
    const { category_id, subcategory_id, search } = req.query;

    let query = supabase
      .from('products')
      .select(`
        *,
        category:categories(name),
        subcategory:subcategories(name)
      `)
      .eq('is_active', true);

    if (category_id) {
      query = query.eq('category_id', category_id);
    }

    if (subcategory_id) {
      query = query.eq('subcategory_id', subcategory_id);
    }

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }

    const { data: products, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json(products);
  } catch (error) {
    next(error);
  }
});

// Get single product
router.get('/:id', async (req, res, next) => {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select(`
        *,
        category:categories(name),
        subcategory:subcategories(name)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json(product);
  } catch (error) {
    next(error);
  }
});

export default router;
