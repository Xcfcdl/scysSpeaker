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

// 处理WebSocket模式的豆包TTS请求（根据官方代码实现）
async function handleDoubaoWebSocketTTS(requestData) {
  const { appid, token, text, voice_type, speed_ratio, encoding, emotion } = requestData;

  // Chrome扩展的WebSocket API不支持自定义headers
  // 豆包WebSocket需要Authorization header，但浏览器WebSocket API不支持
  // 因此回退到HTTP模式
  console.warn('WebSocket模式需要Authorization header，但Chrome扩展WebSocket API不支持，回退到HTTP模式');
  return await handleDoubaoHTTPTTS(requestData);
}

// WebSocket二进制协议处理函数（暂时未使用，留作参考）
// 注意：Chrome扩展中的WebSocket有限制，这些函数暂时不会被调用

// 创建二进制消息（根据豆包WebSocket协议）
function createBinaryMessage(jsonPayload) {
  const payloadBytes = new TextEncoder().encode(jsonPayload);
  const payloadSize = payloadBytes.length;

  // 创建完整的消息：4字节header + payload size(4字节) + payload
  const totalSize = 4 + 4 + payloadSize;
  const message = new ArrayBuffer(totalSize);
  const view = new DataView(message);
  const messageBytes = new Uint8Array(message);

  // 按照豆包协议构建header（4字节）
  // Byte 0: 协议版本(4bit) + Header size(4bit) = 0x11 (版本1, header size 1)
  view.setUint8(0, 0x11);

  // Byte 1: Message type(4bit) + Flags(4bit) = 0x10 (full client request, flags 0)
  view.setUint8(1, 0x10);

  // Byte 2: Serialization(4bit) + Compression(4bit) = 0x10 (JSON, 无压缩)
  view.setUint8(2, 0x10);

  // Byte 3: Reserved = 0x00
  view.setUint8(3, 0x00);

  // Payload size (4字节，大端序)
  view.setUint32(4, payloadSize, false);

  // Payload data
  messageBytes.set(payloadBytes, 8);

  return message;
}

// 解析二进制消息（根据官方代码）
function parseBinaryMessage(data) {
  const view = new DataView(data);

  // 解析header（参考官方parse_response函数）
  const byte0 = view.getUint8(0);
  const byte1 = view.getUint8(1);
  const byte2 = view.getUint8(2);
  const byte3 = view.getUint8(3);

  const protocolVersion = (byte0 >> 4) & 0x0F;
  const headerSize = byte0 & 0x0F;
  const messageType = (byte1 >> 4) & 0x0F;
  const messageTypeSpecificFlags = byte1 & 0x0F;
  const serializationMethod = (byte2 >> 4) & 0x0F;
  const messageCompression = byte2 & 0x0F;
  const reserved = byte3;

  console.log('解析WebSocket消息:', {
    protocolVersion,
    headerSize,
    messageType: '0x' + messageType.toString(16),
    messageTypeSpecificFlags,
    serializationMethod,
    messageCompression,
    reserved: '0x' + reserved.toString(16).padStart(2, '0')
  });

  const headerSizeBytes = headerSize * 4;

  if (messageType === 0x0B) {
    // Audio-only server response（参考官方代码）
    if (messageTypeSpecificFlags === 0) {
      // no sequence number as ACK
      console.log('收到ACK消息，无音频数据');
      return { sequence: 0 };
    } else {
      // 有sequence number
      const sequenceNumber = view.getInt32(headerSizeBytes, false); // 大端序，有符号
      const payloadSize = view.getUint32(headerSizeBytes + 4, false); // 大端序，无符号
      const audioData = data.slice(headerSizeBytes + 8); // 跳过sequence number和payload size

      console.log('音频数据:', {
        sequenceNumber,
        payloadSize,
        actualAudioSize: audioData.byteLength
      });

      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));

      return {
        audio: base64Audio,
        sequence: sequenceNumber
      };
    }
  } else if (messageType === 0x0F) {
    // Error message
    const code = view.getUint32(headerSizeBytes, false);
    const msgSize = view.getUint32(headerSizeBytes + 4, false);
    let errorMsg = data.slice(headerSizeBytes + 8);

    // 如果有压缩，需要解压（这里简化处理）
    const errorString = new TextDecoder().decode(errorMsg);

    console.error('服务器错误:', { code, msgSize, errorString });
    throw new Error(`豆包TTS服务器错误 (${code}): ${errorString}`);
  } else if (messageType === 0x0C) {
    // Frontend server response
    const msgSize = view.getUint32(headerSizeBytes, false);
    const frontendMsg = data.slice(headerSizeBytes + 4);
    const msgString = new TextDecoder().decode(frontendMsg);

    console.log('前端消息:', { msgSize, message: msgString });
    return { frontendMessage: msgString };
  } else {
    console.warn('未知消息类型:', messageType);
    return { unknownType: messageType };
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
    ttsAppid: '',
    websocketMode: false,
    concurrentMode: true
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
        ttsAppid: '',
        websocketMode: false,
        concurrentMode: true
      });
    }
  });
});