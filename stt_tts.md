# AI 语音面试系统 — 技术方案汇总

## 一、整体架构

```
用户按住PTT说话
  │
  ├─ Silero VAD（@ricky0123/vad-react）→ 检测说话结束
  ├─ STT（双引擎可切换）→ 实时字幕预览 + 最终识别
  │
用户松开PTT
  │
  └─ 最终文字 → 后端出题引擎 → LLM → TTS → 播放
```

---

## 二、STT 方案

### 双引擎可切换设计

通过策略模式抽象统一接口，Settings 页切换，持久化到 localStorage：

```typescript
interface STTProvider {
  start(): void
  stop(): void
  on(event: 'interim' | 'final', handler: (text: string) => void): void
}

class WebSpeechSTT implements STTProvider { ... }
class WhisperONNXSTT implements STTProvider { ... }

const stt: STTProvider = useWebSpeech
  ? new WebSpeechSTT()
  : new WhisperONNXSTT()

// 使用方式
stt.on('interim', (text) => updateSubtitle(text))
stt.on('final', (text) => sendToLLM(text))
stt.start()
```

### 两种引擎对比

| 维度 | webkitSpeechRecognition | ONNX Whisper（本地） |
|------|------------------------|---------------------|
| 实时流式字幕 | ✅ 真正边说边出字 | ⚠️ 分段模拟，轻微延迟 |
| 准确率 | ✅ Google ASR，顶级 | ✅ 很好，中文技术术语准 |
| 跨浏览器 | ❌ 仅 Chrome | ✅ 所有浏览器 |
| 断网可用 | ❌ | ✅ 本地运行 |
| 数据隐私 | ❌ 音频过 Google | ✅ 完全本地 |
| 首次加载 | ✅ 即时 | ⚠️ 需下载模型 ~150MB（之后缓存） |
| 费用 | 免费 | 免费 |

### 注意事项
- ONNX Whisper 模拟 interim：每 1.5s 截取一段音频转写，拼接显示
- 两者 interim/final 行为不一致，接口层统一抹平，上层无感知
- 参考：alading 项目（`@xenova/transformers` + `onnxruntime-web`）的集成代码

---

## 三、VAD 方案

**Silero VAD**（`@ricky0123/vad-web`）

- 浏览器端本地运行 ONNX 模型（~1MB），不联网
- 能区分"停顿思考"和"真正说完"，准确率高
- PTT 模式下 VAD 作为辅助兜底（~3s 静音自动触发 PTT 松开）

```typescript
// lib/interview/useVADFallback.ts
import { MicVAD } from '@ricky0123/vad-web'
const vad = await MicVAD.new({
  positiveSpeechThreshold: 0.90,
  negativeSpeechThreshold: 0.75,
  minSpeechFrames: 3,
  redemptionFrames: 8,   // ~3s 静音窗口
  onSpeechEnd: () => handlePTTEnd(),
})
vad.start()
```

### 引擎互斥说明

| STT 引擎 | VAD 状态 | 原因 |
|----------|----------|------|
| WebSpeechSTT | ✅ 启用 | WebSpeech 使用浏览器内部 API，不占用 MediaRecorder，VAD 可独立开麦 |
| WhisperONNXSTT | ❌ 禁用 | Whisper 的 `MediaRecorder` 已独占麦克风，VAD 再开麦会冲突 |

实现上通过 `enabled={sttEngine === 'webspeech'}` 控制 `useVADFallback` hook 是否激活。

---

## 四、TTS 方案

**Azure TTS**（MVP 首选）

- 免费额度：50 万字符/月，约 30 次完整面试
- 中文音色：晓晓（XiaoxiaoNeural）、云希，音质自然有情感
- 支持 SSML 手动控制情感/语速/停顿

**SSML 情感控制 — 规则驱动（非 LLM 生成）：**

LLM 输出纯文本，前端按句子位置和语义自动附加 prosody 参数，避免 LLM 生成 XML 不可靠的问题。

