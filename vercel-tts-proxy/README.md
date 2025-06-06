# Vercel 豆包TTS中转API

本项目为 Vercel Serverless Function 实现的豆包TTS（火山引擎语音合成）中转API，解决浏览器CORS跨域问题，适用于前端/浏览器扩展安全调用。

## 目录结构
```
vercel-tts-proxy/
├── api/
│   └── tts.js         # Vercel Serverless Function
├── package.json
└── README.md
```

## 使用方法

### 1. 部署到 Vercel
- 新建 GitHub 仓库，上传本目录所有文件
- 登录 [Vercel官网](https://vercel.com/) ，导入该仓库并部署
- 部署后API地址为 `https://your-vercel-app.vercel.app/api/tts`

### 2. 前端请求示例
```js
fetch('https://your-vercel-app.vercel.app/api/tts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'sk-xxxxxx',
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
- [Vercel Serverless Functions官方文档](https://vercel.com/docs/functions) 