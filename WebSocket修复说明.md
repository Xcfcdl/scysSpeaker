# WebSocket模式修复说明

## 问题分析

原始错误：
```
WebSocket connection to 'wss://openspeech.bytedance.com/api/v1/tts/ws_binary?appid=xxx&token=xxx' failed: Could not decode a text frame as UTF-8.
```

### 根本原因

1. **协议不匹配**：豆包TTS WebSocket使用二进制协议，不是纯文本JSON
2. **认证方式错误**：不应该在URL中传递认证信息
3. **Chrome扩展限制**：background script对WebSocket有严格限制

## 解决方案

### 1. 架构调整

**原方案**：background script处理WebSocket
- ❌ Chrome扩展background script对WebSocket有限制
- ❌ 无法正确处理二进制协议
- ❌ 认证头无法正确传递

**新方案**：content script直接处理WebSocket
- ✅ content script运行在页面环境，WebSocket限制较少
- ✅ 可以正确处理豆包的协议要求
- ✅ 更好的错误处理和调试能力

### 2. 技术实现

#### WebSocket连接
```javascript
// 正确的连接方式
const wsUrl = `wss://openspeech.bytedance.com/api/v1/tts/ws_binary`;
const ws = new WebSocket(wsUrl);
```

#### 认证处理
```javascript
// 在请求体中包含认证信息，而不是URL参数
const requestBody = {
  app: {
    appid: appid,
    token: token,
    cluster: "volcano_tts"
  },
  // ...
};
```

#### 协议处理
- 发送：JSON格式请求（简化处理）
- 接收：支持二进制和JSON两种格式
- 错误处理：完整的连接状态管理

### 3. 回退机制

```javascript
// background.js中的WebSocket处理
async function handleDoubaoWebSocketTTS(requestData) {
  // 自动回退到HTTP模式
  console.warn('WebSocket模式在Chrome扩展background script中有限制，回退到HTTP模式');
  return await handleDoubaoHTTPTTS(requestData);
}
```

## 新的工作流程

### HTTP模式（默认）
1. content script → background script
2. background script → 豆包HTTP API
3. 返回完整音频数据
4. 支持三段式并发播放

### WebSocket模式（实验性）
1. content script → 直接连接豆包WebSocket
2. 发送整段文本
3. 接收流式音频数据
4. 整段播放，语音更连贯

## 配置选项

### 智能显示逻辑
```javascript
function updateConcurrentModeVisibility() {
  if (isDoubaoVoiceType(voiceType.value)) {
    // WebSocket模式下隐藏并发模式选项
    if (websocketMode.value === 'true') {
      concurrentModeGroup.style.display = 'none';
    } else {
      concurrentModeGroup.style.display = '';
    }
  }
}
```

### 模式说明
- **HTTP + 三段式并发**：最佳兼容性，无缝衔接
- **HTTP + 串行播放**：传统模式，最稳定
- **WebSocket流式**：实验性，语音最连贯

## 错误处理改进

### 连接错误
- 自动检测WebSocket连接失败
- 提供详细的错误信息
- 建议用户切换到HTTP模式

### 协议错误
- 支持多种消息格式解析
- 二进制数据自动转换为base64
- JSON消息完整性验证

### 超时处理
- WebSocket连接60秒超时
- 自动清理资源
- 防止内存泄漏

## 测试建议

1. **HTTP模式测试**：
   - 选择豆包音色
   - 关闭WebSocket模式
   - 测试三段式并发播放

2. **WebSocket模式测试**：
   - 选择豆包音色
   - 开启WebSocket模式
   - 测试整段文本播放

3. **错误恢复测试**：
   - 网络中断场景
   - 认证失败场景
   - 协议错误场景

## 未来优化

1. **二进制协议完整实现**：
   - 完整的豆包二进制协议支持
   - 更高效的数据传输
   - 更好的流式体验

2. **智能模式切换**：
   - 根据文本长度自动选择模式
   - 网络状况自适应
   - 用户偏好学习

3. **性能优化**：
   - WebSocket连接复用
   - 音频缓存机制
   - 预加载策略优化
