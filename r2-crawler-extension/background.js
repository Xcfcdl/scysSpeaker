importScripts('utils/r2.js');
import { uploadToR2, listR2PostIds } from './utils/r2.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'UPLOAD_R2') {
    // 支持批量上传
    Promise.all(msg.data.map(async (item) => {
      try {
        await uploadToR2(item);
        chrome.runtime.sendMessage({ type: 'UPLOAD_STATUS', postId: item.postId, status: 'success' });
      } catch (e) {
        chrome.runtime.sendMessage({ type: 'UPLOAD_STATUS', postId: item.postId, status: 'fail', error: e.message });
      }
    }));
  }
  if (msg.type === 'CHECK_UPDATE') {
    // 检查更新逻辑，可定时拉取 update.json
  }
  if (msg.type === 'RESET_CRAWLED_IDS') {
    listR2PostIds().then(ids => {
      chrome.storage.local.set({ r2_crawled_ids: ids }, () => {
        chrome.runtime.sendMessage({ type: 'RESET_CRAWLED_IDS_DONE', count: ids.length });
      });
    }).catch(e => {
      chrome.runtime.sendMessage({ type: 'RESET_CRAWLED_IDS_FAIL', error: e.message });
    });
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'check_update') {
    chrome.runtime.sendMessage({ type: 'CHECK_UPDATE' });
  }
});

// 启动时设置定时器
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('check_update', { periodInMinutes: 60 });
}); 