import dotenv from 'dotenv';
dotenv.config();

export default async function handler(req, res) {
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { appid, token, text, voice, speed, pitch, emotion } = req.body || {};

  if (!token || !appid) {
    res.status(400).json({ error: 'No token or appid provided' });
    return;
  }

  const apiUrl = 'https://openspeech.bytedance.com/api/v1/tts';
  const ttsBody = {
    text: text,
    voice_type: voice,
    speed: speed,
    pitch: pitch,
    emotion: emotion
  };

  try {
    const ttsResp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer;' + token
      },
      body: JSON.stringify(ttsBody)
    });
    const data = await ttsResp.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(ttsResp.status).json(data);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: e.toString() });
  }
}

export const config = {
  api: {
    bodyParser: true,
    externalResolver: true,
  },
}; 