const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const moment = require('moment');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const activeBots = new Map();
const runningScripts = new Map();
const userPayloads = new Map();
const userAuthorization = new Map();
const userModes = new Map(); // New map to store user modes

const DICE_CONFIG = {
    url: "https://api-dice.goatsbot.xyz/dice/action",
    headers: {
        "accept": "application/json, text/plain, a*/*",
        "accept-language": "en-US,en;q=0.9,fa;q=0.8",
        "authorization": "Bearer YOUR_AUTHORIZATION_TOKEN_HERE", // Replace with valid token
        "content-type": "application/json",
        "origin": "https://dev.goatsbot.xyz",
        "referer": "https://dev.goatsbot.xyz/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    },
    payloads: [
        {
            point_milestone: 99,
            is_upper: false,
            bet_amount: 0.025,
            currency: "ton"
        }
    ]
};

async function writeAnalysis(responseData) {
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
    const realBalance = responseData.user.real_balance;
    const isWin = responseData.wheel.is_win;
    const analysisText = `[${timestamp}] Balance: ${realBalance.toFixed(2)} | Win: ${isWin}\n`;
    await fs.appendFile("analysis.txt", analysisText);
}

async function runDiceScript(bot, chatId, scriptId) {
    let requestCounter = 0;
    let isRunning = true;
    runningScripts.set(scriptId, { isRunning });

    try {
        while (isRunning) {
            const payload = userPayloads.get(chatId) || DICE_CONFIG.payloads[0];
            const authcode = userAuthorization.get(chatId);
            const headers = {
                ...DICE_CONFIG.headers,
                ...(authcode ? { "authorization": authcode } : {})
            };
            const response = await axios.post(DICE_CONFIG.url, payload, { headers });
            const responseData = response.data;
            requestCounter++;

            if (requestCounter % 10 === 0) {
                const statusMessage = `Requests sent: ${requestCounter} | Balance: ${responseData.user.real_balance.toFixed(2)} | Win: ${responseData.wheel.is_win}`;
                console.log(statusMessage);
                await bot.sendMessage(chatId, statusMessage);
            }

            await fs.appendFile("response.txt", JSON.stringify(response.data) + "\n");
            await writeAnalysis(responseData);

            const scriptState = runningScripts.get(scriptId);
            if (!scriptState || !scriptState.isRunning) {
                isRunning = false;
                break;
            }

            // Check the mode and decide whether to continue or wait
            const mode = userModes.get(chatId) || "single"; // Default to single mode
            if (mode === "single") {
                // Wait for the user to send the next request
                await new Promise(resolve => setTimeout(resolve, 1000)); // Adjust the delay as needed
                break; // Exit the loop for single mode
            }
        }
    } catch (error) {
        console.error("Error in dice script:", error);
        await bot.sendMessage(chatId, `Script stopped due to an error. Please try again later.`);
    } finally {
        runningScripts.delete(scriptId);
    }
}

function createBot(token) {
    const bot = new TelegramBot(token, { polling: true });
    const scriptId = `bot_${token}`;

    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(chatId, 'Hello! I am your dice game bot. Use /run to start the dice game script, /stop to stop the script, /setpayload to set a custom payload, /showpayload to see the current payload, /resetpayload to reset the payload to the default, use /setauthcode "Bearer your_custom_token_here", /showauthcode to view the current authorization code, and /resetauthcode to reset the authorization code, /setmode (single|nonstop) to set the request mode. Use /help for more information on commands.');
    });

    bot.onText(/\/run/, async (msg) => {
        const chatId = msg.chat.id;
        const scriptId = `script_${chatId}`;
        if (runningScripts.has(scriptId)) {
            await bot.sendMessage(chatId, 'The script is already running.');
            return;
        }
        userModes.set(chatId, "single"); // Default to single mode
        await runDiceScript(bot, chatId, scriptId);
    });

    bot.onText(/\/stop/, async (msg) => {
        const chatId = msg.chat.id;
        const scriptId = `script_${chatId}`;
        if (!runningScripts.has(scriptId)) {
            await bot.sendMessage(chatId, 'No script is currently running.');
            return;
        }
        const scriptState = runningScripts.get(scriptId);
        scriptState.isRunning = false;
        await bot.sendMessage(chatId, 'The script has been stopped.');
    });

    bot.onText(/\/setpayload (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const newPayload = JSON.parse(match[1]);
        userPayloads.set(chatId, newPayload);
        await bot.sendMessage(chatId, 'Payload has been updated.');
    });

    bot.onText(/\/showpayload/, async (msg) => {
        const chatId = msg.chat.id;
        const payload = userPayloads.get(chatId) || DICE_CONFIG.payloads[0];
        await bot.sendMessage(chatId, `Current payload: ${JSON.stringify(payload)}`);
    });

    bot.onText(/\/resetpayload/, async (msg) => {
        const chatId = msg.chat.id;
        userPayloads.delete(chatId);
        await bot.sendMessage(chatId, 'Payload has been reset to default.');
    });

    bot.onText(/\/setauthcode (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const authCode = match[1];
        userAuthorization.set(chatId, authCode);
        await bot.sendMessage(chatId, 'Authorization code has been set.');
    });

    bot.onText(/\/showauthcode/, async (msg) => {
        const chatId = msg.chat.id;
        const authCode = userAuthorization.get(chatId) || 'No authorization code set.';
        await bot.sendMessage(chatId, `Current authorization code: ${authCode}`);
    });

    bot.onText(/\/resetauthcode/, async (msg) => {
        const chatId = msg.chat.id;
        userAuthorization.delete(chatId);
        await bot.sendMessage(chatId, 'Authorization code has been reset.');
    });

    bot.onText(/\/setmode (single|nonstop)/, async (msg, match) => {
        const chatId = msg.chat.id;
        userModes.set(chatId, match[1]);
        await bot.sendMessage(chatId, `Request mode has been set to ${match[1]}.`);
    });

    bot.onText(/\/help/, async (msg) => {
        const chatId = msg.chat.id;
        const helpText = `
        Available commands:
        /start - Start the bot
        /run - Start the dice game script
        /stop - Stop the script
        /setpayload {JSON} - Set a custom payload
        /showpayload - Show the current payload
        /resetpayload - Reset the payload to default
        /setauthcode "Bearer your_custom_token" - Set the authorization code
        /showauthcode - Show the current authorization code
        /resetauthcode - Reset the authorization code
        /setmode (single|nonstop) - Set the request mode
        /help - Show this help message
        `;
        await bot.sendMessage(chatId, helpText);
    });

    return bot;
}

const token = 'YOUR_TELEGRAM_BOT_TOKEN_HERE'; // Replace with your bot token
const bot = createBot(token);

app.post('/start_bot', (req, res) => {
    res.json({ message: "Bot started successfully!" });
});
