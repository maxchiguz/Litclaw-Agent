require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');
const googleTTS = require('google-tts-api');
const fs = require('fs');
const path = require('path');
const browserManager = require('./browser_manager');

// Extract API Keys
const token = process.env.BOT_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const grokApiKey = process.env.GROK_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;
const workspaceDir = path.resolve(process.cwd());

if (!token || !deepseekApiKey) {
    console.error("Missing critical BOT_TOKEN or DEEPSEEK_API_KEY in .env!");
    process.exit(1);
}

// ==== CLIENT INITIALIZATION ====
const genAI = new GoogleGenerativeAI(geminiApiKey);
const fileManager = new GoogleAIFileManager(geminiApiKey);
const groqClient = new OpenAI({ apiKey: groqApiKey, baseURL: "https://api.groq.com/openai/v1" });
const deepseekClient = new OpenAI({ apiKey: deepseekApiKey, baseURL: "https://api.deepseek.com" });
const grokClient = new OpenAI({ apiKey: grokApiKey, baseURL: "https://api.x.ai/v1" });

// ==== LOCAL TOOLS ====
function safePath(filename) {
    const targetPath = path.resolve(workspaceDir, filename);
    if (!targetPath.startsWith(workspaceDir)) {
        throw new Error(`Access denied. Cannot read or edit files outside ${workspaceDir}`);
    }
    return targetPath;
}

const availableFunctions = {
    read_file: ({ filename }) => {
        try { return fs.readFileSync(safePath(filename), 'utf-8') || "[File is empty]"; } 
        catch (e) { return `Error reading ${filename}: ${e.message}`; }
    },
    write_file: ({ filename, content }) => {
        try { 
            fs.mkdirSync(path.dirname(safePath(filename)), { recursive: true }); 
            fs.writeFileSync(safePath(filename), content, 'utf-8'); 
            return `Successfully wrote to ${filename}`; 
        } catch (e) { return `Error writing ${filename}: ${e.message}`; }
    },
    list_dir: ({ path: targetPathStr = "." }) => {
        try { 
            const p = safePath(targetPathStr);
            if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) return `${targetPathStr} is not a valid directory.`;            
            const results = fs.readdirSync(p);
            return results.length ? results.join('\n') : "Directory is empty."; 
        } catch (e) { return `Error listing ${targetPathStr}: ${e.message}`; }
    },
    // BROWSER TOOLS
    browser_navigate: async ({ url }) => {
        try {
            const result = await browserManager.navigate(url);
            return `Navigated to ${url}. Title: ${result.title}. Content Summary: ${result.summary}`;
        } catch (e) { return `Browser Error: ${e.message}`; }
    },
    browser_screenshot: async ({ chatId }) => {
        try {
            const screenshotPath = path.join(workspaceDir, 'tmp', `screenshot_${Date.now()}.png`);
            if (!fs.existsSync(path.dirname(screenshotPath))) fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
            await browserManager.screenshot(screenshotPath);
            return { type: "screenshot", path: screenshotPath };
        } catch (e) { return `Browser Error: ${e.message}`; }
    },
    browser_click: async ({ selector }) => {
        try {
            const result = await browserManager.click(selector);
            return result;
        } catch (e) { return `Browser Error: ${e.message}`; }
    },
    browser_type: async ({ selector, text }) => {
        try {
            const result = await browserManager.type(selector, text);
            return result;
        } catch (e) { return `Browser Error: ${e.message}`; }
    }
};

const openaiTools = [
    { type: "function", function: { name: "read_file", description: "Reads the content of a local file.", parameters: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] } } },
    { type: "function", function: { name: "write_file", description: "Writes code to a file and completely replaces it.", parameters: { type: "object", properties: { filename: { type: "string" }, content: { type: "string" } }, required: ["filename", "content"] } } },
    { type: "function", function: { name: "list_dir", description: "Lists directory contents.", parameters: { type: "object", properties: { path: { type: "string" } } } } },
    { type: "function", function: { name: "browser_navigate", description: "Navigates the browser to any URL.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
    { type: "function", function: { name: "browser_screenshot", description: "Takes a screenshot of the current browser page.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "browser_click", description: "Clicks an element in the browser using a CSS selector.", parameters: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] } } },
    { type: "function", function: { name: "browser_type", description: "Types text into a field in the browser.", parameters: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: ["selector", "text"] } } }
];

const systemInstruction = `You are a Single-Brain AI Agent acting as an advanced file, coding, and browser assistant. 
Your working directory is '${workspaceDir}'. You have direct access to list files, read, and write code inside this directory.
You ALSO have a live browser (Chromium). You can navigate to websites, search for information, click buttons, and type into fields.
When you need to see what's on the page, use 'browser_screenshot'. I will automatically send the screenshot through the Vision sensor for you.
CRITICAL: When using tools, ensure all your function arguments are proper, valid, fully escaped JSON.`;

const bot = new TelegramBot(token, { polling: true });

// Unified conversational history
const conversationSessions = new Map();

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `Single-Brain Agent with Browser Control activated!\n🧠 Brain -> Deepseek\n👀 Eyes -> Gemini\n🌍 Browser -> Puppeteer\n👂 Ears -> Groq Whisper\n\nLocked to:\n${workspaceDir}`);
});

