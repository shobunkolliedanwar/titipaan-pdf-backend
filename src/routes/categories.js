import express from 'express';
import { supabase } from '../server.js';

const router = express.Router();

// Get all categories
router.get('/', async (req, res, next) => {
  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// Get category with subcategories
router.get('/:id', async (req, res, next) => {
  try {
    const { data: category, error } = await supabase
      .from('categories')
      .select(`
        *,
        subcategories(*)
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json(category);
  } catch (error) {
    next(error);
  }
});

export default router;
