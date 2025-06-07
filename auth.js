const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { check, validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD
    }
});

// Register route
router.get('/signup', (req, res) => {
    res.render('signup');
});

router.post('/signup', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
    check('confirmPassword', 'Passwords do not match').custom((value, { req }) => value === req.body.password),
    check('mobile', 'Mobile number must be 10 digits').isLength({ min: 10, max: 10 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('signup', { errors: errors.array() });
    }

    const { email, password, mobile } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.render('signup', { errors: [{ msg: 'User already exists' }] });
        }

        user = new User({ email, password, mobile });
        await user.save();

        res.redirect('/auth/login');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Login route
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('login', { errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.render('login', { errors: [{ msg: 'Invalid credentials' }] });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render('login', { errors: [{ msg: 'Invalid credentials' }] });
        }

        const payload = { user: { id: user.id } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.render('dashboard', { token });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// Forgot password
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password');
});

router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.render('forgot-password', { errors: [{ msg: 'User does not exist' }] });
        }

        const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Password Reset OTP',
            text: `Your OTP is ${otp}`
        };

        await transporter.sendMail(mailOptions);

        res.render('otp-verification', { email, otp });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;
