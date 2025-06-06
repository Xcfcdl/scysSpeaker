// 监听来自popup和content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'openPopup') {
    chrome.action.openPopup();
  } else if (request.action === 'doubaoTTS') {
    // 处理豆包TTS请求，解决CORS问题
    handleDoubaoTTSRequest(request.data)
      .then(result => sendResponse({success: true, data: result}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // 保持消息通道开放
  } else if (request.action === 'testDoubaoTTS') {
    // 处理豆包TTS测试请求
    handleDoubaoTTSRequest(request.data)
      .then(result => sendResponse({success: true, data: result}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // 保持消息通道开放
  }
});

// 处理豆包TTS API请求
async function handleDoubaoTTSRequest(requestData) {
  const { appid, token, text, voice_type, speed_ratio, encoding, emotion, websocketMode } = requestData;

  // 根据模式选择不同的处理方式
  if (websocketMode) {
    return await handleDoubaoWebSocketTTS(requestData);
  } else {
    return await handleDoubaoHTTPTTS(requestData);
  }
}

// 处理HTTP模式的豆包TTS请求
async function handleDoubaoHTTPTTS(requestData) {
  const { appid, token, text, voice_type, speed_ratio, encoding, emotion } = requestData;

  const requestBody = {
    app: {
      appid: appid,
      token: token,
      cluster: "volcano_tts"
    },
    user: {
      uid: "chrome_extension_user"
    },
    audio: {
      voice_type: voice_type,
      encoding: encoding || "mp3",
      speed_ratio: speed_ratio || 1.0,
      rate: 24000
    },
    request: {
      reqid: generateUUID(),
      text: text,
      operation: "query"
    }
  };

  // 如果有情感参数，添加到audio配置中
  if (emotion && emotion !== 'neutral') {
    requestBody.audio.emotion = emotion;
    requestBody.audio.enable_emotion = true;
  }

  try {
    const response = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.code === 3000 && result.data) {
      return {
        audio: result.data,
        duration: result.addition?.duration
      };
    } else {
      throw new Error(`豆包TTS API错误: ${result.message || '未知错误'} (code: ${result.code})`);
    }
  } catch (error) {
    console.error('豆包TTS请求失败:', error);
    throw error;
  }
}

// 处理WebSocket模式的豆包TTS请求
async function handleDoubaoWebSocketTTS(requestData) {
  const { appid, token, text, voice_type, speed_ratio, encoding, emotion } = requestData;

  return new Promise((resolve, reject) => {
    const wsUrl = 'wss://openspeech.bytedance.com/api/v1/tts/ws_binary';
    const ws = new WebSocket(wsUrl, [], {
      headers: {
        'Authorization': `Bearer;${token}`
      }
    });

    let audioChunks = [];
    let isComplete = false;

    ws.onopen = function() {
      // 构建请求数据
      const requestBody = {
        app: {
          appid: appid,
          token: token,
          cluster: "volcano_tts"
        },
        user: {
          uid: "chrome_extension_user"
        },
        audio: {
          voice_type: voice_type,
          encoding: encoding || "mp3",
          speed_ratio: speed_ratio || 1.0,
          rate: 24000
        },
        request: {
          reqid: generateUUID(),
          text: text,
          operation: "submit"  // WebSocket使用submit
        }
      };

      // 如果有情感参数，添加到audio配置中
      if (emotion && emotion !== 'neutral') {
        requestBody.audio.emotion = emotion;
        requestBody.audio.enable_emotion = true;
      }

      // 构建二进制消息
      const jsonPayload = JSON.stringify(requestBody);
      const message = createBinaryMessage(jsonPayload);
      ws.send(message);
    };

    ws.onmessage = function(event) {
      try {
        const response = parseBinaryMessage(event.data);
        if (response.audio) {
          audioChunks.push(response.audio);
        }

        // 检查是否完成（sequence < 0表示最后一条消息）
        if (response.sequence < 0) {
          isComplete = true;
          ws.close();

          // 合并所有音频片段
          const combinedAudio = audioChunks.join('');
          resolve({
            audio: combinedAudio,
            duration: response.duration
          });
        }
      } catch (error) {
        console.error('解析WebSocket消息失败:', error);
        reject(error);
      }
    };

    ws.onerror = function(error) {
      console.error('WebSocket错误:', error);
      reject(new Error('WebSocket连接失败'));
    };

    ws.onclose = function(event) {
      if (!isComplete) {
        reject(new Error(`WebSocket连接关闭: ${event.code} ${event.reason}`));
      }
    };

    // 设置超时
    setTimeout(() => {
      if (!isComplete) {
        ws.close();
        reject(new Error('WebSocket请求超时'));
      }
    }, 30000); // 30秒超时
  });
}

// 创建二进制消息（根据豆包WebSocket协议）
function createBinaryMessage(jsonPayload) {
  const payloadBytes = new TextEncoder().encode(jsonPayload);
  const payloadSize = payloadBytes.length;

  // 创建4字节的header
  const header = new ArrayBuffer(4);
  const headerView = new DataView(header);

  // 协议版本(4bit) + Header size(4bit) + Message type(4bit) + Flags(4bit) +
  // Serialization(4bit) + Compression(4bit) + Reserved(8bit)
  headerView.setUint8(0, 0x11); // 版本1 + header size 1
  headerView.setUint8(1, 0x10); // full client request + flags 0
  headerView.setUint8(2, 0x10); // JSON序列化 + 无压缩
  headerView.setUint8(3, 0x00); // 保留字段

  // 合并header和payload
  const message = new ArrayBuffer(4 + payloadSize);
  const messageView = new Uint8Array(message);
  messageView.set(new Uint8Array(header), 0);
  messageView.set(payloadBytes, 4);

  return message;
}

// 解析二进制消息
function parseBinaryMessage(data) {
  const view = new DataView(data);

  // 解析header
  const byte0 = view.getUint8(0);
  const byte1 = view.getUint8(1);
  const byte2 = view.getUint8(2);

  const version = (byte0 >> 4) & 0x0F;
  const headerSize = byte0 & 0x0F;
  const messageType = (byte1 >> 4) & 0x0F;
  const flags = byte1 & 0x0F;
  const serialization = (byte2 >> 4) & 0x0F;

  if (messageType === 0x0B) {
    // Audio-only server response
    const audioData = data.slice(4); // 跳过4字节header
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));

    return {
      audio: base64Audio,
      sequence: flags === 0x02 || flags === 0x03 ? -1 : 1 // 根据flags判断是否为最后一条
    };
  } else if (messageType === 0x0F) {
    // Error message
    throw new Error('服务器返回错误消息');
  } else {
    // 其他类型的消息，尝试解析JSON
    const jsonData = data.slice(4);
    const jsonString = new TextDecoder().decode(jsonData);
    return JSON.parse(jsonString);
  }
}

// 生成UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 安装或更新扩展时初始化设置
chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.sync.get({
    voiceType: 'zh-CN-XiaoxiaoNeural',
    rate: 1.0,
    pitch: 1.0,
    autoNext: true,
    emotion: 'neutral',
    customVoiceType: '',
    ttsToken: '',
    ttsAppid: ''
  }, function(items) {
    // 如果没有设置，则使用默认值
    if (Object.keys(items).length === 0) {
      chrome.storage.sync.set({
        voiceType: 'zh-CN-XiaoxiaoNeural',
        rate: 1.0,
        pitch: 1.0,
        autoNext: true,
        emotion: 'neutral',
        customVoiceType: '',
        ttsToken: '',
        ttsAppid: ''
      });
    }
  });
});