```typescript
// lib/tts/azureTTS.ts
export type SentenceHint = 'first' | 'question' | 'default'

const PROSODY_MAP: Record<SentenceHint, { rate: string; pitch: string }> = {
  first:    { rate: 'slow',   pitch: '+0st' },  // 每轮首句：过渡语，给用户缓冲
  question: { rate: '85%',    pitch: '+4st' },  // 问句（以？结尾）：疑问语调上扬
  default:  { rate: 'medium', pitch: '+2st' },  // 其他句子：正常语速
}
```

分类逻辑（`interview/page.tsx`）：

```typescript
const hint = idx === 0 ? 'first'
  : /[？?]\s*$/.test(text) ? 'question'
  : 'default'
ttsQueueRef.current?.push(text, hint)
```

每轮 AI 回复结束（`onTurnEnd`）时重置句子序号计数器，确保下一轮首句重新触发 `first` 规则。

### TTS 流式播放队列

队列里存储的是 `TTSTask`（包含原文 + SentenceHint + 未 resolve 的 Promise）。

**时序重组是自动保证的**：按顺序 push，按顺序 `await task.audioPromise`，无论哪个 Promise 先 resolve，`_playNext()` 永远等队头完成才取下一个。Promise 提前 resolve 只是在内存里等着，不会插队。

```typescript
// lib/tts/TTSQueue.ts
interface TTSTask {
  text: string
  hint: SentenceHint
  audioPromise: Promise<AudioBuffer>
}

class TTSQueue {
  push(text: string, hint: SentenceHint = 'default') {
    // 立刻发请求，不等前一句播完（并行预请求）
    this.queue.push({ text, hint, audioPromise: this._fetch(text, hint) })
    if (!this.playing) this._playNext()
  }

  private async _playNext() {
    const task = this.queue.shift()!
    try {
      const audioBuffer = await task.audioPromise  // 大概率已 ready
      // ... 播放 AudioBuffer
    } catch {
      // 降级：SpeechSynthesis，rate 跟随 hint，保证语义完整
      const utter = new SpeechSynthesisUtterance(task.text)
      utter.lang = 'zh-CN'
      utter.rate = task.hint === 'first' ? 0.8 : task.hint === 'question' ? 0.85 : 0.9
      speechSynthesis.speak(utter)
    }
  }
}
```

**失败处理原则：不跳过，降级到 SpeechSynthesis。**
跳过会导致语义断裂（用户听到残缺的问题），面试场景不可接受。降级音质变差但语义完整，用户至少能听清被问了什么。

| 策略 | 适用场景 |
|------|---------|
| 跳过 | 音乐播放列表，跳一首无所谓 |
| 降级到 SpeechSynthesis | 面试语音，语义完整优先于音质 |
| 重试 | 网络抖动场景，但增加延迟，面试不推荐 |

**LLM 流式输出 → 按句子切割 → 并行预请求 TTS → 顺序播放，实现无缝衔接。**

### TTS 费用对比

| 服务 | 免费额度 | 推荐场景 |
|------|---------|---------|
| Azure TTS | 50万字符/月 | MVP首选 |
| Google Cloud TTS | 100万字符/月（标准） | 备选 |
| OpenAI TTS | 无 | 正式产品 |
| ElevenLabs | 1万字符/月 | 音质要求极高时 |
| SpeechSynthesis | 完全免费 | 仅验证链路 |

---

## 五、端到端延迟优化

### 目标：用户松开 PTT → AI 开口 < 1 秒

```
时间轴 →

用户按下    ████████████████████  松开
STT interim      实时字幕预览
LLM 预热              ░░░░░░░░░（可选）
LLM 输出                        ████ 第1句 ████ 第2句
TTS 请求                             ▶req1       ▶req2（并行）
TTS 播放                                  ▶play1      ▶play2

用户松开 → AI开口：< 800ms
```

### 延迟拆解

| 阶段 | 耗时 | 优化手段 |
|------|------|---------|
| PTT松开 → STT final | 100-300ms | 本地 ONNX 无网络延迟 |
| STT final → LLM first token | 300-500ms | 流式 API |
| LLM first sentence → TTS ready | 200-400ms | 并行请求，短句切割 |
| **合计** | **600ms-1.2s** | 体感流畅 |