// ==== UNIFIED CHAT PROCESSOR (Deepseek) ====
async function processMasterChat(chatId, textMessage, statusMsg, respondWithAudio = false) {
    if (!conversationSessions.has(chatId)) {
        conversationSessions.set(chatId, [{ role: "system", content: systemInstruction }]);
    }
    const messages = conversationSessions.get(chatId);
    
    // Safely prune long history
    if (messages.length > 20) { 
        let tail = messages.slice(-15);
        while(tail.length > 0 && (tail[0].role === 'tool' || (tail[0].role === 'assistant' && tail[0].tool_calls))) { tail.shift(); }
        if(tail.length === 0) tail = [{ role: "user", content: "Context reset." }];
        conversationSessions.set(chatId, [messages[0], ...tail]); 
    }
    
    const activeMessages = conversationSessions.get(chatId);
    activeMessages.push({ role: "user", content: textMessage });

    async function tryCompletion(client, modelName) {
        let response = await client.chat.completions.create({
            model: modelName,
            messages: activeMessages,
            tools: openaiTools,
            tool_choice: "auto"
        });
        
        let responseMsg = response.choices[0].message;
        activeMessages.push(responseMsg);

        while (responseMsg.tool_calls && responseMsg.tool_calls.length > 0) {
            for (const toolCall of responseMsg.tool_calls) {
                const fnName = toolCall.function.name;
                let fnResult = "";
                
                try {
                    const fnArgs = JSON.parse(toolCall.function.arguments || "{}");
                    fnArgs.chatId = chatId; // Inject chatId for screenshot tool
                    console.log(`[${modelName}] Executing tool: ${fnName}`);
                    
                    const result = await availableFunctions[fnName](fnArgs);
                    
                    // Handle special result types (e.g. screenshots)
                    if (result && typeof result === 'object' && result.type === 'screenshot') {
                        // 1) Send the screenshot to the user on Telegram
                        await bot.sendPhoto(chatId, result.path, { caption: "This is what I see on the screen right now." });
                        
                        // 2) Send the screenshot to Gemini Vision to "see" it
                        const uploadResponse = await fileManager.uploadFile(result.path, { mimeType: "image/png", displayName: "Browser Screenshot" });
                        const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                        const visionResult = await visionModel.generateContent([
                            { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                            { text: "Analyze this browser screenshot. Read all text, identify important buttons, and describe the layout so Deepseek can interact with it." }
                        ]);
                        fnResult = `[VISUAL FEEDBACK FROM SCREENSHOT]:\n${visionResult.response.text()}`;
                        try { fs.unlinkSync(result.path); } catch (e) {}
                    } else {
                        fnResult = String(result);
                    }
                } catch (err) {
                    console.error(`[${modelName}] Error in tool ${fnName}:`, err.message);
                    fnResult = `System Error: ${err.message}`;
                }
                
                activeMessages.push({ tool_call_id: toolCall.id, role: "tool", name: fnName, content: fnResult });
            }
            
            response = await client.chat.completions.create({ model: modelName, messages: activeMessages, tools: openaiTools });
            responseMsg = response.choices[0].message;
            activeMessages.push(responseMsg);
        }
        return responseMsg.content || "Done.";
    }

    let finalResponseText = "";
    try {
        await bot.editMessageText("Brain Processing...", { chat_id: chatId, message_id: statusMsg.message_id });
        finalResponseText = await tryCompletion(deepseekClient, "deepseek-chat");
    } catch (e) {
        console.error("Deepseek error:", e.message);
        await bot.editMessageText(`Falling back...`, { chat_id: chatId, message_id: statusMsg.message_id });
        try {
            finalResponseText = await tryCompletion(grokClient, "grok-4");
        } catch (e2) {
            finalResponseText = `Error: ${e2.message}`;
        }
    }
    
    // Helper to send long messages to Telegram safely
    async function safeSendMessage(chatId, text, options = {}) {
        const MAX_LEN = 4000;
        if (text.length <= MAX_LEN) return await bot.sendMessage(chatId, text, options);
        const chunks = text.match(/[\s\S]{1,4000}/g) || [];
        for (const chunk of chunks) await bot.sendMessage(chatId, chunk, options);
    }

    // Always send the Text form of the response so the user can read it
    if (finalResponseText.length <= 4000) {
        await bot.editMessageText(finalResponseText, { chat_id: chatId, message_id: statusMsg.message_id });
    } else {
        await bot.editMessageText(finalResponseText.substring(0, 4000), { chat_id: chatId, message_id: statusMsg.message_id });
        await safeSendMessage(chatId, finalResponseText.substring(4000));
    }
    
    if (respondWithAudio && finalResponseText) {
        try {
            const spokenText = finalResponseText.length > 200 ? finalResponseText.substring(0, 197) + "..." : finalResponseText;
            const ttsUrl = googleTTS.getAudioUrl(spokenText, { lang: 'en', slow: false, host: 'https://translate.google.com' });
            await bot.sendVoice(chatId, ttsUrl);
        } catch (err) { console.error("TTS failed:", err.message); }
    }
}

// ==== EVENT LISTENER ====
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return; 
    const chatId = msg.chat.id;

    if (msg.text) {
        const statusMsg = await bot.sendMessage(chatId, "Processing...");
        await processMasterChat(chatId, msg.text, statusMsg, false);
    } 
    else if (msg.voice || msg.audio) {
        const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
        const statusMsg = await bot.sendMessage(chatId, "Listening...");
        try {
            const tmpDir = path.join(workspaceDir, 'tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const ext = msg.voice ? '.ogg' : '.mp3';
            const localFile = await bot.downloadFile(fileId, tmpDir);
            const renamedPath = localFile + ext;
            fs.renameSync(localFile, renamedPath);
            const transcription = await groqClient.audio.transcriptions.create({ file: fs.createReadStream(renamedPath), model: "whisper-large-v3" });
            const unifiedPrompt = `[Voice Transcription]: ${transcription.text}`;
            await processMasterChat(chatId, unifiedPrompt, statusMsg, true);
            try { fs.unlinkSync(renamedPath); } catch (e) {}
        } catch (e) { await bot.editMessageText(`Error: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id }); }
    }
    else if (msg.video || msg.video_note || msg.photo) {
        const isPhoto = !!msg.photo;
        const fileId = isPhoto ? msg.photo[msg.photo.length - 1].file_id : (msg.video ? msg.video.file_id : msg.video_note.file_id);
        const statusMsg = await bot.sendMessage(chatId, isPhoto ? "Looking at photo..." : "Watching video...");
        try {
            const tmpDir = path.join(workspaceDir, 'tmp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const localPath = await bot.downloadFile(fileId, tmpDir);
            const mimeType = isPhoto ? "image/jpeg" : "video/mp4";
            const uploadResponse = await fileManager.uploadFile(localPath, { mimeType, displayName: "Input Media" });
            
            if (!isPhoto) {
                let fileInfo = await fileManager.getFile(uploadResponse.file.name);
                while (fileInfo.state === "PROCESSING") {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    fileInfo = await fileManager.getFile(uploadResponse.file.name);
                }
            }

            const pureVisionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await pureVisionModel.generateContent([
                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                { text: isPhoto ? "Describe this image in detail." : "Describe this video in detail." }
            ]);
            
            const visualDescription = result.response.text();
            const prompt = isPhoto ? `[Photo Description]: ${visualDescription}` : `[Video Description]: ${visualDescription}`;
            await processMasterChat(chatId, prompt, statusMsg, false);
            try { fs.unlinkSync(localPath); } catch (e) {}
        } catch (e) { await bot.editMessageText(`Error: ${e.message}`, { chat_id: chatId, message_id: statusMsg.message_id }); }
    }
});

console.log(`Openclaw Unified Master-Agent initialized. Listening...`);