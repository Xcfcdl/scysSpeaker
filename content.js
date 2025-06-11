// 全局变量
let settings = {
  voiceType: 'zh-CN-XiaoxiaoNeural',
  rate: 1.0,
  pitch: 1.0,
  autoNext: true,
  emotion: 'neutral',
  customVoiceType: '',
  concurrentMode: true // 是否启用三段式并发播放
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

// 三段式并发播放相关变量
let audioQueue = []; // 音频队列：存储已准备好的音频数据
let isRequestingAudio = false; // 是否正在请求音频
let maxQueueSize = 3; // 最大队列大小（预加载句子数量）

// 悬浮按钮拖动相关变量
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let buttonStartX = 0;
let buttonStartY = 0;
let dragThreshold = 5; // 拖动阈值，小于此值认为是点击
let hasDragged = false;
let buttonPosition = { x: null, y: null }; // 保存按钮位置

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
    ttsAppid: '',
    websocketMode: false
  }, function(items) {
    settings = items;
  });
}

// 加载按钮位置
function loadButtonPosition() {
  chrome.storage.local.get(['buttonPosition'], function(result) {
    if (result.buttonPosition) {
      buttonPosition = result.buttonPosition;
      applyButtonPosition();
    } else {
      // 默认位置
      setButtonPosition(window.innerWidth - 70, window.innerHeight - 150);
    }
  });
}

// 保存按钮位置
function saveButtonPosition() {
  chrome.storage.local.set({ buttonPosition: buttonPosition });
}

// 应用按钮位置
function applyButtonPosition() {
  if (buttonPosition.x !== null && buttonPosition.y !== null) {
    floatBtn.style.left = buttonPosition.x + 'px';
    floatBtn.style.top = buttonPosition.y + 'px';
    floatBtn.style.right = 'auto';
    floatBtn.style.bottom = 'auto';
  }
}

// 设置按钮位置
function setButtonPosition(x, y) {
  // 确保按钮在可视区域内
  const btnWidth = 50;
  const btnHeight = 50;
  const margin = 10;

  x = Math.max(margin, Math.min(x, window.innerWidth - btnWidth - margin));
  y = Math.max(margin, Math.min(y, window.innerHeight - btnHeight - margin));

  buttonPosition.x = x;
  buttonPosition.y = y;
  applyButtonPosition();
  saveButtonPosition();
}

// 停靠到边缘
function snapToEdge() {
  const btnRect = floatBtn.getBoundingClientRect();
  const centerX = btnRect.left + btnRect.width / 2;
  const centerY = btnRect.top + btnRect.height / 2;

  // 判断距离哪个边缘更近
  const distanceToLeft = centerX;
  const distanceToRight = window.innerWidth - centerX;
  const distanceToTop = centerY;
  const distanceToBottom = window.innerHeight - centerY;

  const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);

  let newX = buttonPosition.x;
  let newY = buttonPosition.y;

  if (minDistance === distanceToLeft) {
    // 停靠到左边
    newX = 10;
  } else if (minDistance === distanceToRight) {
    // 停靠到右边
    newX = window.innerWidth - 60;
  } else if (minDistance === distanceToTop) {
    // 停靠到顶部
    newY = 10;
  } else {
    // 停靠到底部
    newY = window.innerHeight - 60;
  }

  setButtonPosition(newX, newY);

  // 添加停靠动画
  floatBtn.style.transition = 'all 0.3s ease';
  setTimeout(() => {
    floatBtn.style.transition = '';
  }, 300);
}