### LLM 流式输出按句切割

```javascript
function extractSentences(text) {
  const matches = text.match(/[^，。？！,?!]+[，。？！,?!]/g) || [];
  return matches;  // 每个标点停顿点立刻送 TTS
}
```

---

## 六、出题引擎与题库对接

### 核心原则

**AI thinking 确定下一步考察方向（next_focus），服务端按需查库，候选题注入下一轮 prompt。**

```
用户回答
  ↓
AI 输出 thinking.next_focus = "Redis 持久化"
  ↓
服务端用 next_focus 查 Supabase（overlaps tags）
  ↓
候选题目（≤5条）注入下一轮 systemPrompt
  ↓
AI 从中选题 或 自主追问
```

### 题库开关

通过服务端环境变量控制，前端无感知，Key 不暴露到客户端：

```env
ENABLE_QUESTION_BANK=true          # 开关
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your_key
```

关闭时 LLM 完全自主出题，开启时仅在 `skill` 阶段查库（intro/project/closing 阶段不出技术题，查了也无用）。

### 查询时机与逻辑

每轮 `user_turn` 到达时：

1. `applyThinking()` 将上一轮的 `next_focus` 存入 `session.nextFocus`
2. `streamInterviewResponse()` 在构建 prompt 前调用 `queryQuestionsByFocus()`
3. 结果注入 `systemPrompt` 候选题目区块，AI 据此选题

```typescript
// server/src/supabaseQuery.ts
// next_focus 拆分为关键词，overlaps 匹配题目 tags 字段，按 frequency 降序，排除已问 IDs
export async function queryQuestionsByFocus(
  focus: string,
  excludeIds: string[],
  limit = 5,
): Promise<CandidateQuestion[]>
```

若 Supabase 未配置或查询失败，静默返回空数组，LLM 自主出题，不影响面试流程。

### 题库数据结构（来自 interview-crawler）

```typescript
// questions_with_companies 视图（Supabase）
interface Question {
  id: string
  title: string           // 题目正文（注入 prompt 时作为 content）
  tags: string[]          // ["Redis", "持久化"] — 用于 overlaps 匹配
  categories: string[]    // ["缓存", "中间件"]
  difficulty: 'easy' | 'medium' | 'hard'
  frequency: number       // 在爬取数据中出现次数，越高越高频
  companies: string[]     // 来源公司
}
```

### 注入 Prompt 格式

只注入题目文本和元数据，不注入详细解析（控制 prompt 长度）：

```
## 候选题目（与当前考察方向相关，skill 阶段优先使用）
1. [ID:q_001] Redis AOF 和 RDB 的区别是什么？
   公司：字节、美团 | 难度：medium | 标签：Redis, 持久化

2. [ID:q_002] Redis 持久化对性能的影响如何评估？
   公司：阿里 | 难度：hard | 标签：Redis, 持久化, 性能
```

### 追问 vs 换题

```typescript
// AI thinking 中的 action 字段
type Action =
  | { action: 'follow_up' }                              // 针对当前回答追问，不消耗题库
  | { action: 'next_question'; selected_id: string }     // 从候选题中选新题，记入 askedIds
```

- `next_question`：仅 skill 阶段使用，`selected_id` 记入 `session.askedIds`，下轮查库自动排除
- `follow_up`：intro/project 阶段及无候选题时使用，LLM 即兴追问，考察深度

**题库管"考察什么"，追问管"考察多深"，两件事分开。**

---

## 七、面试时间控制

### 时间分配

```
总时长（用户在 setup 配置，默认 90 分钟）：
  自我介绍（intro）      5 min（固定）
  项目经历（project）   总时长 × 35%
  技能考察（skill）     总时长 × 45%
  收尾（closing）        5 min（固定）
```

### 实现机制

**全局计时器**（前端 `useInterviewTimer`）：
- 维护 `elapsedSec` / `totalSec`，UI 显示进度条 `[██████░░░░] 35/90 min`
- 到时自动触发 `onInterviewEnd` → 发送 `session_end`

**单次回答 hard limit**（前端）：
- PTT 按下时启动 300s（5 分钟）setTimeout
- 超时自动触发 `handlePTTEnd`，防止候选人无限占用麦克风

