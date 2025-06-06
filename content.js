// 全局变量
let settings = {
  voiceType: 'zh-CN-XiaoxiaoNeural',
  rate: 1.0,
  pitch: 1.0,
  autoNext: true,
  emotion: 'neutral',
  customVoiceType: ''
};
let isPlaying = false;
let isPaused = false;
let currentPostIndex = 0;
let posts = [];
let currentSentenceIndex = 0;
let sentences = [];
let floatBtn;
let controlsPanel;
let statusDisplay;
let configBtn;
let speechSynthesis = window.speechSynthesis;
let utterance = null;
let audio = null; // 用于豆包TTS的全局audio对象

// 初始化
function init() {
  loadSettings();
  createUI();
  detectPosts();
  setupEventListeners();
}

// 加载设置
function loadSettings() {
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
    settings = items;
  });
}

// 创建UI元素
function createUI() {
  // 创建悬浮按钮
  floatBtn = document.createElement('div');
  floatBtn.className = 'scys-reader-float-btn';
  floatBtn.innerHTML = '▶';
  floatBtn.title = '开始朗读';
  document.body.appendChild(floatBtn);

  // 创建控制面板
  controlsPanel = document.createElement('div');
  controlsPanel.className = 'scys-reader-controls';
  controlsPanel.innerHTML = `
    <button id="scys-reader-prev">上一篇</button>
    <button id="scys-reader-next">下一篇</button>
    <button id="scys-reader-config">设置</button>
  `;
  document.body.appendChild(controlsPanel);

  // 创建状态显示
  statusDisplay = document.createElement('div');
  statusDisplay.className = 'scys-reader-status';
  document.body.appendChild(statusDisplay);
}

// 检测页面上的帖子
function detectPosts() {
  posts = Array.from(document.querySelectorAll('div.post-item'));
  if (posts.length > 0) {
    updateStatus(`检测到${posts.length}篇帖子`);
  } else {
    updateStatus('没有检测到帖子');
  }
}

// 设置事件监听器
function setupEventListeners() {
  // 悬浮按钮点击事件
  floatBtn.addEventListener('click', function() {
    if (isPlaying && !isPaused) {
      pauseReading();
    } else if (isPlaying && isPaused) {
      resumeReading();
    } else {
      startReading();
    }
    
    // 切换控制面板显示
    controlsPanel.classList.toggle('active');
  });

  // 上一篇按钮
  document.getElementById('scys-reader-prev').addEventListener('click', function() {
    if (currentPostIndex > 0) {
      stopReading();
      currentPostIndex--;
      startReading();
    } else {
      updateStatus('已经是第一篇');
    }
  });

  // 下一篇按钮
  document.getElementById('scys-reader-next').addEventListener('click', function() {
    if (currentPostIndex < posts.length - 1) {
      stopReading();
      currentPostIndex++;
      startReading();
    } else {
      goToNextPage();
    }
  });

  // 设置按钮
  document.getElementById('scys-reader-config').addEventListener('click', function() {
    chrome.runtime.sendMessage({action: 'openPopup'});
  });

  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'settingsUpdated') {
      loadSettings();
      if (isPlaying) {
        stopReading();
        startReading();
      }
    }
  });
}

// 开始朗读
function startReading() {
  if (posts.length === 0) {
    updateStatus('没有找到可朗读的内容');
    return;
  }

  isPlaying = true;
  isPaused = false;
  floatBtn.innerHTML = '❚❚';
  floatBtn.title = '暂停朗读';
  floatBtn.classList.add('playing');
  floatBtn.classList.remove('paused');

  const post = posts[currentPostIndex];
  
  // 获取作者信息
  const authorElement = post.querySelector('div.post-item-top-right div span.name');
  const authorIdentity = post.querySelector('div.post-item-top-right div span.identity');
  
  let authorInfo = '';
  if (authorElement) {
    authorInfo += `作者: ${authorElement.textContent}`;
    if (authorIdentity) {
      authorInfo += `, ${authorIdentity.textContent}`;
    }
    authorInfo += '. ';
  }

  // 获取正文内容
  const contentElement = post.querySelector('div.post-content.preview');
  if (!contentElement) {
    updateStatus('无法获取帖子内容');
    return;
  }

  // 高亮当前阅读的帖子
  posts.forEach(p => p.classList.remove('scys-reader-highlight'));
  post.classList.add('scys-reader-highlight');
  post.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 准备文本
  const text = authorInfo + contentElement.innerText;
  sentences = splitIntoSentences(text);
  currentSentenceIndex = 0;

  updateStatus(`正在朗读: ${authorInfo ? authorInfo : '未知作者'}`);
  readNextSentence();
}

