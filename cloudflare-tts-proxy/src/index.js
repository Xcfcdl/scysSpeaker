export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 解析前端传来的参数
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response('Invalid JSON', { status: 400 });
    }

    // 允许前端传token，也可写死
    const token = body.token || env.DOUBAO_TTS_TOKEN;
    if (!token) {
      return new Response(JSON.stringify({ error: 'No token provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 构造豆包TTS请求
    const apiUrl = 'https://openspeech.bytedance.com/api/v1/tts';
    const ttsBody = {
      text: body.text,
      voice_type: body.voice,
      speed: body.speed,
      pitch: body.pitch,
      emotion: body.emotion
    };

    // 发起请求
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(ttsBody)
    });

    const data = await resp.json();

    // 返回结果并允许跨域
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}; 