**阶段预算注入 System Prompt**（服务端）：
- `InterviewSession` 记录 `stageStartedAt`（进入当前阶段的时间戳）
- 每轮 `buildSystemPrompt()` 计算本阶段已用时和建议预算，注入上下文：

```
- 本阶段已用：X 分钟 / 建议预算：Y 分钟
```

- LLM 据此判断何时切换阶段（软控制，不硬截断）
- 阶段切换时 `stageStartedAt` 重置为当前时间戳

**阶段单调递增保护**（服务端）：
- `applyThinking()` 中 `current_stage` 只允许前进，忽略 LLM 回退

### UI 进度指示器

Header 显示当前阶段进度，由 AI thinking 中的 `current_stage` 驱动：

```
自我介绍 › 项目经历 › 技能考察
  ✓已完成  ●当前     ○待进行
```

`skipIntro=true` 时自动隐藏"自我介绍"pill。

---

## 八、AG-UI 外显面试官思考过程（差异化功能）

LLM 输出结构化思考 + 语音内容，前端分流展示：

```
主对话区（语音）              侧边思考面板
  AI 语音播放               ✓ 候选人提到分库分表，未提跨库事务
                            → 考察重点转向：分布式事务方案
                            📊 已覆盖：并发/索引  待考：事务/缓存
```

```
# LLM 输出格式（顺序固定：先 speech，再 thinking）
<speech>
请问跨库事务您是如何处理的？
</speech>
<thinking>
{
  "action": "next_question",          // 或 "follow_up"
  "selected_id": "q_002",             // action=next_question 时必填
  "current_stage": "skill",           // 当前或即将进入的阶段
  "user_answer_analysis": "提到了X，遗漏了Y",
  "next_focus": "分布式事务",          // 下轮查库的关键词
  "score_delta": 1,                   // -2 到 +2
  "covered_topics": ["分库分表"],
  "pending_topics": ["分布式事务", "缓存一致性"]
}
</thinking>
```

**speech 先于 thinking 输出**：前端在 `<speech>` 流式到来时即开始 TTS 预请求，无需等待 thinking 块，实现零等待开口。

**价值：用户不只是练习，而是习得面试官思维。**

---

## 九、参考项目

| 项目 | 地址 | 参考价值 |
|------|------|---------|
| alading | https://github.com/JunJD/alading | 最接近，中文，Next.js全栈，ONNX Whisper集成可直接参考 |
| pipecat | https://github.com/pipecat-ai/pipecat | 实时语音AI对话底层框架，11K Stars |
| smart-turn | https://github.com/pipecat-ai/smart-turn | 生产级轮次切换检测，1.3K Stars |

---

## 十、MVP 成本估算

| 组件 | 方案 | 费用 |
|------|------|------|
| STT | ONNX Whisper 本地 | 免费 |
| VAD | Silero VAD | 免费 |
| LLM | Kimi / Gemini（配置驱动） | 免费层 |
| TTS | Azure TTS | 免费（50万字/月） |
| **合计** | | **≈ $0** |

正式产品（OpenAI全家桶）：约 **$0.24/次** 30分钟面试。

---

## 十一、LLM 配置驱动多 Provider

### 设计原则

统一使用 OpenAI 兼容协议（`openai` npm 包），通过 `LLM_PROVIDERS` 环境变量配置 provider 数组，支持多 provider 顺序降级。

### 配置格式

```json
// server/.env
LLM_PROVIDERS=[
  {"name":"kimi","baseUrl":"https://api.moonshot.cn/v1","apiKey":"sk-xxx","model":"moonshot-v1-32k"},
  {"name":"gemini","baseUrl":"https://generativelanguage.googleapis.com/v1beta/openai/","apiKey":"xxx","model":"gemini-1.5-flash"}
]
```

- 数组第一个为主 provider，失败后按顺序降级
- 每个 provider 最多尝试 3 次（首次 + 重试 2 次），间隔 1s
- 仅网络错误 / API 报错触发重试，降级是 per-turn 独立的

### 实现结构

