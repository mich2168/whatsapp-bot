// index.js

const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuration ---
// All secrets are loaded from environment variables for security.
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- Initialize Gemini AI ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- Initialize Express App ---
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const userContext = {}; // In-memory store for user context

// --- AI Response Generation Function ---
async function getDraftedResponse(context, prompt) {
    console.log(`Generating draft for context: "${context}" with prompt: "${prompt}"`);
    
    // Construct the full prompt for the AI model
    const fullPrompt = `The user forwarded this message to me: "${context}". My instruction is to: "${prompt}". Please provide a suitable response.`;

    try {
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();
        return text.trim();
    } catch (error) {
        console.error("Error generating response from Gemini:", error);
        return "Sorry, I had trouble generating a response. Please try again.";
    }
}

// --- Webhook Verification Endpoint ---
// This is used once by Meta to verify your webhook URL.
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// --- Main Webhook Endpoint to Receive Messages ---
// This endpoint receives all incoming messages from WhatsApp.
app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object && body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const message = body.entry[0].changes[0].value.messages[0];
        const from = message.from;
        if (message.type === 'text') {
            const msg_body = message.text.body;
            let replyText = '';
            if (msg_body.toLowerCase().startsWith('draft:')) {
                const prompt = msg_body.substring(6).trim();
                const context = userContext[from];
                if (context) {
                    replyText = await getDraftedResponse(context, prompt);
                    delete userContext[from];
                } else {
                    replyText = 'Please forward a message to me first, then send your draft command (e.g., "draft: rephrase this politely").';
                }
            } else {
                userContext[from] = msg_body;
                replyText = `✅ Context saved. Now tell me how to draft a reply. (e.g., "draft: make this sound more excited")`;
            }
            try {
                await axios({
                    method: 'POST',
                    url: `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
                    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
                    data: {
                        messaging_product: 'whatsapp',
                        to: from,
                        text: { body: replyText },
                    },
                });
            } catch (error) {
                console.error('Failed to send message:', error.response ? error.response.data : error.message);
            }
        }
    }
    res.sendStatus(200);
});

// --- Root Endpoint ---
// A simple endpoint to confirm the server is running.
app.get('/', (req, res) => {
    res.send('WhatsApp Agent is running!');
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});