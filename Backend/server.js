const express = require('express');
const cors = require('cors');
require('dotenv').config();
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const {
    PORT,
    DARAJA_CONSUMER_KEY,
    DARAJA_CONSUMER_SECRET,
    BUSINESS_SHORTCODE,
    PASSKEY,
    CALLBACK_URL,
    TILL_NUMBER
} = process.env;

let accessToken = null;
let tokenExpiry = 0;
const accessMap = new Map(); // Map of phone -> expiry timestamp
const transactionLogs = []; // In-memory transaction log

function normalizePhone(phone) {
    if (phone.startsWith('+')) phone = phone.slice(1);
    if (phone.startsWith('07')) return '254' + phone.slice(1);
    if (phone.startsWith('254')) return phone;
    throw new Error("Invalid phone number format");
}

app.get('/', (req, res) => {
    res.send('Server is running...');
});

app.get('/index.html', (req, res) => {
    res.redirect('https://perontips.vercel.app/');
});

app.get('/vip-access/:phone', (req, res) => {
    try {
        const normalizedPhone = normalizePhone(req.params.phone);
        const expiry = accessMap.get(normalizedPhone);
        const now = Date.now();

        if (expiry && now < expiry) {
            return res.status(200).json({ access: true, redirect: 'https://perontips-frontend.vercel.app/vip.html' });
        } else {
            return res.status(403).json({ access: false, message: 'Payment expired or not found' });
        }
    } catch (error) {
        return res.status(400).json({ access: false, message: 'Invalid phone format' });
    }
});

app.post('/callback', (req, res) => {
    const body = req.body;
    console.log("Mpesa Callback Received:", JSON.stringify(body, null, 2));

    const stkCallback = body?.Body?.stkCallback;
    const timestamp = new Date().toISOString();

    if (stkCallback?.ResultCode === 0) {
        const phone = stkCallback.CallbackMetadata?.Item?.find(i => i.Name === "PhoneNumber")?.Value;
        if (phone) {
            const normalizedPhone = String(phone);
            const expiry = Date.now() + 5 * 60 * 60 * 1000; // 5 hours in ms
            accessMap.set(normalizedPhone, expiry);
            console.log(`Access granted for ${normalizedPhone} until ${new Date(expiry).toLocaleString()}`);
            transactionLogs.push({
                timestamp,
                phone: normalizedPhone,
                status: 'Payment SUCCESS'
            });
        }
    } else {
        const phone = stkCallback?.CallbackMetadata?.Item?.find(i => i.Name === "PhoneNumber")?.Value || 'Unknown';
        transactionLogs.push({
            timestamp,
            phone,
            status: `Payment FAILED - ${stkCallback?.ResultDesc}`
        });
    }

    res.status(200).json({ message: "Callback received successfully" });
});

async function getAccessToken() {
    const currentTime = Math.floor(Date.now() / 1000);
    if (accessToken && currentTime < tokenExpiry) return accessToken;

    try {
        const auth = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
        const response = await axios.get(
            'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            { headers: { Authorization: `Basic ${auth}` } }
        );

        accessToken = response.data.access_token;
        tokenExpiry = currentTime + parseInt(response.data.expires_in) - 10;
        return accessToken;
    } catch (error) {
        console.error('Access Token Error:', error?.response?.data || error.message);
        throw new Error('Failed to obtain access token');
    }
}

app.post('/pay', async (req, res) => {
    try {
        await handlePayment(req, res);
    } catch (error) {
        console.error("Payment Handler Error:", error.message);
        res.status(400).json({ success: false, message: error.message });
    }
});

async function handlePayment(req, res) {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const formattedPhone = normalizePhone(phone);
    const timestamp = new Date().toISOString().replace(/[-T:Z]/g, '').slice(0, 14);
    const password = Buffer.from(`${BUSINESS_SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');

    try {
        const accessToken = await getAccessToken();

        const response = await axios.post(
            'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            {
                BusinessShortCode: BUSINESS_SHORTCODE,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerBuyGoodsOnline',
                Amount: 20,
                PartyA: formattedPhone,
                PartyB: TILL_NUMBER,
                PhoneNumber: formattedPhone,
                CallBackURL: CALLBACK_URL,
                AccountReference: 'PeronTips',
                TransactionDesc: 'Betting Prediction'
            },
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        console.log("STK Push Sent:", response.data);

        transactionLogs.push({
            timestamp: new Date().toISOString(),
            phone: formattedPhone,
            status: 'STK Push Sent'
        });

        res.json({
            success: true,
            message: "STK Push sent. Enter your M-PESA PIN to complete.",
            phone: formattedPhone
        });

    } catch (error) {
        const mpesaError = error.response?.data;
        console.error("Payment Error:", mpesaError || error.message);

        res.status(500).json({
            success: false,
            message: 'Payment failed',
            error: mpesaError?.errorMessage || error.message
        });
    }
}

app.get('/logs', (req, res) => {
    const { phone } = req.query;
    if (phone !== '0796029616') {
        return res.status(403).json({ error: 'Access Denied' });
    }

    res.json(transactionLogs);
});

app.listen(PORT || 5000, () => console.log(`Backend running on port ${PORT || 5000}`));
