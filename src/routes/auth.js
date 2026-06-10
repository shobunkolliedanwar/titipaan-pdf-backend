import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../server.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
      throw new ApiError('Email and password required', 400);
    }

    // Check if user exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      throw new ApiError('Email already registered', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from('users')
      .insert([{
        email,
        password_hash: hashedPassword,
        full_name: full_name || email.split('@')[0],
        role: 'user',
        is_active: true
      }])
      .select()
      .single();

    if (error) throw error;

    const token = generateToken(user);

    res.status(201).json({
      message: 'Registration successful',
      user: { id: user.id, email: user.email, full_name: user.full_name },
      token
    });
  } catch (error) {
    next(error);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ApiError('Email and password required', 400);
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user || error) {
      throw new ApiError('Invalid email or password', 401);
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw new ApiError('Invalid email or password', 401);
    }

    if (!user.is_active) {
      throw new ApiError('Account is inactive', 401);
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      token
    });
  } catch (error) {
    next(error);
  }
});

export default router;
