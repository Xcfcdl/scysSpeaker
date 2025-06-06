// 监听来自content script的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'openPopup') {
    chrome.action.openPopup();
  }
  // 只保留微软/本地TTS相关逻辑，移除/注释掉 doubaoTTS fetch代理API逻辑
  // if (request.action === 'doubaoTTS') {
  //   chrome.storage.sync.get({ttsToken: '', ttsAppid: ''}, function(items) {
  //     const token = request.token || items.ttsToken || 'YOUR_TOKEN';
  //     const appid = request.appid || items.ttsAppid || 'YOUR_APPID';
  //     // 判断是否豆包音色
  //     const isDoubao = request.voice && request.voice.startsWith('zh_');
  //     if (isDoubao) {
  //       const apiUrl = 'https://your-vercel-app.vercel.app/api/tts'; // 已废弃
  //       fetch(apiUrl, { ... })
  //     } else {
  //       // 非豆包音色，走本地或微软TTS
  //       const apiUrl = 'https://openspeech.bytedance.com/api/v1/tts';
  //       fetch(apiUrl, { ... })
  //     }
  //   });
  //   return true;
  // }
});

// 安装或更新扩展时初始化设置
chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.sync.get({
    voiceType: 'zh-CN-XiaoxiaoNeural',
    rate: 1.0,
    pitch: 1.0,
    autoNext: true
  }, function(items) {
    // 如果没有设置，则使用默认值
    if (Object.keys(items).length === 0) {
      chrome.storage.sync.set({
        voiceType: 'zh-CN-XiaoxiaoNeural',
        rate: 1.0,
        pitch: 1.0,
        autoNext: true
      });
    }
  });
}); 