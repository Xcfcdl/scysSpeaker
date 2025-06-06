document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const voiceType = document.getElementById('voice-type');
  const rate = document.getElementById('rate');
  const rateValue = document.getElementById('rate-value');
  const pitch = document.getElementById('pitch');
  const pitchValue = document.getElementById('pitch-value');
  const autoNext = document.getElementById('auto-next');
  const saveButton = document.getElementById('save-settings');
  const status = document.getElementById('status');
  const emotionGroup = document.getElementById('emotion-group');
  const emotion = document.getElementById('emotion');
  const customVoiceGroup = document.getElementById('custom-voice-group');
  const customVoiceType = document.getElementById('custom-voice-type');
  const ttsToken = document.getElementById('tts-token');
  const testTokenBtn = document.getElementById('test-tts-token');
  const tokenTestStatus = document.getElementById('token-test-status');
  const ttsAppid = document.getElementById('tts-appid');
  const websocketModeGroup = document.getElementById('websocket-mode-group');
  const websocketMode = document.getElementById('websocket-mode');

  // 判断是否豆包TTS音色
  function isDoubaoVoiceType(val) {
    return val && val.startsWith('zh_');
  }

  // 根据音色显示/隐藏情感和自定义voice_type
  function updateDoubaoFields() {
    if (isDoubaoVoiceType(voiceType.value)) {
      emotionGroup.style.display = '';
      customVoiceGroup.style.display = '';
      websocketModeGroup.style.display = '';
    } else {
      emotionGroup.style.display = 'none';
      customVoiceGroup.style.display = 'none';
      websocketModeGroup.style.display = 'none';
    }
  }

  // 加载保存的设置
  chrome.storage.sync.get({
    voiceType: 'zh-CN-XiaoxiaoNeural',
    rate: 1.0,
    pitch: 1.0,
    autoNext: true,
    emotion: 'neutral',
    customVoiceType: '',
    ttsToken: '',
    ttsAppid: '',
    websocketMode: false
  }, function(items) {
    voiceType.value = items.voiceType;
    rate.value = items.rate;
    rateValue.textContent = items.rate.toFixed(1);
    pitch.value = items.pitch;
    pitchValue.textContent = items.pitch.toFixed(1);
    autoNext.value = items.autoNext.toString();
    emotion.value = items.emotion || 'neutral';
    customVoiceType.value = items.customVoiceType || '';
    ttsToken.value = items.ttsToken || '';
    ttsAppid.value = items.ttsAppid || '';
    websocketMode.value = items.websocketMode ? 'true' : 'false';
    updateDoubaoFields();
  });

  // 音色切换时动态显示/隐藏
  voiceType.addEventListener('change', updateDoubaoFields);

  // 更新滑块值显示
  rate.addEventListener('input', function() {
    rateValue.textContent = parseFloat(rate.value).toFixed(1);
  });

  pitch.addEventListener('input', function() {
    pitchValue.textContent = parseFloat(pitch.value).toFixed(1);
  });

  // 保存设置
  saveButton.addEventListener('click', function() {
    let saveVoiceType = voiceType.value;
    // 如果自定义voice_type有值，优先用自定义
    if (isDoubaoVoiceType(voiceType.value) && customVoiceType.value.trim()) {
      saveVoiceType = customVoiceType.value.trim();
    }
    chrome.storage.sync.set({
      voiceType: saveVoiceType,
      rate: parseFloat(rate.value),
      pitch: parseFloat(pitch.value),
      autoNext: autoNext.value === 'true',
      emotion: emotion.value,
      customVoiceType: customVoiceType.value.trim(),
      ttsToken: ttsToken.value.trim(),
      ttsAppid: ttsAppid.value.trim(),
      websocketMode: websocketMode.value === 'true'
    }, function() {
      // 更新状态
      status.textContent = '设置已保存';
      setTimeout(function() {
        status.textContent = '';
      }, 1500);

      // 通知content script设置已更新
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0].url.includes('scys.com')) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'settingsUpdated'
          });
        }
      });
    });
  });

  testTokenBtn.addEventListener('click', function() {
    const token = ttsToken.value.trim();
    const appid = ttsAppid.value.trim();
    if (!token || !appid) {
      tokenTestStatus.textContent = '请先填写Token和AppID';
      tokenTestStatus.style.display = '';
      tokenTestStatus.style.color = 'red';
      return;
    }

    // 获取当前选择的配置
    let testVoiceType = voiceType.value;
    // 如果是豆包音色且有自定义voice_type，使用自定义的
    if (isDoubaoVoiceType(voiceType.value) && customVoiceType.value.trim()) {
      testVoiceType = customVoiceType.value.trim();
    }

    // 检查是否选择了豆包音色
    if (!isDoubaoVoiceType(testVoiceType)) {
      tokenTestStatus.textContent = '请选择豆包音色进行测试（以"zh_"开头的音色）';
      tokenTestStatus.style.display = '';
      tokenTestStatus.style.color = 'red';
      return;
    }

    const testEmotion = emotion.value || 'neutral';
    const testSpeed = parseFloat(rate.value) || 1.0;
    const useWebSocket = websocketMode.value === 'true';

    tokenTestStatus.textContent = '测试中...';
    tokenTestStatus.style.display = '';
    tokenTestStatus.style.color = '#333';

    // 通过background script测试豆包TTS，使用当前选择的配置
    chrome.runtime.sendMessage({
      action: 'testDoubaoTTS',
      data: {
        appid: appid,
        token: token,
        text: '配置成功，当前音色测试',
        voice_type: testVoiceType,
        speed_ratio: testSpeed,
        encoding: 'mp3',
        emotion: testEmotion,
        websocketMode: useWebSocket
      }
    }, function(response) {
      if (chrome.runtime.lastError) {
        tokenTestStatus.textContent = '扩展通信错误: ' + chrome.runtime.lastError.message;
        tokenTestStatus.style.color = 'red';
        return;
      }

      if (response && response.success) {
        const audio = new Audio('data:audio/mp3;base64,' + response.data.audio);
        audio.onended = function() {
          const modeText = useWebSocket ? 'WebSocket模式' : 'HTTP模式';
          tokenTestStatus.textContent = `Token可用，${modeText}，音色: ${testVoiceType}，情感: ${testEmotion}，语速: ${testSpeed}`;
          tokenTestStatus.style.color = 'green';
        };
        audio.onerror = function() {
          tokenTestStatus.textContent = '音频播放失败';
          tokenTestStatus.style.color = 'red';
        };
        audio.play();
      } else {
        tokenTestStatus.textContent = 'Token或AppID无效或接口异常：' + (response ? response.error : '未知错误');
        tokenTestStatus.style.color = 'red';
      }
    });
  });
}); 
