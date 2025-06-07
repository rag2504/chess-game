// === Final server.js with Socket.IO for Real-Time Chess and chess rules enforcement ===

const express = require('express');
const http = require('http');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect('mongodb+srv://rag123456:rag123456@cluster0.qipvo.mongodb.net/authSystem', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

    
// Schemas
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true },
    password: { type: String, required: true },
    otp: { type: String },
    otpExpiration: { type: Date }
});

const requestSchema = new mongoose.Schema({
    from: String,
    to: String,
    createdAt: { type: Date, default: Date.now }
});

const gameSchema = new mongoose.Schema({
    playerWhite: String,
    playerBlack: String,
    fen: { type: String, default: "start" },
    moves: [String],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Request = mongoose.model('Request', requestSchema);
const Game = mongoose.model('Game', gameSchema);

// Email
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

// === AUTH & USER ROUTES ===

app.post('/signup', async (req, res) => {
    const { email, mobile, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).send('User already exists');
        const hashedPassword = await bcrypt.hash(password, 10);
        user = new User({ email, mobile, password: hashedPassword });
        await user.save();
        res.send('User registered successfully!');
    } catch (error) {
        res.status(500).send('Error registering user: ' + error.message);
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ success: false, message: 'User not found' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });
        return res.json({
            success: true,
            mobile: user.mobile,
            message: 'Login successful!'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error logging in: ' + error.message });
    }
});

app.get('/api/players', async (req, res) => {
    const currentMobile = req.query.mobile;
    try {
        const users = await User.find(currentMobile ? { mobile: { $ne: currentMobile } } : {}, { mobile: 1, _id: 0 });
        res.json({ players: users.map(u => u.mobile) });
    } catch (error) {
        res.status(500).json({ message: 'Error loading players' });
    }
});

// === CHESS GAME ROUTES ===

app.post('/api/send-request', async (req, res) => {
    const { from, to } = req.body;
    if (!from || !to) return res.status(400).json({ message: 'Missing data' });
    try {
        const reqObj = await Request.create({ from, to });
        res.json({ success: true, requestId: reqObj._id, createdAt: reqObj.createdAt });
    } catch (error) {
        res.status(500).json({ message: 'Error sending request' });
    }
});

app.get('/api/incoming-requests', async (req, res) => {
    const to = req.query.mobile;
    if (!to) return res.status(400).json({ message: 'Missing mobile' });
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    try {
        const requests = await Request.find({
            to,
            createdAt: { $gte: fiveMinsAgo }
        }).sort({ createdAt: -1 });
        res.json({ requests });
    } catch (error) {
        res.status(500).json({ message: 'Error loading requests' });
    }
});

app.post('/api/request-action', async (req, res) => {
    const { requestId, action } = req.body;
    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (action === "accept") {
        const [white, black] = Math.random() > 0.5
            ? [request.from, request.to]
            : [request.to, request.from];
        const game = await Game.create({ playerWhite: white, playerBlack: black, fen: "start", moves: [] });
        await Request.deleteOne({ _id: requestId });
        return res.json({ gameId: game._id, createdAt: game.createdAt });
    } else if (action === "decline") {
        await Request.deleteOne({ _id: requestId });
        return res.json({ success: true });
    } else {
        return res.status(400).json({ message: "Invalid action" });
    }
});

app.get('/api/my-active-game', async (req, res) => {
    const mobile = req.query.mobile;
    const lastRequestTime = req.query.lastRequestTime;
    if (!mobile || !lastRequestTime) return res.json({ gameId: null });
    const lastReqDate = new Date(lastRequestTime);
    const game = await Game.findOne({
        $or: [
            { playerWhite: mobile },
            { playerBlack: mobile }
        ],
        createdAt: { $gt: lastReqDate }
    }).sort({ createdAt: -1 });
    if (game) {
        return res.json({ gameId: game._id });
    }
    res.json({ gameId: null });
});

app.get('/api/game', async (req, res) => {
    const gameId = req.query.gameId;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: 'Game not found' });
    res.json({
        playerWhite: game.playerWhite,
        playerBlack: game.playerBlack,
        fen: game.fen,
        moves: game.moves || []
    });
});

// Real-time move update for Socket.IO, backend as chess rules authority
app.post('/api/game-move', async (req, res) => {
    const { gameId, from, to, promotion } = req.body;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });

    const { Chess } = require('chess.js');
    let chess = new Chess(game.fen === "start" ? undefined : game.fen);

    if (!from || !to) {
        return res.status(400).json({ success: false, message: 'Invalid move data' });
    }

    const move = { from, to };
    if (promotion) move.promotion = promotion;

    let result;
    try {
        result = chess.move(move);
    } catch (err) {
        // Chess.js threw (e.g. move is totally illegal)
        return res.status(400).json({ success: false, message: 'Illegal move: ' + err.message });
    }
    if (!result) return res.status(400).json({ success: false, message: 'Illegal move' });

    game.fen = chess.fen();
    game.moves = game.moves || [];
    game.moves.push(result.san);
    await game.save();

    io.to(gameId).emit('opponentMove', { fen: game.fen, move: result });

    return res.json({ success: true, fen: game.fen, move: result });
});

// === PASSWORD RESET ROUTES ===

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found');
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        user.otp = otp;
        user.otpExpiration = Date.now() + 300000;
        await user.save();
        const mailOptions = {
            from: EMAIL_USER,
            to: email,
            subject: 'Password Reset OTP',
            text: `Your OTP for password reset is: ${otp}`
        };
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', email);
        res.send('OTP sent to your email!');
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).send('Error sending email: ' + error.message);
    }
});

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

app.post('/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).send('User not found.');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.otp = undefined;
        user.otpExpiration = undefined;
        await user.save();
        res.send('Password has been reset successfully!');
    } catch (error) {
        res.status(500).send('Error resetting password: ' + error.message);
    }
});

// === SOCKET.IO REAL-TIME LOGIC ===

io.on('connection', (socket) => {
    // Player joins a game room
    socket.on('joinGame', (gameId) => {
        socket.join(gameId);
    });

    // (Optional) For ping/pong or debugging
    socket.on('disconnect', () => {
        // handle user disconnect if needed
    });
});

// === START SERVER ===
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});