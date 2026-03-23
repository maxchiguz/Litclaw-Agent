# Litclaw Multi-Model Telegram Agent 🚀

A sophisticated AI agent that routes complex tasks to different AI models (Deepseek, Gemini, Grok, Groq) based on the sensory input.

## Features
- **🧠 Unified Brain**: Powered by Deepseek-Chat.
- **👁️ Vision Sensors**: Gemini-2.5-Flash analyzes photos/videos.
- **👂 Audio Sensors**: Groq Whisper transcribes voice notes.
- **🗣️ Voice Replies**: Automatic TTS for audio inputs.
- **🌍 Web Browsing**: Puppeteer-driven browser automation with "Visual Verification".

## Setup Instructions

1.  **Clone/Copy Files**: Ensure you have `telegram_agent.js`, `browser_manager.js`, and `package.json`.
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Configure API Keys**:
    - Rename `.env.example` to `.env`.
    - Fill in your `BOT_TOKEN`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GROK_API_KEY`, and `GROQ_API_KEY`.
4.  **Launch**:
    ```bash
    npm start
    ```

## Architecture
- **Text/Logic**: Deepseek.
- **Photos/Videos**: Gemini.
- **Voice**: Groq Whisper.
- **Browsing**: Puppeteer.

## Security
This agent is locked to the directory it is launched from. It cannot access files outside its root folder.