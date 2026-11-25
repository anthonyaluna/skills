const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHash, timingSafeEqual } = require('crypto');

/**
 * LINE Bridge v5.3 (Support Messaging Tool)
 * 增加對外部呼叫的支援
 */

const CONFIG_DIR = process.env.LINE_BRIDGE_CONFIG_DIR || process.env.HOME || '/tmp';
const CLAWDBOT_BIN = process.env.CLAWDBOT_BIN || 'clawdbot';
const CUSTOM_PATH = process.env.LINE_BRIDGE_PATH || process.env.PATH || '/usr/local/bin:/usr/bin:/bin';

const tokenPath = path.join(CONFIG_DIR, '.line_token');
const secretPath = path.join(CONFIG_DIR, '.line_secret');
const allowedSourcesPath = path.join(CONFIG_DIR, '.line_allowed_sources');

try {
  if (!fs.existsSync(tokenPath) || !fs.existsSync(secretPath) || !fs.existsSync(allowedSourcesPath)) {
    console.error(`[Init Error] Missing config files`);
    process.exit(1);
  }

  const config = {
    channelAccessToken: fs.readFileSync(tokenPath, 'utf8').trim(),
    channelSecret: fs.readFileSync(secretPath, 'utf8').trim()
  };

  const client = new line.Client(config);
  const app = express();

  function isAllowedSource(sourceId) {
    if (typeof sourceId !== 'string' || !sourceId) return false;
    return fs.readFileSync(allowedSourcesPath, 'utf8').split('\n').some(id => id.trim() === sourceId);
  }

  // 1. Webhook 端點 (接收訊息) - 必須在 express.json() 之前，因為 line.middleware 需要 raw body
  app.post('/line/webhook', line.middleware(config), async (req, res) => {
    res.status(200).send('OK');
    for (const event of req.body.events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const sourceId = event.source.groupId || event.source.roomId || event.source.userId;
        const senderId = event.source.userId;
        if (!isAllowedSource(sourceId)) continue;

        try {
          let senderName = "朋友";
          try {
            const p = event.source.groupId ? await client.getGroupMemberProfile(event.source.groupId, senderId) : await client.getProfile(senderId);
            senderName = p.displayName;
          } catch(e){}

          const formattedMsg = `[SenderName: ${senderName}] [SenderID: ${senderId}] [SourceID: ${sourceId}] ${event.message.text}`;
          const args = ['agent', '--session-id', 'main', '--message', formattedMsg, '--json'];
          const output = execFileSync(CLAWDBOT_BIN, args, { env: { ...process.env, PATH: CUSTOM_PATH } });
          const result = JSON.parse(output.toString());

          let agentReply = '';
          if (result && result.message) agentReply = result.message;
          else if (result && result.result && result.result.payloads) {
            const p = result.result.payloads.find(x => x.type === 'text' || x.text);
            agentReply = p ? (p.text || p.body) : '';
          }
          if (agentReply) client.pushMessage(sourceId, { type: 'text', text: agentReply });
        } catch (err) {}
      }
    }
  });

  // 2. 內部發送端點 (讓大腦可以透過 curl 發送訊息或圖片)
  function authorizeInternalSend(req, res, next) {
    const token = process.env.LINE_BRIDGE_SEND_TOKEN;
    if (!token || token.trim() !== token || Buffer.byteLength(token) < 32) return res.sendStatus(503);
    const digest = value => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(req.get('Authorization') || ''), digest(`Bearer ${token}`))) {
      return res.sendStatus(401);
    }
    next();
  }
  app.post('/internal/send', authorizeInternalSend, express.json(), async (req, res) => {
    const { target, message, imageUrl, previewUrl } = req.body || {};
    try {
      if (!isAllowedSource(target)) return res.sendStatus(403);
      if (imageUrl) {
        await client.pushMessage(target, {
          type: 'image',
          originalContentUrl: imageUrl,
          previewImageUrl: previewUrl || imageUrl
        });
      }
      if (message) {
        await client.pushMessage(target, { type: 'text', text: message });
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  const PORT = process.env.PORT || 8081;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LINE Bridge v5.3 (Internal API) ONLINE on port ${PORT}`);
  });
} catch (err) { console.error(err); }
