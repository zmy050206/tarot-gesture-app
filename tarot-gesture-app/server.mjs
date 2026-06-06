import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'

function loadLocalEnv() {
  if (!existsSync('.env')) return
  const lines = readFileSync('.env', 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const equalsAt = trimmed.indexOf('=')
    if (equalsAt < 1) continue
    const key = trimmed.slice(0, equalsAt).trim()
    const value = trimmed.slice(equalsAt + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const PORT = Number(process.env.TAROT_AI_PORT || 8787)
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-mini'

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 64_000) {
        reject(new Error('Request is too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function buildPrompt(payload) {
  const cards = Array.isArray(payload.cards) ? payload.cards : []
  const cardLines = cards
    .map(
      (card, index) =>
        `${index + 1}. 牌位：${card.focus}\n牌名：${card.name}\n正逆位：${card.orientation}\n关键词：${(card.keywords || []).join('、')}`,
    )
    .join('\n\n')

  return `你是一位专业、克制、现实导向的塔罗解读师。请基于用户问题、牌阵和三张牌做一份全方位中文分析。

要求：
- 不要说“命中注定”，不要制造恐惧，也不要替用户做绝对决定。
- 必须结合用户问题，不要只解释牌义。
- 每张牌都要说明：牌义、它在该牌位中的含义、对现实处境的提醒。
- 最后给出具体建议：该做什么、不该做什么、未来3天观察什么。
- 如果问题涉及身心健康、法律、投资等高风险领域，要提醒用户寻求专业人士帮助。
- 语气要像专业塔罗师，不要像机器模板。
- 输出结构使用 Markdown，标题简洁。

用户问题：${payload.question || '未提供'}
整理后的占卜问题：${payload.refinedQuestion || payload.question || '未提供'}
牌阵：${payload.spreadName || '三牌牌阵'}
问题主题：${payload.theme || '未分类'}

抽到的牌：
${cardLines}
`
}

function extractText(data) {
  if (typeof data.output_text === 'string') return data.output_text
  const parts = []
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text)
      }
    }
  }
  return parts.join('\n').trim()
}

async function createReading(payload) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      source: 'fallback',
      model: null,
      text:
        'AI 解读接口还没有配置 OPENAI_API_KEY。现在先使用页面里的本地规则解读。配置密钥后，这里会生成结合问题、牌阵、正逆位和行动建议的完整 AI 分析。',
    }
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: buildPrompt(payload),
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI API request failed with ${response.status}`)
  }

  return {
    source: 'openai',
    model: MODEL,
    text: extractText(data) || 'AI 已返回，但没有解析到文本内容。',
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (req.method !== 'POST' || req.url !== '/api/tarot-reading') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  try {
    const payload = await readJson(req)
    const result = await createReading(payload)
    sendJson(res, 200, result)
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'AI reading failed',
    })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Tarot AI server listening on http://127.0.0.1:${PORT}`)
})
