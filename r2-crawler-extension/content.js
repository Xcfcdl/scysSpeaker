let isCrawling = false;
let stopCrawling = false;
let repeatCount = 0; // 连续重复计数
let totalCrawled = 0; // 采集总数

// 获取本地已采集ID集合
async function getCrawledIds() {
  return new Promise(resolve => {
    chrome.storage.local.get(['r2_crawled_ids'], res => {
      resolve(res.r2_crawled_ids || []);
    });
  });
}

// 保存本地已采集ID集合
async function setCrawledIds(ids) {
  return new Promise(resolve => {
    chrome.storage.local.set({ r2_crawled_ids: ids }, resolve);
  });
}

async function crawlCurrentPage() {
  const crawledIds = await getCrawledIds();
  const posts = Array.from(document.querySelectorAll('div.post-item'));
  let newPosts = [];
  let newIds = [];

  for (const post of posts) {
    // 用URL+帖子序号等方式生成唯一ID
    const postId = post.getAttribute('data-id') || post.id || (location.href + '#' + posts.indexOf(post));
    if (!crawledIds.includes(postId)) {
      // 参考朗读插件的选择器
      const authorElement = post.querySelector('div.post-item-top-right div span.name');
      const authorIdentity = post.querySelector('div.post-item-top-right div span.identity');
      let author = '';
      let identity = '';
      if (authorElement) author = authorElement.innerText;
      if (authorIdentity) identity = authorIdentity.innerText;
      const content = post.querySelector('div.post-content.preview')?.innerText || '';
      newPosts.push({ author, identity, content, url: location.href, postId });
      newIds.push(postId);
    }
  }

  if (newPosts.length > 0) {
    totalCrawled += newPosts.length;
    chrome.runtime.sendMessage({ type: 'UPLOAD_R2', data: newPosts });
    chrome.runtime.sendMessage({ type: 'CRAWL_STATUS', count: totalCrawled }); // 通知popup
    await setCrawledIds([...crawledIds, ...newIds]);
    repeatCount = 0; // 只要有新内容，重置计数
  } else {
    repeatCount++;
    console.log(`[R2采集] 本页全部为重复帖子，连续重复次数：${repeatCount}`);
  }
}

async function goToNextPage() {
  const nextBtn = document.querySelector('.pagination-next');
  if (nextBtn && !nextBtn.classList.contains('disabled')) {
    nextBtn.click();
    return true;
  }
  return false;
}

async function crawlAllPages() {
  isCrawling = true;
  stopCrawling = false;
  repeatCount = 0;
  totalCrawled = 0;
  while (!stopCrawling) {
    await crawlCurrentPage();
    if (repeatCount >= 2) {
      chrome.runtime.sendMessage({ type: 'CRAWL_FINISH', count: totalCrawled });
      console.log('[R2采集] 连续2页均为重复内容，自动停止采集，说明已全部更新完毕。');
      break;
    }
    const delay = 2000 + Math.random() * 8000;
    await new Promise(r => setTimeout(r, delay));
    const hasNext = await goToNextPage();
    if (!hasNext) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  isCrawling = false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_CRAWL') {
    crawlAllPages();
  }
  if (msg.type === 'STOP_CRAWL') {
    stopCrawling = true;
  }
}); 