```
server/src/llm/
├── types.ts          # ProviderConfig 接口 + loadProviderConfigs()
└── ProviderChain.ts  # 统一客户端，重试 + 降级逻辑
```

```typescript
// llm/ProviderChain.ts（核心逻辑）
export class ProviderChain {
  async *streamResponse(systemPrompt, userText): AsyncGenerator<string> {
    for (const cfg of this.configs) {
      try {
        const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })
        const stream = await callWithRetry(() =>
          client.chat.completions.create({ model: cfg.model, stream: true, messages: [...] })
        )
        for await (const chunk of stream) yield chunk.choices[0]?.delta?.content ?? ''
        return  // success
      } catch (err) {
        console.error(`[LLM] provider "${cfg.name}" failed, trying next`)
      }
    }
    throw new Error('All LLM providers failed')
  }
}
```

`streamResponse` 返回原始 chunk 流，thinking 提取和 sentence 切割保留在 `llm.ts`，不下沉到 provider。

### 扩展新 Provider

只需在 `LLM_PROVIDERS` 数组中加一个 entry，无需改代码。任何兼容 OpenAI Chat Completions API 的服务均可接入。

---

## 十二、Whisper 模型本地托管

### 问题

`@xenova/transformers` 默认从 HuggingFace CDN 下载模型，国内访问慢或被封。

### 方案

模型文件预下载到 `server/public/models/`，通过 Express 静态服务暴露，前端从本地 server 加载。

```
server/public/models/Xenova/whisper-small/
├── config.json
├── tokenizer.json
├── preprocessor_config.json
├── ...
└── onnx/
    ├── encoder_model_quantized.onnx   (~88MB)
    └── decoder_model_merged_quantized.onnx (~20MB)
```

**下载脚本**（一次性执行）：

```bash
cd server && node scripts/download-whisper.mjs
```

从 `hf-mirror.com` 下载，自动跳过已存在文件。

**Express 静态服务**（`server/src/index.ts`）：

```typescript
app.use('/models', express.static(path.join(__dirname, '..', 'public', 'models'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
}))
```

**前端配置**（`lib/stt/WhisperONNXSTT.ts`）：

```typescript
const serverOrigin = process.env.NEXT_PUBLIC_MODEL_SERVER || 'http://localhost:3001'
env.allowLocalModels = true
env.allowRemoteModels = false
env.localModelPath = `${serverOrigin}/models/`
env.useBrowserCache = true
```

浏览器首次加载后缓存到 Cache Storage，后续秒级加载。

---

## 十五、面试阶段结构

### 阶段定义

| 阶段 key | 名称 | 内容 | 软素质考察 |
|----------|------|------|-----------|
| `intro` | 自我介绍 | 候选人自述，AI 轻度追问 | — |
| `project` | 项目经历 | 真实性、复杂度、贡献、技术决策、项目价值 | 工作方法、困难处理、团队协作 |
| `skill` | 技能考察 | 题库驱动，由浅入深 | 学习方法、技术判断力、时间管理 |
| `closing` | 收尾 | 感谢候选人，说结束语 | — |

软素质（沟通、效率、项目管理）**穿插在 project/skill 阶段**，不作独立阶段。

### 阶段切换机制

- LLM 在每轮 thinking 中输出 `current_stage`，决定是否切换
- 服务端单调递增保护：只允许前进，忽略回退
- 阶段指令注入 system prompt，LLM 根据阶段行为不同（intro 不出技术题；project 不消耗题库；skill 才从候选题中选题）

### 跳过自我介绍

Setup 页面提供 checkbox：**"跳过自我介绍，直接进入技术考察"**

- 勾选后 `session_init` 携带 `skipIntro: true`
- 服务端 `currentStage` 初始化为 `'project'`
- 前端 `StageIndicator` 隐藏"自我介绍" pill

---

## 十四、简历支持

### 输入方式

Setup 页面支持两种方式：
1. **文本粘贴**：直接在 textarea 中粘贴简历纯文本
2. **文件上传**：支持 `.txt` / `.pdf` / `.docx`，客户端解析提取纯文本

