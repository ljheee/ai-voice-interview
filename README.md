# AI Voice Interview

AI 模拟面试系统 — 语音对话，AI 充当面试官，实时出题、追问、评分。

## 项目结构

```
ai-voice-interview/
├── frontend/   # Next.js 14 前端（语音交互）
└── server/     # Node.js 后端（WebSocket + LLM + 题库查询）
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
# LLM — OpenAI 兼容协议，支持多 provider 顺序降级
LLM_PROVIDERS=[{"name":"kimi","baseUrl":"https://api.moonshot.cn/v1","apiKey":"sk-xxx","model":"moonshot-v1-32k"}]

# 题库（可选）— 有值则开启，skill 阶段按 next_focus 语义查询
# QUESTION_SEARCH_URL=https://interview-crawler-production.up.railway.app/api/questions/search

PORT=3001
```

### frontend/.env.local

```bash
cp frontend/.env.local.example frontend/.env.local
```

```env
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws/interview
NEXT_PUBLIC_MODEL_SERVER=http://localhost:3001   # Whisper 模型文件托管地址
```

---

## 安装依赖

```bash
cd frontend && npm install --ignore-scripts
bash ../scripts/setup.sh    # 拷贝 ONNX/VAD/PDF.js 等大二进制到 public/
cd ../server && npm install
```

---

## 启动

```bash
# 终端 1：Node.js 服务（WebSocket + LLM + 静态模型文件）
cd server && npm run dev

# 终端 2：Next.js 前端
cd frontend && npm run dev
```

访问 http://localhost:3000

---

## 使用说明

1. 访问配置页，填写简历、选择目标公司/技能方向、配置语音引擎
2. 点击"开始面试"进入面试间，等待顶部状态变为**已连接**
3. 按住页面中央按钮（或按住**空格键**）开始说话，松开后 AI 自动识别并回复
4. 点击右上角**思考过程**可查看 AI 的内部分析和考察方向

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 前端框架 | Next.js 14 + TypeScript + Tailwind CSS |
| 状态管理 | Zustand（persist 到 localStorage） |
| STT | webkitSpeechRecognition（Chrome）/ ONNX Whisper（本地） |
| TTS | Murf API / Azure TTS / SpeechSynthesis 降级 |
| VAD | @ricky0123/vad-react（Silero VAD） |
| 传输 | WebSocket（ws） |
| LLM | 配置驱动多 Provider（OpenAI 兼容协议） |
| 题库 | HTTP API（服务端，可选，支持语义搜索） |
| 后端 | Node.js + Express |

---

## 核心设计

详见 [stt_tts.md](./stt_tts.md)。
