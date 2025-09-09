// index.js

const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Configuration ---
const WHATSAPP_TOKEN = 'EAAI2GrZBZBY9ABPRL414nmHVans2LEHnlmYZA0yaX9x7nwWXF0LACr7CROL4GTq3feXIwh1GNcCR0nfB3bUrEIrCrEpw68YwiquLRMcdkxZACdCqSSWT3qOVBifZCEAauVbZBZBWsyYcgiLWeGG8Ms7ZBSjPQMeOCmZBDcWJqwZBpIs8F7UfgeO88bLH9qZApvRled2RrJI933xvTZBWF6eNBpGtP7QU5ZBYuYkIvZAwp8kZCCrNHZBicwwNSwuCro4sygZDZD';
const PHONE_NUMBER_ID = '703433466196049';
const VERIFY_TOKEN = 'Mich!23';
const GEMINI_API_KEY = 'AIzaSyBClb5MDWbJf_9Vav9sds8w7YF38ixqyY4';

// --- Initialize Gemini AI ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// --- No need to edit below this line ---

const app = express();
app.use(express.json());

const PORT = 3000;
const userContext = {};

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
                    // Call the new async function and wait for the response
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

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});