// 暂停朗读
function pauseReading() {
  if (speechSynthesis && isPlaying && !settings.voiceType.startsWith('zh_')) {
    speechSynthesis.pause();
    isPaused = true;
    floatBtn.innerHTML = '▶';
    floatBtn.title = '继续朗读';
    floatBtn.classList.add('paused');
    updateStatus('已暂停');
  } else if (audio && !audio.paused) {
    audio.pause();
    isPaused = true;
    floatBtn.innerHTML = '▶';
    floatBtn.title = '继续朗读';
    floatBtn.classList.add('paused');
    updateStatus('已暂停');
  }
}

// 继续朗读
function resumeReading() {
  if (speechSynthesis && isPlaying && isPaused && !settings.voiceType.startsWith('zh_')) {
    speechSynthesis.resume();
    isPaused = false;
    floatBtn.innerHTML = '❚❚';
    floatBtn.title = '暂停朗读';
    floatBtn.classList.remove('paused');
    updateStatus('继续朗读');
  } else if (audio && isPaused) {
    audio.play();
    isPaused = false;
    floatBtn.innerHTML = '❚❚';
    floatBtn.title = '暂停朗读';
    floatBtn.classList.remove('paused');
    updateStatus('继续朗读');
  }
}

// 停止朗读
function stopReading() {
  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio = null;
  }
  isPlaying = false;
  isPaused = false;
  floatBtn.innerHTML = '▶';
  floatBtn.title = '开始朗读';
  floatBtn.classList.remove('playing', 'paused');
  posts.forEach(p => p.classList.remove('scys-reader-highlight'));
  updateStatus('已停止朗读');
}

// 朗读下一句
function readNextSentence() {
  if (currentSentenceIndex >= sentences.length) {
    // 当前帖子朗读完毕
    if (currentPostIndex < posts.length - 1) {
      // 还有下一篇帖子
      currentPostIndex++;
      setTimeout(() => startReading(), 1000);
    } else {
      // 所有帖子都朗读完毕
      if (settings.autoNext) {
        goToNextPage();
      } else {
        stopReading();
        updateStatus('所有内容已朗读完毕');
      }
    }
    return;
  }

  const sentence = sentences[currentSentenceIndex];

  // 判断是否为豆包TTS
  if (settings.voiceType && settings.voiceType.startsWith('zh_')) {
    // 使用豆包TTS
    fetchDoubaoTTS(sentence, settings.voiceType, settings.rate, settings.pitch, settings.emotion).then(base64Audio => {
      playAudioFromBase64(base64Audio, () => {
        currentSentenceIndex++;
        readNextSentence();
      });
    }).catch(err => {
      console.error('豆包TTS错误:', err);
      currentSentenceIndex++;
      readNextSentence();
    });
    return;
  }

  // 默认用原生TTS
  utterance = new SpeechSynthesisUtterance(sentence);
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  const voices = speechSynthesis.getVoices();
  const selectedVoice = voices.find(voice => voice.name === settings.voiceType);
  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }
  if (settings.voiceType.startsWith('zh-CN')) {
    utterance.lang = 'zh-CN';
  } else if (settings.voiceType.startsWith('zh-HK')) {
    utterance.lang = 'zh-HK';
  } else if (settings.voiceType.startsWith('en')) {
    utterance.lang = 'en-US';
  }
  utterance.onend = function() {
    currentSentenceIndex++;
    readNextSentence();
  };
  utterance.onerror = function(event) {
    console.error('朗读错误:', event);
    currentSentenceIndex++;
    readNextSentence();
  };
  speechSynthesis.speak(utterance);
}

