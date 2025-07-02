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
  const concurrentModeGroup = document.getElementById('concurrent-mode-group');
  const concurrentMode = document.getElementById('concurrent-mode');

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
      updateConcurrentModeVisibility();
    } else {
      emotionGroup.style.display = 'none';
      customVoiceGroup.style.display = 'none';
      websocketModeGroup.style.display = 'none';
      concurrentModeGroup.style.display = 'none';
    }
  }

  // 根据WebSocket模式显示/隐藏并发模式选项
  function updateConcurrentModeVisibility() {
    if (isDoubaoVoiceType(voiceType.value)) {
      // WebSocket模式下隐藏并发模式选项，因为WebSocket本身就是流式的
      if (websocketMode.value === 'true') {
        concurrentModeGroup.style.display = 'none';
      } else {
        concurrentModeGroup.style.display = '';
      }
    } else {
      concurrentModeGroup.style.display = 'none';
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
    websocketMode: false,
    concurrentMode: true
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
    concurrentMode.value = items.concurrentMode ? 'true' : 'false';
    updateDoubaoFields();
  });

  // 音色切换时动态显示/隐藏
  voiceType.addEventListener('change', updateDoubaoFields);

  // WebSocket模式切换时更新并发模式显示
  websocketMode.addEventListener('change', updateConcurrentModeVisibility);

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
      websocketMode: websocketMode.value === 'true',
      concurrentMode: concurrentMode.value === 'true'
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
    // 获取当前选择的配置
    let testVoiceType = voiceType.value;
    // 如果是豆包音色且有自定义voice_type，使用自定义的
    if (isDoubaoVoiceType(voiceType.value) && customVoiceType.value.trim()) {
      testVoiceType = customVoiceType.value.trim();
    }

    // 判断是否为原生TTS
    if (!isDoubaoVoiceType(testVoiceType)) {
      // 原生TTS测试逻辑
      tokenTestStatus.textContent = '测试中...';
      tokenTestStatus.style.display = '';
      tokenTestStatus.style.color = '#333';
      const synth = window.speechSynthesis;
      const voices = synth.getVoices();
      // 查找匹配的语音
      let selectedVoice = voices.find(voice => voice.name === testVoiceType);
      if (!selectedVoice) {
        tokenTestStatus.textContent = '未找到该音色，请检查浏览器是否支持';
        tokenTestStatus.style.color = 'red';
        return;
      }
      const utter = new SpeechSynthesisUtterance('原生TTS配置成功，当前音色测试');
      utter.voice = selectedVoice;
      utter.rate = parseFloat(rate.value) || 1.0;
      utter.pitch = parseFloat(pitch.value) || 1.0;
      utter.onend = function() {
        tokenTestStatus.textContent = `原生TTS可用，音色: ${selectedVoice.name}，语速: ${utter.rate}`;
        tokenTestStatus.style.color = 'green';
      };
      utter.onerror = function() {
        tokenTestStatus.textContent = '原生TTS朗读失败';
        tokenTestStatus.style.color = 'red';
      };
      synth.speak(utter);
      return;
    }

    // 豆包TTS测试逻辑
    const token = ttsToken.value.trim();
    const appid = ttsAppid.value.trim();
    if (!token || !appid) {
      tokenTestStatus.textContent = '请先填写Token和AppID';
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

  // 动态插入原生TTS音色选项
  function insertNativeVoices() {
    const select = voiceType;
    // 先移除所有原生TTS选项（保留豆包TTS）
    while (select.firstChild && (!select.firstChild.value || !select.firstChild.value.startsWith('zh_'))) {
      select.removeChild(select.firstChild);
    }
    // 获取浏览器支持的语音
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    // Microsoft Neural中文名映射表
    const msVoiceNameMap = {
      'Microsoft Xiaoxiao Online (Natural)': '晓晓（女声，普通话）',
      'Microsoft Yunxi Online (Natural)': '云希（男声，普通话）',
      'Microsoft Xiaoyi Online (Natural)': '小依（女声，普通话）',
      'Microsoft Yunjian Online (Natural)': '云健（男声，普通话）',
      'Microsoft Yunxia Online (Natural)': '云夏（女声，普通话）',
      'Microsoft Yunyang Online (Natural)': '云扬（男声，普通话）',
      'Microsoft WanLung Online (Natural)': '云龙（男声，粤语）',
      'Microsoft HiuGaai Online (Natural)': '晓佳（女声，粤语）',
      'Microsoft HiuMaan Online (Natural)': '晓曼（女声，粤语）'
    };
    // 只保留Microsoft Neural系列中的中文音色
    const msVoices = voices.filter(v => v.name.includes('Microsoft') && v.name.toLowerCase().includes('natural') && v.lang.startsWith('zh'));
    msVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      // 中文名优先，否则用原名
      opt.textContent = msVoiceNameMap[v.name] || `${v.lang} - ${v.name}`;
      opt.setAttribute('data-lang', v.lang);
      opt.title = v.name;
      select.insertBefore(opt, select.firstChild);
    });
    // 系统本地TTS：只显示当前默认语音（即voices.find(v => v.default)）
    const defaultVoice = voices.find(v => v.default && (v.lang.startsWith('zh') || v.lang.startsWith('zh-')));
    if (defaultVoice && !msVoices.some(v => v.name === defaultVoice.name)) {
      const opt = document.createElement('option');
      opt.value = defaultVoice.name;
      opt.textContent = `${defaultVoice.lang} - ${defaultVoice.name}（系统默认）`;
      opt.setAttribute('data-lang', defaultVoice.lang);
      select.insertBefore(opt, select.firstChild);
    }
  }
  // 语音列表加载后插入
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = insertNativeVoices;
  }
  // DOM加载后也尝试插入一次
  insertNativeVoices();
}); 
