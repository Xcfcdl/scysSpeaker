# 豆包TTS集成说明

## 修改内容

本次修改将插件从使用Vercel代理调用豆包TTS改为直接本地调用豆包TTS API，主要修改包括：

### 1. manifest.json
- 更新版本号到1.1
- 确保包含豆包API的host权限

### 2. background.js
- 新增豆包TTS API请求处理函数
- 通过background script处理CORS问题
- 支持完整的豆包TTS API参数

### 3. content.js
- 修改fetchDoubaoTTS函数，通过chrome.runtime.sendMessage调用background script
- 移除直接的fetch调用，避免CORS问题

### 4. popup.js
- 修改测试功能，通过background script测试豆包TTS
- 保持UI界面不变

## 使用方法

1. 在popup界面配置豆包TTS的AppID和Token
2. 选择豆包音色（以"zh_"开头的选项）
3. 可选择情感参数（仅部分音色支持）
4. 点击"测试Token"验证配置
5. 保存设置后即可使用

## 豆包TTS API参数

插件会自动将以下参数发送给豆包API：
- app.appid: 用户配置的AppID
- app.token: 用户配置的Token
- app.cluster: "volcano_tts"
- audio.voice_type: 选择的音色
- audio.encoding: "mp3"
- audio.speed_ratio: 语速设置
- audio.rate: 24000
- audio.emotion: 情感参数（如果设置）
- request.text: 要合成的文本
- request.operation: "query"

## 错误处理

- 自动处理网络错误和API错误
- 提供详细的错误信息
- 支持重试机制

## 注意事项

- 需要有效的豆包TTS AppID和Token
- 确保网络连接正常
- 部分音色支持情感参数，部分不支持