// 豆包TTS API请求（HTTP代理实现，自动分句并发+错误预处理）
function fetchDoubaoTTS(text, voice, speed, pitch, emotion) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get({ttsToken: '', ttsAppid: ''}, function(items) {
      const token = items.ttsToken;
      const appid = items.ttsAppid;
      if (!token || !appid) {
        reject('未配置豆包TTS Token或AppID');
        return;
      }
      // 自动分句
      const sentences = splitIntoSentences(text);
      if (sentences.length === 0) {
        reject('文本为空，无法朗读');
        return;
      }
      const maxConcurrency = 3;
      let current = 0;
      let results = new Array(sentences.length);
      let finished = 0;
      let hasError = false;
      function requestOne(index, retry = 0) {
        fetch('https://doubaospeaker-jrmsgzz7y-xcfcdls-projects.vercel.app/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appid: appid,
            token: token,
            text: sentences[index],
            voice: voice,
            speed: speed,
            pitch: pitch,
            emotion: emotion
          })
        })
        .then(resp => resp.json())
        .then(data => {
          if (data.audio) {
            results[index] = data.audio;
          } else {
            if (retry < 1) {
              requestOne(index, retry + 1);
              return;
            } else {
              results[index] = '';
            }
          }
        })
        .catch(err => {
          if (retry < 1) {
            requestOne(index, retry + 1);
            return;
          } else {
            results[index] = '';
          }
        })
        .finally(() => {
          finished++;
          if (current < sentences.length) {
            requestOne(current++);
          }
          if (finished === sentences.length) {
            // 拼接所有成功的base64
            const allAudio = results.filter(Boolean).join('');
            if (allAudio) {
              resolve(allAudio);
            } else {
              reject('TTS全部请求失败，请检查Token/AppID/网络');
            }
          }
        });
      }
      // 启动并发
      while (current < Math.min(maxConcurrency, sentences.length)) {
        requestOne(current++);
      }
    });
  });
}

// 播放base64音频
function playAudioFromBase64(base64, onended) {
  if (audio) {
    audio.pause();
    audio = null;
  }
  audio = new Audio('data:audio/wav;base64,' + base64);
  audio.onended = onended;
  audio.onerror = onended;
  audio.play();
}

// 转到下一页
function goToNextPage() {
  const nextPageButton = document.querySelector('#app > div.content-mt > div > div > main > div.post-list-container > div.pagination-container > div > ul > span.arco-pagination-item.arco-pagination-item-next');
  if (nextPageButton) {
    nextPageButton.click();
    updateStatus('正在加载下一页...');
    
    // 等待页面加载
    setTimeout(() => {
      detectPosts();
      currentPostIndex = 0;
      if (posts.length > 0) {
        startReading();
      } else {
        updateStatus('没有更多内容可朗读');
      }
    }, 2000);
  } else {
    stopReading();
    updateStatus('已到达最后一页');
  }
}

// 将文本分割成句子
function splitIntoSentences(text) {
  // 按照标点符号分割
  return text
    .replace(/([.。!！?？;；])+/g, '$1|')
    .split('|')
    .filter(sentence => sentence.trim().length > 0);
}

// 更新状态显示
function updateStatus(message) {
  statusDisplay.textContent = message;
  statusDisplay.classList.add('active');
  
  // 5秒后自动隐藏
  setTimeout(() => {
    statusDisplay.classList.remove('active');
  }, 5000);
}

// 等待语音列表加载完成
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = init;
} else {
  init();
}

// 页面变化监听，用于SPA网站
const observer = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // 检查是否有新的帖子加载
      const newPosts = document.querySelectorAll('div.post-item');
      if (newPosts.length !== posts.length) {
        detectPosts();
      }
    }
  });
});

// 开始监听DOM变化
observer.observe(document.body, { childList: true, subtree: true }); 
