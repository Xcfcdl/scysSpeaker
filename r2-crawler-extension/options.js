const endpoint = document.getElementById('endpoint');
const accessKey = document.getElementById('accessKey');
const secretKey = document.getElementById('secretKey');
bucket = document.getElementById('bucket');
const status = document.getElementById('status');

// 读取已保存参数
chrome.storage.local.get(['r2_endpoint','r2_accessKey','r2_secretKey','r2_bucket'], (res) => {
  endpoint.value = res.r2_endpoint || '';
  accessKey.value = res.r2_accessKey || '';
  secretKey.value = res.r2_secretKey || '';
  bucket.value = res.r2_bucket || '';
});

document.getElementById('save').onclick = () => {
  chrome.storage.local.set({
    r2_endpoint: endpoint.value,
    r2_accessKey: accessKey.value,
    r2_secretKey: secretKey.value,
    r2_bucket: bucket.value
  }, () => {
    status.innerText = '保存成功';
    setTimeout(()=>status.innerText='', 1500);
  });
};

document.getElementById('reset-crawled-ids').onclick = () => {
  status.innerText = '正在同步R2...';
  chrome.runtime.sendMessage({ type: 'RESET_CRAWLED_IDS' });
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RESET_CRAWLED_IDS_DONE') {
    status.innerText = `重置完成，共同步 ${msg.count} 个ID`;
    setTimeout(()=>status.innerText='', 2000);
  }
  if (msg.type === 'RESET_CRAWLED_IDS_FAIL') {
    status.innerText = `重置失败：${msg.error}`;
  }
}); 