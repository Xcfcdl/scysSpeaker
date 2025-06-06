# WebSocket协议修复说明

## 问题根源

原始错误 `Could not decode a text frame as UTF-8` 的根本原因是：

1. **协议不匹配**：豆包TTS WebSocket使用专有的二进制协议，不是标准的文本WebSocket
2. **消息格式错误**：直接发送JSON字符串，而豆包期望特定的二进制格式
3. **解析方式错误**：没有按照豆包协议解析返回的二进制数据

## 豆包WebSocket协议详解

### 消息格式

```
[4字节Header] + [4字节Payload Size] + [Payload Data]
```

### Header结构（4字节）

| 字段 | 位数 | 值 | 说明 |
|------|------|-----|------|
| 协议版本 | 4bit | 0001 | 版本1 |
| Header大小 | 4bit | 0001 | 4字节 |
| 消息类型 | 4bit | 0001 | Full client request |
| Flags | 4bit | 0000 | 固定为0 |
| 序列化方法 | 4bit | 0001 | JSON |
| 压缩方法 | 4bit | 0000 | 无压缩 |
| 保留字段 | 8bit | 0x00 | 固定为0 |

### 实现代码

```javascript
function createDoubaoWebSocketMessage(jsonPayload) {
  const payloadBytes = new TextEncoder().encode(jsonPayload);
  const payloadSize = payloadBytes.length;

  // 4字节header + 4字节payload size + payload
  const totalSize = 4 + 4 + payloadSize;
  const message = new ArrayBuffer(totalSize);
  const view = new DataView(message);
  const messageBytes = new Uint8Array(message);

  // 构建header
  view.setUint8(0, 0x11); // 版本1 + Header size 1
  view.setUint8(1, 0x10); // Full client request + Flags 0
  view.setUint8(2, 0x10); // JSON + 无压缩
  view.setUint8(3, 0x00); // 保留字段

  // Payload size (大端序)
  view.setUint32(4, payloadSize, false);

  // Payload data
  messageBytes.set(payloadBytes, 8);

  return message;
}
```

## 响应消息解析

### Audio-only server response (0x0B)

服务器返回音频数据时使用此类型：

```javascript
if (messageType === 0x0B) {
  // 音频数据从header + payload size之后开始
  const audioData = data.slice(8);
  const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData)));
  
  return {
    audio: base64Audio,
    sequence: flags === 0x02 || flags === 0x03 ? -1 : 1
  };
}
```

### Flags含义

- `0x00`: 没有sequence number
- `0x01`: sequence number > 0 (还有更多数据)
- `0x02` 或 `0x03`: sequence number < 0 (最后一条消息)

## 修复前后对比

### 修复前
```javascript
// ❌ 直接发送JSON字符串
ws.send(JSON.stringify(requestBody));

// ❌ 简单处理二进制数据
const base64Audio = btoa(String.fromCharCode(...new Uint8Array(event.data)));
```

### 修复后
```javascript
// ✅ 使用豆包二进制协议
const binaryMessage = createDoubaoWebSocketMessage(JSON.stringify(requestBody));
ws.send(binaryMessage);

// ✅ 按协议解析响应
const response = parseDoubaoWebSocketMessage(event.data);
```

## 测试步骤

1. **配置豆包TTS**：
   - 填入有效的AppID和Token
   - 选择豆包音色（以"zh_"开头）

2. **启用WebSocket模式**：
   - 在设置中选择"WebSocket模式（整段流式）"
   - 保存设置

3. **测试播放**：
   - 在生财有术页面点击播放按钮
   - 观察控制台输出

4. **预期结果**：
   - 看到"Content Script WebSocket连接已建立"
   - 看到"解析WebSocket消息"的详细信息
   - 听到连贯的语音播放

## 调试信息

### 正常连接日志
```
Content Script WebSocket连接已建立
解析WebSocket消息: {version: 1, headerSize: 1, messageType: 11, flags: 2, serialization: 0}
```

### 错误处理
- 连接失败：自动提示切换到HTTP模式
- 协议错误：显示详细的解析信息
- 超时处理：60秒后自动关闭连接

## 性能优化

### 流式播放优势
- **整段传输**：一次发送完整文本，减少网络请求
- **流式接收**：边接收边播放，降低延迟
- **语音连贯**：无分句间隙，自然流畅

### 内存管理
- 自动清理WebSocket连接
- 及时释放音频缓存
- 防止内存泄漏

## 兼容性说明

### 浏览器支持
- ✅ Chrome 扩展环境
- ✅ Content Script 中的WebSocket
- ⚠️ Background Script 有限制

### 回退机制
- WebSocket失败时自动提示用户
- 可随时切换回HTTP模式
- 保持功能完整性

## 未来改进

1. **连接复用**：支持多次合成复用同一连接
2. **断线重连**：网络中断时自动重连
3. **智能切换**：根据网络状况自动选择模式
4. **缓存优化**：预加载和智能缓存机制
