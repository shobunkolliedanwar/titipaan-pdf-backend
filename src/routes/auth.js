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
      throw new ApiError('Email dan password wajib diisi', 400);
    }

    // Validasi Gmail
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      throw new ApiError('Hanya email Gmail yang diperbolehkan', 400);
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name
        },
        emailRedirectTo: `${process.env.FRONTEND_URL}/auth/callback`
      }
    });

    if (error) {
      throw new ApiError(error.message, 400);
    }

    res.status(201).json({
      message:
        'Registrasi berhasil. Silakan cek Gmail Anda untuk verifikasi email.'
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
      .insert([{
        email,
        password_hash: hashedPassword,
        full_name: full_name || email.split('@')[0],
        role: 'user',
        is_active: false,
        verification_token: crypto.randomBytes(32).toString('hex')
      }])
      .select()
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

router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('verification_token', token)
      .single();

    if (!user) {
      throw new ApiError('Token tidak valid', 400);
    }

    await supabase
      .from('users')
      .update({
        is_active: true,
        verification_token: null
      })
      .eq('id', user.id);

    res.json({
      message: 'Email berhasil diverifikasi'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
