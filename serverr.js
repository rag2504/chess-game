const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto'); // For secure token generation
require('dotenv').config(); // Load environment variables

const app = express();

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static files from the "public" folder
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/authSystem', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true },
    password: { type: String, required: true },
    otp: { type: String }, // Add field for OTP
    otpExpiration: { type: Date } // Add field for OTP expiration
});

// Create the User model
const User = mongoose.model('User', userSchema);

// Hardcoded Email Credentials
const EMAIL_USER = 'ragraichura@gmail.com'; 
const EMAIL_PASS = 'qgdn nzif cfnn vjax'; 

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    },
    debug: true,
    logger: true,
});
// Sign-up Route
app.post('/signup', async (req, res) => {
    const { email, mobile, password } = req.body;

    try {
        // Check if the email is already registered
        let user = await User.findOne({ email });
        if (user) return res.status(400).send('User already exists');

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        user = new User({
            email,
            mobile,
            password: hashedPassword
        });

        await user.save();
        res.send('User registered successfully!');
    } catch (error) {
        res.status(500).send('Error registering user: ' + error.message);
    }
});

// Login Route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found');

        // Compare the password with the hashed password in the database
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).send('Invalid credentials');

        res.send('Login successful!');
    } catch (error) {
        res.status(500).send('Error logging in: ' + error.message);
    }
});


// Forgot Password route
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found');

        // Generate a random 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString(); // Generate OTP
        user.otp = otp;
        user.otpExpiration = Date.now() + 300000; // OTP valid for 5 minutes

        await user.save();

        const mailOptions = {
    from: EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP',
    text: `Your OTP for password reset is: ${otp}` // Use backticks for template literal
};


        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', email);
        res.send('OTP sent to your email!');
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).send('Error sending email: ' + error.message);
    }
});

// Verify OTP route
app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await User.findOne({ email, otp, otpExpiration: { $gt: Date.now() } });
        if (!user) return res.status(400).send('Invalid or expired OTP.');

        res.send('OTP verified! You can now reset your password.');
    } catch (error) {
        res.status(500).send('Error verifying OTP: ' + error.message);
    }
});

// Password Reset route
app.post('/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found.');

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.otp = undefined; // Clear OTP
        user.otpExpiration = undefined; // Clear expiration

        await user.save();
        res.send('Password has been reset successfully!');
    } catch (error) {
        res.status(500).send('Error resetting password: ' + error.message);
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

});