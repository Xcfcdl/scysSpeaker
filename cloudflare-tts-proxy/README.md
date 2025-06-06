# Cloudflare 豆包TTS中转API

本项目为 Cloudflare Workers 实现的豆包TTS（火山引擎语音合成）中转API，解决浏览器CORS跨域问题，适用于前端/浏览器扩展安全调用。

## 功能
- 代理转发前端TTS请求到豆包TTS接口
- 支持自定义token或使用环境变量token
- 自动添加CORS响应头，前端可直接fetch

## 目录结构
```
cloudflare-tts-proxy/
├── src/
│   └── index.js      # Worker主代码
├── wrangler.toml     # Cloudflare Worker配置
└── README.md         # 项目说明
```

## 使用方法

### 1. 配置token
- 推荐在 wrangler.toml 的 [vars] 部分配置 DOUBAO_TTS_TOKEN
- 也可前端传 token 字段（优先使用前端token）

### 2. 启动/部署
```bash
npm install -g wrangler
wrangler login
wrangler publish
```

### 3. 前端请求示例
```js
fetch('https://your-worker.your-account.workers.dev', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'sk-xxxxxx', // 可选
    text: '你好，世界',
    voice: 'zh_male_beijingxiaoye_emo_v2_mars_bigtts',
    speed: 1.0,
    pitch: 1.0,
    emotion: 'neutral'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

## 参考
- [火山引擎语音合成API文档](https://www.volcengine.com/docs/6561/1257584)
- [Cloudflare Workers官方文档](https://developers.cloudflare.com/workers/) 