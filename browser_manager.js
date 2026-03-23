const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async ensureBrowser() {
        if (!this.browser) {
            console.log("Launching Chromium...");
            this.browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            this.page = await this.browser.newPage();
            await this.page.setViewport({ width: 1280, height: 800 });
        }
    }

    async navigate(url) {
        await this.ensureBrowser();
        console.log(`Navigating to ${url}...`);
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Return summary of the page
        const title = await this.page.title();
        const textContent = await this.page.evaluate(() => document.body.innerText.substring(0, 5000));
        return { 
            title, 
            summary: textContent.substring(0, 500) + "...", 
            fullContent: textContent 
        };
    }

    async screenshot(filePath) {
        await this.ensureBrowser();
        await this.page.screenshot({ path: filePath, fullPage: false });
        return filePath;
    }

    async click(selector) {
        await this.ensureBrowser();
        await this.page.waitForSelector(selector, { timeout: 5000 });
        await this.page.click(selector);
        return `Successfully clicked ${selector}`;
    }

    async type(selector, text) {
        await this.ensureBrowser();
        await this.page.waitForSelector(selector, { timeout: 5000 });
        await this.page.type(selector, text);
        return `Successfully typed into ${selector}`;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

module.exports = new BrowserManager();
