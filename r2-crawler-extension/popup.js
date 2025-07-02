let total = 0;
let uploaded = 0;
let failed = 0;

function updateStatus() {
  document.getElementById('status').innerText =
    `已采集：${total} 篇\n上传成功：${uploaded} 篇\n上传失败：${failed} 篇`;
}

document.getElementById('start').onclick = () => {
  total = 0;
  uploaded = 0;
  failed = 0;
  updateStatus();
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'START_CRAWL' });
    document.getElementById('status').innerText = '采集已启动';
  });
};
document.getElementById('stop').onclick = () => {
  chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_CRAWL' });
    document.getElementById('status').innerText = '采集已停止';
  });
};

document.getElementById('reset-crawled-ids').onclick = () => {
  document.getElementById('status').innerText = '正在同步R2...';
  chrome.runtime.sendMessage({ type: 'RESET_CRAWLED_IDS' });
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'CRAWL_STATUS') {
    total = msg.count;
    updateStatus();
  }
  if (msg.type === 'UPLOAD_STATUS') {
    if (msg.status === 'success') uploaded++;
    if (msg.status === 'fail') failed++;
    updateStatus();
  }
  if (msg.type === 'CRAWL_FINISH') {
    document.getElementById('status').innerText += `\n采集已完成，共采集：${msg.count} 篇`;
  }
  if (msg.type === 'RESET_CRAWLED_IDS_DONE') {
    document.getElementById('status').innerText = `本地去重已重置，共同步 ${msg.count} 个ID`;
  }
  if (msg.type === 'RESET_CRAWLED_IDS_FAIL') {
    document.getElementById('status').innerText = `本地去重重置失败：${msg.error}`;
  }
}); 