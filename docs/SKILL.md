---
name: litclaw
description: A guide to building and maintaining the Litclaw Multi-Model Telegram Agent.
---

# Litclaw Multi-Model Agent Skill

This skill documents the "Single-Brain" architecture used to create the Litclaw Telegram Bot. It uses a combination of specialized AI models to handle text, audio, video, and browser automation.

## Architecture

| Component | Model / Technology | Role |
| :--- | :--- | :--- |
| **Brain** | Deepseek-Chat | Handles logic, tool orchestration, and conversation. |
| **Eyes** | Gemini-2.5-Flash | Analyzes photos, videos, and browser screenshots. |
| **Ears** | Groq Whisper-large-v3 | Transcribes voice notes into text for the brain. |
| **Mouth** | Google-TTS-API | Converts the brain's text responses into voice notes. |
| **Body** | Puppeteer (Node.js) | Allows the agent to actively browse and interact with websites. |
| **Interface** | Telegram Bot API | The user-facing platform. |

## Core Logic (The "Single-Brain" Loop)

The key to Litclaw is that **only one model (Deepseek)** makes decisions. The other models act as sensory input/output sensors.

1.  **Input received**: Voice, Photo, Video, or Text.
2.  **Sensory Processing**:
    *   Voice -> Groq Whisper (Transcribes to text).
    *   Media -> Gemini Vision (Describes visual data as text).
3.  **Brain Consolidation**: All text is passed to Deepseek as a single prompt (e.g., `[Voice Transcription]: ...`).
4.  **Tool Use**: Deepseek determines if it needs to read files or browse the web.
5.  **Output**: Deepseek generates a response. If the initial input was voice, the response is converted back to audio via Google-TTS.

## Implementation Details

- **Safe Paths**: Restricts file operations to the designated workspace.
- **Message Splitting**: Handles Telegram's 4096-character limit by auto-chunking long responses.
- **Browser Automation**: Uses Puppeteer to click, type, and navigate, with Gemini providing "Visual Verification" of the page.

## How to Maintain

1.  Keep `.env` updated with all 4 API keys (Gemini, Deepseek, Grok, Groq).
2.  Use `npm start` to launch `telegram_agent.js`.
3.  Monitor the console for tool execution steps.
