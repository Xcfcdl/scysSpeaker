# 豆包TTS集成说明

## 修改内容

本次修改将插件从使用Vercel代理调用豆包TTS改为直接本地调用豆包TTS API，并新增WebSocket模式支持，主要修改包括：

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
- 新增WebSocket模式开关支持
- 测试功能现在使用当前选择的配置

### 5. popup.html
- 新增WebSocket模式选择器
- 只在选择豆包音色时显示WebSocket选项

## 使用方法

1. 在popup界面配置豆包TTS的AppID和Token
2. 选择豆包音色（以"zh_"开头的选项）
3. 可选择情感参数（仅部分音色支持）
4. 选择TTS模式：
   - **HTTP模式（推荐）**：简单稳定，适合短文本
   - **WebSocket模式**：流式合成，适合长文本
5. 点击"测试当前配置"验证设置
6. 保存设置后即可使用

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

## WebSocket vs HTTP模式对比

| 特性 | HTTP模式 | WebSocket模式 |
|------|----------|---------------|
| **稳定性** | 高 | 中等 |
| **实现复杂度** | 简单 | 复杂 |
| **适用场景** | 短文本合成 | 长文本合成 |
| **响应方式** | 一次性返回完整音频 | 流式返回音频片段 |
| **网络要求** | 标准HTTP | WebSocket连接 |
| **扩展兼容性** | ✅ 完全支持 | ⚠️ 有限制 |
| **推荐使用** | ✅ 日常使用 | 暂不推荐 |

## WebSocket模式说明

⚠️ **重要提示**: 由于Chrome浏览器扩展的安全限制，WebSocket模式在background script中无法正常工作。当前选择WebSocket模式时，系统会自动回退到HTTP模式，但保持接口兼容性。

### 技术限制
- Chrome扩展的background script对WebSocket有严格限制
- 豆包的WebSocket需要特殊的二进制协议和认证方式
- 浏览器扩展环境与标准Web环境有差异

## 注意事项

- 需要有效的豆包TTS AppID和Token
- 确保网络连接正常
- 部分音色支持情感参数，部分不支持
- **WebSocket模式当前有限制**：由于浏览器扩展环境限制，选择WebSocket模式时会自动回退到HTTP模式
- 建议使用HTTP模式，稳定可靠且功能完整
- WebSocket的二进制协议实现已准备就绪，等待技术限制解决后可启用

## 未来计划

- 探索在content script中实现WebSocket连接的可能性
- 研究其他方式绕过扩展环境的WebSocket限制
- 持续关注Chrome扩展API的更新