| 格式 | 解析库 | 加载方式 |
|------|--------|---------|
| `.txt` | 原生 `File.text()` | 同步 |
| `.pdf` | `pdfjs-dist` | 动态 `import()`，不影响初始包 |
| `.docx` | `mammoth` | 动态 `import()`，不影响初始包 |

### 简历在系统中的流转

```
setup 页面 → settingsStore.resumeText
    ↓
session_init WS 消息（resumeText 字段）
    ↓
InterviewSession.resumeText（服务端内存）
    ↓
buildSystemPrompt() 注入"候选人简历"段落
    ↓
LLM 据此考察项目真实性、深度、贡献
```

简历文本限制：> 50,000 字符时 UI 显示警告（不阻断）。

---

## 十六、WebSocket 协议

### Client → Server

```typescript
type ClientMessage =
  | {
      type: 'session_init'
      sessionId: string
      totalMinutes?: number      // 面试总时长（默认 90）
      resumeText?: string        // 简历文本（可选）
      skipIntro?: boolean        // 跳过自我介绍（可选）
      // 注：题库配置在服务端环境变量中，不经由客户端传递
    }
  | { type: 'user_turn'; sessionId: string; text: string }
  | { type: 'session_end'; sessionId: string }
```

### Server → Client

```typescript
type ServerMessage =
  | { type: 'session_ready' }
  | { type: 'thinking'; payload: ThinkingPayload }
  | { type: 'sentence'; text: string }
  | { type: 'turn_end'; askedIds: string[] }   // 每轮结束，携带最新 askedIds
  | { type: 'report'; report: EvaluationReport }
  | { type: 'error'; message: string }
```

### 会话生命周期

```
client                          server
  │──session_init──────────────→│  创建 InterviewSession
  │←──session_ready─────────────│
  │                              │
  │──user_turn──────────────────→│  skill 阶段：用 session.nextFocus 查 Supabase
  │                              │  → 候选题注入 systemPrompt
  │                              │  → streamInterviewResponse()
  │←──thinking──────────────────│  applyThinking()：保存 nextFocus，更新状态
  │←──sentence (×N)─────────────│  TTS 逐句播放
  │←──turn_end──────────────────│  携带最新 askedIds
  │                              │
  │──session_end────────────────→│  generateReport()
  │←──report────────────────────│  前端跳转报告页
```

**断线重连**：`ws.onclose` 非正常关闭（code ≠ 1000）时，2 秒后自动重置状态为 `'connecting'`，UI 显示红色断开 banner + 重新连接按钮。

---

## 十七、Setup 配置页

路径：`/interview/setup`，面试前必经页面（无配置时自动跳转）。

| 配置项 | 说明 |
|--------|------|
| 简历 | 文本粘贴或文件上传，AI 据此考察项目经历 |
| 目标公司 | 多选，优先出对应公司高频题 |
| 技能方向 | 多选，对应简历技术栈，AI 优先考察 |
| 面试时长 | 30 / 45 / 60 / 90 分钟 |
| 跳过自我介绍 | checkbox，直接进入项目/技能考察 |
| STT 引擎 | WebSpeech（Chrome）/ Whisper ONNX（跨浏览器） |
| TTS 引擎 | Murf API / Azure TTS / 系统语音（降级） |
| Murf API Key | 填入后在浏览器直接调用 Murf，不经过后端 |
| Azure TTS | API Key + Region（可选） |

所有配置持久化到 `localStorage`（key: `ai-interview-settings`），下次进入自动恢复。

### 题库模式 vs LLM 自主出题

题库开关在**服务端环境变量**控制（`ENABLE_QUESTION_BANK`），前端无需配置：

| 模式 | 触发条件 | skill 阶段行为 |
|------|---------|--------------|
| 题库模式 | `ENABLE_QUESTION_BANK=true` + Supabase 可用 | 每轮按 `next_focus` 动态查库，候选题注入 prompt，`action=next_question` |
| LLM 自主 | `ENABLE_QUESTION_BANK=false`（默认） | LLM 根据简历和上下文自主设计问题，`action=follow_up` |

System Prompt 根据候选题是否为空自动切换指令文案，LLM 无感知切换。