// 创建UI元素
function createUI() {
  // 创建悬浮按钮
  floatBtn = document.createElement('div');
  floatBtn.className = 'scys-reader-float-btn';

  // 创建logo图标
  const logoImg = document.createElement('img');
  logoImg.src = chrome.runtime.getURL('logo.svg');
  logoImg.alt = '朗读';
  logoImg.style.width = '30px';
  logoImg.style.height = '30px';

  floatBtn.appendChild(logoImg);
  floatBtn.title = '开始朗读';

  // 从存储中恢复按钮位置
  loadButtonPosition();

  document.body.appendChild(floatBtn);

  // 创建控制面板
  controlsPanel = document.createElement('div');
  controlsPanel.className = 'scys-reader-controls';
  controlsPanel.innerHTML = `
    <div class="scys-reader-controls-header">
      <span>朗读控制</span>
      <button id="scys-reader-close" class="close-btn">×</button>
    </div>
    <div class="scys-reader-controls-body">
      <button id="scys-reader-prev">上一篇</button>
      <button id="scys-reader-next">下一篇</button>
      <button id="scys-reader-stop">停止</button>
      <button id="scys-reader-config">设置</button>
    </div>
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
  // 悬浮按钮鼠标事件（支持拖动）
  floatBtn.addEventListener('mousedown', handleMouseDown);
  floatBtn.addEventListener('click', handleButtonClick);
  floatBtn.addEventListener('contextmenu', handleRightClick);
  floatBtn.addEventListener('mouseenter', handleMouseEnter);
  floatBtn.addEventListener('mouseleave', handleMouseLeave);

  // 控制面板鼠标事件（保持显示）
  controlsPanel.addEventListener('mouseenter', handlePanelMouseEnter);
  controlsPanel.addEventListener('mouseleave', handlePanelMouseLeave);

  // 全局鼠标事件
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // 控制面板按钮事件（使用事件委托避免重复绑定）
  controlsPanel.addEventListener('click', function(e) {
    const target = e.target;

    if (target.id === 'scys-reader-prev') {
      if (currentPostIndex > 0) {
        stopReading();
        currentPostIndex--;
        startReading();
      } else {
        updateStatus('已经是第一篇');
      }
    } else if (target.id === 'scys-reader-next') {
      if (currentPostIndex < posts.length - 1) {
        stopReading();
        currentPostIndex++;
        startReading();
      } else {
        goToNextPage();
      }
    } else if (target.id === 'scys-reader-stop') {
      stopReading();
      controlsPanel.classList.remove('active');
    } else if (target.id === 'scys-reader-config') {
      chrome.runtime.sendMessage({action: 'openPopup'});
    } else if (target.id === 'scys-reader-close') {
      controlsPanel.classList.remove('active');
    }
  });

  // 窗口大小改变时重新调整按钮位置
  window.addEventListener('resize', function() {
    if (buttonPosition.x !== null && buttonPosition.y !== null) {
      setButtonPosition(buttonPosition.x, buttonPosition.y);
    }
  });

  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener(function(request) {
    if (request.action === 'settingsUpdated') {
      loadSettings();
      if (isPlaying) {
        stopReading();
        startReading();
      }
    }
  });
}

// 处理鼠标按下事件
function handleMouseDown(e) {
  e.preventDefault();
  isDragging = true;
  hasDragged = false;

  dragStartX = e.clientX;
  dragStartY = e.clientY;

  const rect = floatBtn.getBoundingClientRect();
  buttonStartX = rect.left;
  buttonStartY = rect.top;

  floatBtn.style.transition = 'none';
  floatBtn.style.cursor = 'grabbing';
}

// 处理鼠标移动事件
function handleMouseMove(e) {
  if (!isDragging) return;

  e.preventDefault();

  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;

  // 检查是否超过拖动阈值
  if (!hasDragged && (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold)) {
    hasDragged = true;
  }

  if (hasDragged) {
    const newX = buttonStartX + deltaX;
    const newY = buttonStartY + deltaY;

    // 实时更新位置（不保存）
    floatBtn.style.left = newX + 'px';
    floatBtn.style.top = newY + 'px';
    floatBtn.style.right = 'auto';
    floatBtn.style.bottom = 'auto';
  }
}

// 处理鼠标释放事件
function handleMouseUp(e) {
  if (!isDragging) return;

  isDragging = false;
  floatBtn.style.cursor = 'pointer';

  if (hasDragged) {
    // 拖动结束，保存位置并停靠到边缘
    const rect = floatBtn.getBoundingClientRect();
    buttonPosition.x = rect.left;
    buttonPosition.y = rect.top;

    snapToEdge();
  }
}

// 处理按钮点击事件
function handleButtonClick(e) {
  // 如果刚刚拖动过，不触发点击事件
  if (hasDragged) {
    hasDragged = false;
    return;
  }

  e.preventDefault();

  if (isPlaying && !isPaused) {
    pauseReading();
  } else if (isPlaying && isPaused) {
    resumeReading();
  } else {
    startReading();
  }
}

// 处理右键点击事件
function handleRightClick(e) {
  e.preventDefault();
  // 右键点击时切换控制面板显示状态
  controlsPanel.classList.toggle('active');

  if (controlsPanel.classList.contains('active')) {
    positionControlsPanel();
  }
}

// 处理鼠标进入悬浮按钮事件
function handleMouseEnter(e) {
  // 如果正在拖动，不显示控制面板
  if (isDragging) return;

  // 显示控制面板
  controlsPanel.classList.add('active');
  positionControlsPanel();
}

// 处理鼠标离开悬浮按钮事件
function handleMouseLeave(e) {
  // 延迟隐藏，给用户时间移动到控制面板
  setTimeout(() => {
    // 检查鼠标是否在控制面板上
    if (!controlsPanel.matches(':hover')) {
      controlsPanel.classList.remove('active');
    }
  }, 100);
}

// 处理鼠标进入控制面板事件
function handlePanelMouseEnter(e) {
  // 保持控制面板显示
  controlsPanel.classList.add('active');
}

// 处理鼠标离开控制面板事件
function handlePanelMouseLeave(e) {
  // 延迟隐藏控制面板
  setTimeout(() => {
    // 检查鼠标是否在悬浮按钮上
    if (!floatBtn.matches(':hover')) {
      controlsPanel.classList.remove('active');
    }
  }, 100);
}

// 定位控制面板到悬浮按钮上方
function positionControlsPanel() {
  const btnRect = floatBtn.getBoundingClientRect();
  const panelWidth = 220;
  const panelHeight = 140;

  // 默认显示在按钮上方
  let panelX = btnRect.left + (btnRect.width - panelWidth) / 2; // 居中对齐
  let panelY = btnRect.top - panelHeight - 10; // 上方10px间距

  // 确保不超出屏幕左右边界
  panelX = Math.max(10, Math.min(panelX, window.innerWidth - panelWidth - 10));

  // 如果上方空间不够，显示在下方
  if (panelY < 10) {
    panelY = btnRect.bottom + 10;
  }

  // 确保不超出屏幕上下边界
  panelY = Math.max(10, Math.min(panelY, window.innerHeight - panelHeight - 10));

  controlsPanel.style.left = panelX + 'px';
  controlsPanel.style.top = panelY + 'px';
  controlsPanel.style.right = 'auto';
  controlsPanel.style.bottom = 'auto';
}

// 开始朗读
function startReading() {
  if (posts.length === 0) {
    updateStatus('没有找到可朗读的内容');
    return;
  }

  isPlaying = true;
  isPaused = false;
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

  // 准备文本并清洗内容
  const rawText = authorInfo + contentElement.innerText;
  const cleanedText = cleanTextContent(rawText);
  sentences = splitIntoSentences(cleanedText);
  currentSentenceIndex = 0;

  // 初始化三段式并发播放状态
  audioQueue = [];
  isRequestingAudio = false;

  updateStatus(`正在朗读: ${authorInfo ? authorInfo : '未知作者'}`);
  readNextSentence();
}

// 暂停朗读
function pauseReading() {
  if (speechSynthesis && isPlaying && !isDoubaoTTS(settings.voiceType)) {
    speechSynthesis.pause();
    isPaused = true;
    floatBtn.title = '继续朗读';
    floatBtn.classList.add('paused');
    updateStatus('已暂停');
  } else if (audio && !audio.paused) {
    audio.pause();
    isPaused = true;
    floatBtn.title = '继续朗读';
    floatBtn.classList.add('paused');
    updateStatus('已暂停');
  }
}

// 继续朗读
function resumeReading() {
  if (speechSynthesis && isPlaying && isPaused && !isDoubaoTTS(settings.voiceType)) {
    speechSynthesis.resume();
    isPaused = false;
    floatBtn.title = '暂停朗读';
    floatBtn.classList.remove('paused');
    updateStatus('继续朗读');
  } else if (audio && isPaused) {
    audio.play();
    isPaused = false;
    floatBtn.title = '暂停朗读';
    floatBtn.classList.remove('paused');
    updateStatus('继续朗读');
  }
}

// 停止朗读
function stopReading() {
  // 设置停止标志，防止onerror事件继续播放
  isPlaying = false;

  if (speechSynthesis) {
    speechSynthesis.cancel();
  }
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio = null;
  }

  // 清理三段式并发播放的状态
  audioQueue = [];
  isRequestingAudio = false;

  isPaused = false;
  floatBtn.title = '开始朗读';
  floatBtn.classList.remove('playing', 'paused');
  posts.forEach(p => p.classList.remove('scys-reader-highlight'));
  updateStatus('已停止朗读');
}

// 朗读下一句（三段式并发版本）
function readNextSentence() {
  // 检查是否已经停止播放
  if (!isPlaying) {
    return;
  }

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

  // 判断是否为豆包TTS
  if (isDoubaoTTS(settings.voiceType)) {
    // 如果启用WebSocket模式，使用整段文本流式播放
    if (settings.websocketMode) {
      readWithWebSocketMode();
    } else {
      // 根据配置决定是否使用三段式并发播放
      if (settings.concurrentMode) {
        readNextSentenceWithQueue();
      } else {
        readNextSentenceSerial();
      }
    }
    return;
  }

  // 使用原生TTS（Microsoft Neural音色等）
  const sentence = sentences[currentSentenceIndex];
  utterance = new SpeechSynthesisUtterance(sentence);
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;

  // 获取可用的语音列表
  const voices = speechSynthesis.getVoices();

  // 检查语音列表是否已加载
  if (voices.length === 0) {
    console.warn('语音列表尚未加载，等待加载完成...');
    // 等待语音列表加载完成后重试
    setTimeout(() => {
      readNextSentence();
    }, 100);
    return;
  }

  // 只在第一次或调试时显示完整列表
  if (currentSentenceIndex === 0) {
    console.log('可用语音总数:', voices.length);
    // 显示中文和英文相关的语音
    const relevantVoices = voices.filter(v =>
      v.lang.includes('zh') || v.lang.includes('en') ||
      v.name.toLowerCase().includes('chinese') ||
      v.name.toLowerCase().includes('neural') ||
      v.name.toLowerCase().includes('microsoft')
    );
    console.log('相关语音列表:', relevantVoices.map(v => ({ name: v.name, lang: v.lang })));
  }

  console.log('正在查找音色:', settings.voiceType);

  // 查找匹配的语音
  let selectedVoice = voices.find(voice => voice.name === settings.voiceType);
  console.log('精确匹配结果:', selectedVoice ? selectedVoice.name : '未找到');

  // 如果没找到精确匹配，尝试多种匹配策略
  if (!selectedVoice && isMicrosoftNeural(settings.voiceType)) {
    console.log('尝试匹配Microsoft Neural音色:', settings.voiceType);

    // 创建音色映射表
    const voiceMapping = {
      'zh-CN-XiaoxiaoNeural': ['Microsoft Xiaoxiao Online (Natural)', 'Xiaoxiao'],
      'zh-CN-YunxiNeural': ['Microsoft Yunxi Online (Natural)', 'Yunxi'],
      'zh-CN-XiaoyiNeural': ['Microsoft Xiaoyi Online (Natural)', 'Xiaoyi'],
      'zh-CN-YunjianNeural': ['Microsoft Yunjian Online (Natural)', 'Yunjian'],
      'zh-CN-YunxiaNeural': ['Microsoft Yunxia Online (Natural)', 'Yunxia'],
      'zh-CN-YunyangNeural': ['Microsoft Yunyang Online (Natural)', 'Yunyang'],
      'zh-HK-HiuGaaiNeural': ['Microsoft HiuGaai Online (Natural)', 'HiuGaai'],
      'zh-HK-HiuMaanNeural': ['Microsoft HiuMaan Online (Natural)', 'HiuMaan'],
      'zh-HK-WanLungNeural': ['Microsoft WanLung Online (Natural)', 'WanLung'],
      'en-US-AriaNeural': ['Microsoft Aria Online (Natural)', 'Aria'],
      'en-US-GuyNeural': ['Microsoft Guy Online (Natural)', 'Guy']
    };

    // 策略1: 使用映射表精确匹配
    const mappedNames = voiceMapping[settings.voiceType];
    console.log('映射表查找:', settings.voiceType, '→', mappedNames);
    if (mappedNames) {
      for (const mappedName of mappedNames) {
        console.log('尝试匹配:', mappedName);
        selectedVoice = voices.find(voice =>
          voice.name.includes(mappedName)
        );
        if (selectedVoice) {
          console.log('策略1映射匹配成功:', selectedVoice.name);
          break;
        } else {
          console.log('未找到包含', mappedName, '的语音');
        }
      }
    } else {
      console.log('音色不在映射表中');
    }

    // 策略2: 匹配音色名称部分（如 YunxiNeural -> Yunxi）
    if (!selectedVoice) {
      const voiceName = settings.voiceType.split('-')[2]; // 获取 YunxiNeural 部分
      console.log('策略2: 提取音色名称部分:', voiceName);
      if (voiceName) {
        const cleanName = voiceName.replace('Neural', ''); // 移除 Neural 后缀
        console.log('策略2: 清理后的名称:', cleanName);
        selectedVoice = voices.find(voice =>
          voice.name.toLowerCase().includes(cleanName.toLowerCase()) &&
          voice.name.toLowerCase().includes('microsoft') &&
          voice.name.toLowerCase().includes('natural')
        );
        if (selectedVoice) {
          console.log('策略2名称匹配成功:', selectedVoice.name);
        } else {
          console.log('策略2: 未找到匹配的Microsoft Natural音色');
        }
      }
    }

    // 策略3: 匹配语言的任意Neural音色
    if (!selectedVoice) {
      const lang = settings.voiceType.startsWith('zh-CN') ? 'zh-CN' :
                   settings.voiceType.startsWith('zh-HK') ? 'zh-HK' :
                   settings.voiceType.startsWith('en-US') ? 'en-US' : '';

      if (lang) {
        selectedVoice = voices.find(voice =>
          voice.lang === lang &&
          voice.name.toLowerCase().includes('microsoft') &&
          voice.name.toLowerCase().includes('natural')
        );
        if (selectedVoice) {
          console.log('策略3语言匹配成功（使用默认Neural音色）:', selectedVoice.name);
        }
      }
    }

    // 策略4: 匹配语言的任意音色
    if (!selectedVoice) {
      const lang = settings.voiceType.startsWith('zh-CN') ? 'zh-CN' :
                   settings.voiceType.startsWith('zh-HK') ? 'zh-HK' :
                   settings.voiceType.startsWith('en-US') ? 'en-US' : '';

      if (lang) {
        selectedVoice = voices.find(voice => voice.lang === lang);
        if (selectedVoice) {
          console.log('策略4语言匹配成功（使用任意音色）:', selectedVoice.name);
        }
      }
    }
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    console.log('选择的语音:', selectedVoice.name, selectedVoice.lang);
  } else {
    console.warn('未找到匹配的语音:', settings.voiceType);
    // 使用默认语音
    if (settings.voiceType.startsWith('zh-CN')) {
      utterance.lang = 'zh-CN';
    } else if (settings.voiceType.startsWith('zh-HK')) {
      utterance.lang = 'zh-HK';
    } else if (settings.voiceType.startsWith('en')) {
      utterance.lang = 'en-US';
    }
  }

  // 设置语言
  if (settings.voiceType.startsWith('zh-CN')) {
    utterance.lang = 'zh-CN';
  } else if (settings.voiceType.startsWith('zh-HK')) {
    utterance.lang = 'zh-HK';
  } else if (settings.voiceType.startsWith('en')) {
    utterance.lang = 'en-US';
  }

  utterance.onend = function() {
    // 检查是否已经停止播放
    if (!isPlaying) return;

    currentSentenceIndex++;
    readNextSentence();
  };

  utterance.onerror = function(event) {
    console.error('朗读错误:', event);

    // 如果是用户主动停止（interrupted），不继续播放
    if (event.error === 'interrupted' || !isPlaying) {
      console.log('朗读被中断或已停止，不继续播放');
      return;
    }

    // 其他错误继续播放下一句
    currentSentenceIndex++;
    readNextSentence();
  };

  console.log('开始朗读句子:', sentence);
  speechSynthesis.speak(utterance);
}

// WebSocket模式：整段文本流式播放
function readWithWebSocketMode() {
  // 获取当前帖子的完整文本（不分句）
  const post = posts[currentPostIndex];
  const authorElement = post.querySelector('div.post-item-top-right div span.name');
  const authorIdentity = post.querySelector('div.post-item-top-right div span.identity');
  const contentElement = post.querySelector('div.post-content.preview');

  let authorInfo = '';
  if (authorElement) {
    authorInfo += `作者: ${authorElement.textContent}`;
    if (authorIdentity) {
      authorInfo += `, ${authorIdentity.textContent}`;
    }
    authorInfo += '. ';
  }

  const rawText = authorInfo + contentElement.innerText;
  const fullText = cleanTextContent(rawText);

  // 根据设置选择TTS模式
  const ttsPromise = settings.websocketMode
    ? fetchDoubaoTTSViaBackground(fullText, settings.voiceType, settings.rate, settings.pitch, settings.emotion, true)
    : fetchDoubaoTTSViaBackground(fullText, settings.voiceType, settings.rate, settings.pitch, settings.emotion, false);

  ttsPromise.then(base64Audio => {
      playAudioFromBase64(base64Audio, () => {
        // 整段播放完成，移动到下一篇帖子
        if (currentPostIndex < posts.length - 1) {
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
      });
    })
    .catch(err => {
      console.error('豆包TTS错误:', err);

      // 检查是否是扩展上下文失效
      if (err.message && err.message.includes('扩展上下文已失效')) {
        updateStatus('扩展已重新加载，请刷新页面后重试');
        stopReading();
        return;
      }

      updateStatus('TTS播放失败: ' + err.message);
      // 错误时跳到下一篇
      if (currentPostIndex < posts.length - 1) {
        currentPostIndex++;
        setTimeout(() => startReading(), 1000);
      } else {
        stopReading();
      }
    });
}

// 串行播放豆包TTS（原有逻辑）
function readNextSentenceSerial() {
  const sentence = sentences[currentSentenceIndex];

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
}

// 三段式并发播放：播放一句，准备一句，请求一句
function readNextSentenceWithQueue() {
  // 启动预加载
  preloadAudioQueue();

  // 播放队列中的下一个音频
  playNextFromQueue();
}

// 预加载音频队列
function preloadAudioQueue() {
  // 计算需要预加载的句子范围
  const startIndex = currentSentenceIndex;
  const endIndex = Math.min(startIndex + maxQueueSize, sentences.length);

  for (let i = startIndex; i < endIndex; i++) {
    // 检查是否已经在队列中或正在请求
    const existsInQueue = audioQueue.some(item => item.index === i);
    if (!existsInQueue && !isRequestingAudio) {
      requestAudioForSentence(i);
      break; // 一次只请求一个，避免并发过多
    }
  }
}

// 为指定句子请求音频
function requestAudioForSentence(sentenceIndex) {
  if (sentenceIndex >= sentences.length) return;

  isRequestingAudio = true;
  const sentence = sentences[sentenceIndex];

  fetchDoubaoTTS(sentence, settings.voiceType, settings.rate, settings.pitch, settings.emotion)
    .then(base64Audio => {
      // 将音频添加到队列
      audioQueue.push({
        index: sentenceIndex,
        audio: base64Audio,
        sentence: sentence
      });

      // 按索引排序队列
      audioQueue.sort((a, b) => a.index - b.index);

      isRequestingAudio = false;

      // 继续预加载下一个
      setTimeout(() => preloadAudioQueue(), 100);
    })
    .catch(err => {
      console.error('豆包TTS错误:', err);
      isRequestingAudio = false;

      // 错误时跳过这句，继续下一句
      setTimeout(() => {
        currentSentenceIndex++;
        readNextSentence();
      }, 500);
    });
}

// 从队列播放下一个音频
function playNextFromQueue() {
  // 查找当前句子的音频
  const audioIndex = audioQueue.findIndex(item => item.index === currentSentenceIndex);

  if (audioIndex !== -1) {
    // 找到了，立即播放
    const audioItem = audioQueue[audioIndex];
    audioQueue.splice(audioIndex, 1); // 从队列中移除

    playAudioFromBase64(audioItem.audio, () => {
      currentSentenceIndex++;
      readNextSentence();
    });
  } else {
    // 没找到，可能还在请求中，等待一下再试
    if (currentSentenceIndex < sentences.length) {
      setTimeout(() => playNextFromQueue(), 200);
    } else {
      // 已经是最后一句了
      currentSentenceIndex++;
      readNextSentence();
    }
  }
}

// 豆包TTS API请求（通过background script调用，解决CORS问题）
function fetchDoubaoTTS(text, voice, speed, _pitch, emotion) {
  return new Promise((resolve, reject) => {
    // 检查扩展上下文是否有效
    if (!chrome.runtime || !chrome.runtime.id) {
      reject(new Error('扩展上下文已失效，请刷新页面'));
      return;
    }

    chrome.storage.sync.get({ttsToken: '', ttsAppid: ''}, function(items) {
      // 再次检查扩展上下文
      if (chrome.runtime.lastError) {
        reject(new Error('扩展上下文错误: ' + chrome.runtime.lastError.message));
        return;
      }

      const token = items.ttsToken;
      const appid = items.ttsAppid;
      if (!token || !appid) {
        reject(new Error('未配置豆包TTS Token或AppID'));
        return;
      }

      try {
        // 发送消息给background script处理TTS请求
        chrome.runtime.sendMessage({
          action: 'doubaoTTS',
          data: {
            appid: appid,
            token: token,
            text: text,
            voice_type: voice,
            speed_ratio: speed,
            encoding: 'mp3',
            emotion: emotion,
            websocketMode: settings.websocketMode || false
          }
        }, function(response) {
          if (chrome.runtime.lastError) {
            reject(new Error('扩展通信错误: ' + chrome.runtime.lastError.message));
            return;
          }

          if (response && response.success) {
            resolve(response.data.audio);
          } else {
            reject(new Error(response ? response.error : '未知错误'));
          }
        });
      } catch (error) {
        reject(new Error('发送消息失败: ' + error.message));
      }
    });
  });
}

// 通过background script调用豆包TTS（支持WebSocket和HTTP模式）
function fetchDoubaoTTSViaBackground(text, voice, speed, pitch, emotion, websocketMode) {
  return new Promise((resolve, reject) => {
    // 检查扩展上下文是否有效
    if (!chrome.runtime || !chrome.runtime.id) {
      reject(new Error('扩展上下文已失效，请刷新页面'));
      return;
    }

    chrome.storage.sync.get({ttsToken: '', ttsAppid: ''}, function(items) {
      // 再次检查扩展上下文
      if (chrome.runtime.lastError) {
        reject(new Error('扩展上下文错误: ' + chrome.runtime.lastError.message));
        return;
      }

      const token = items.ttsToken;
      const appid = items.ttsAppid;
      if (!token || !appid) {
        reject(new Error('未配置豆包TTS Token或AppID'));
        return;
      }

      // 发送消息到background script
      const requestData = {
        appid: appid,
        token: token,
        text: text,
        voice_type: voice,
        speed_ratio: speed || 1.0,
        encoding: 'mp3',
        emotion: emotion,
        websocketMode: websocketMode
      };

      try {
        chrome.runtime.sendMessage({
          action: 'doubaoTTS',
          data: requestData
        }, function(response) {
          if (chrome.runtime.lastError) {
            reject(new Error('扩展通信错误: ' + chrome.runtime.lastError.message));
            return;
          }

          if (response && response.success) {
            resolve(response.data.audio);
          } else {
            reject(new Error(response ? response.error : '未知错误'));
          }
        });
      } catch (error) {
        reject(new Error('发送消息失败: ' + error.message));
      }
    });
  });
}

// 播放base64音频（豆包TTS返回MP3格式）
function playAudioFromBase64(base64, onended) {
  if (audio) {
    audio.pause();
    audio = null;
  }
  audio = new Audio('data:audio/mp3;base64,' + base64);
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

// 判断是否为豆包TTS
function isDoubaoTTS(voiceType) {
  return voiceType && voiceType.startsWith('zh_');
}

// 判断是否为Microsoft Neural音色
function isMicrosoftNeural(voiceType) {
  return voiceType && (
    voiceType.includes('Neural') ||
    voiceType.startsWith('zh-CN-') ||
    voiceType.startsWith('zh-HK-') ||
    voiceType.startsWith('en-US-')
  );
}

// 清洗文本内容，处理链接等
function cleanTextContent(text) {
  if (!text) return '';

  // 处理HTML链接标签，替换为"具体请看链接"
  text = text.replace(/<a[^>]*href="[^"]*"[^>]*>([^<]*)<\/a>/gi, '具体请看链接');

  // 处理其他HTML标签，保留文本内容
  text = text.replace(/<[^>]+>/g, '');

  // 处理纯URL链接（http或https开头的链接）
  text = text.replace(/https?:\/\/[^\s\u4e00-\u9fa5]+/gi, '具体请看链接');

  // 处理被【】包围的链接
  text = text.replace(/【[^】]*https?:\/\/[^】]*】/gi, '具体请看链接');

  // 处理多余的空白字符
  text = text.replace(/\s+/g, ' ').trim();

  // 处理连续的"具体请看链接"
  text = text.replace(/(具体请看链接\s*){2,}/g, '具体请看链接');

  return text;
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
function updateStatus(msg) {
  // 1. 控制台输出
  console.log('状态提示:', msg);

  // 2. 或者动态插入一个提示元素
  let tip = document.getElementById('my-ext-status-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'my-ext-status-tip';
    tip.style.position = 'fixed';
    tip.style.top = '10px';
    tip.style.right = '10px';
    tip.style.background = 'rgba(0,0,0,0.7)';
    tip.style.color = '#fff';
    tip.style.padding = '8px 16px';
    tip.style.borderRadius = '4px';
    tip.style.zIndex = 99999;
    document.body.appendChild(tip);
  }
  tip.textContent = msg;
  setTimeout(() => { tip.remove(); }, 2000);
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
