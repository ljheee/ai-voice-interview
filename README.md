# AI Voice Interview

AI 模拟面试系统 — 语音对话，AI 充当面试官，实时出题、追问、评分。

## 项目结构

```
ai-voice-interview/
├── frontend/   # Next.js 14 前端（语音交互 + 题库浏览）
└── server/     # Node.js 后端（WebSocket + Gemini LLM）
```

## 环境要求

- Node.js 18+
- npm 9+

---

## 配置

### server/.env

```bash
cp server/.env.example server/.env
```

编辑 `server/.env`：

```env
GEMINI_API_KEY=your_gemini_api_key_here   # https://aistudio.google.com/app/apikey
PORT=3001
```

### frontend/.env.local

```bash
cp frontend/.env.local.example frontend/.env.local
```

编辑 `frontend/.env.local`：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000      # Python 题库后端地址
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws/interview
```

> **Azure TTS（可选）**：在面试页面 → 设置 → 填入 Azure TTS API Key 和 Region。
> 不填则自动降级到系统内置语音合成（SpeechSynthesis）。

---

## 安装依赖

```bash
cd frontend && npm install --ignore-scripts
cd ../server && npm install
```

---

## 启动

```bash
# 终端 1：Node.js 服务（WebSocket + LLM）
cd server && npm run dev

# 终端 2：Next.js 前端
cd frontend && npm run dev
```

访问 http://localhost:3000/interview

---

## 使用说明

1. 打开面试页面，等待顶部状态变为**已连接**
2. 按住页面中央按钮（或按住**空格键**）开始说话
3. 松开后 AI 自动识别并回复（语音播放 + 字幕）
4. 点击右上角**思考过程**可查看 AI 的内部分析和考察方向

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端框架 | Next.js 14 + TypeScript + Tailwind CSS |
| 状态管理 | Zustand |
| STT | webkitSpeechRecognition（Chrome）/ ONNX Whisper（本地） |
| TTS | Azure TTS（SSML）/ SpeechSynthesis 降级 |
| VAD | @ricky0123/vad-react（Silero VAD） |
| 传输 | WebSocket（ws） |
| LLM | Gemini 1.5 Flash（@google/generative-ai） |
| 后端 | Node.js + Express |
