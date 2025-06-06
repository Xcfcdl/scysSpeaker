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

  // 判断是否豆包TTS音色
  function isDoubaoVoiceType(val) {
    return val && val.startsWith('zh_');
  }

  // 根据音色显示/隐藏情感和自定义voice_type
  function updateDoubaoFields() {
    if (isDoubaoVoiceType(voiceType.value)) {
      emotionGroup.style.display = '';
      customVoiceGroup.style.display = '';
    } else {
      emotionGroup.style.display = 'none';
      customVoiceGroup.style.display = 'none';
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
    ttsAppid: ''
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
      ttsAppid: ttsAppid.value.trim()
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
    tokenTestStatus.textContent = '测试中...';
    tokenTestStatus.style.display = '';
    tokenTestStatus.style.color = '#333';

    fetch('https://doubaospeaker-jrmsgzz7y-xcfcdls-projects.vercel.app/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appid: appid,
        token: token,
        text: '配置成功',
        voice: 'zh_male_beijingxiaoye_emo_v2_mars_bigtts',
        speed: 1.0,
        pitch: 1.0,
        emotion: 'neutral'
      })
    })
    .then(resp => resp.json())
    .then(data => {
      if (data.audio) {
        const audio = new Audio('data:audio/mp3;base64,' + data.audio);
        audio.onended = function() {
          tokenTestStatus.textContent = 'Token可用，已朗读"配置成功"';
          tokenTestStatus.style.color = 'green';
        };
        audio.onerror = function() {
          tokenTestStatus.textContent = '音频播放失败';
          tokenTestStatus.style.color = 'red';
        };
        audio.play();
      } else {
        tokenTestStatus.textContent = 'Token或AppID无效或接口异常：' + (data.message || '未知错误');
        tokenTestStatus.style.color = 'red';
      }
    })
    .catch(e => {
      tokenTestStatus.textContent = '请求失败: ' + e.toString();
      tokenTestStatus.style.color = 'red';
    });
  });
}); 
