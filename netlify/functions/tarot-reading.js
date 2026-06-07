// Netlify Function: POST /api/tarot-reading
// Proxies a tarot reading request to a DeepSeek-compatible chat completions API.
// Reads OPENAI_API_KEY / OPENAI_MODEL / OPENAI_BASE_URL / OPENAI_PROVIDER from
// the Netlify site's environment variables (configured in the Netlify dashboard,
// not committed to git).

const MODEL = process.env.OPENAI_MODEL || 'deepseek-chat'
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const PROVIDER = process.env.OPENAI_PROVIDER || 'deepseek'

function buildSystemPrompt() {
  return [
    '你是一位专业、克制、现实导向的塔罗解读师。',
    '你不使用"命中注定"这类绝对化措辞，不制造恐惧，也不替用户做决定。',
    '如果问题涉及身心健康、法律、投资等高风险领域，提醒用户寻求专业人士帮助。',
    '语气像专业塔罗师，不像机器模板。',
    '输出使用 Markdown，标题简洁。',
  ].join('\n')
}

function buildUserPrompt(payload) {
  const cards = Array.isArray(payload.cards) ? payload.cards : []
  const cardLines = cards
    .map(
      (card, index) =>
        `${index + 1}. 牌位：${card.focus}\n牌名：${card.name}\n正逆位：${card.orientation}\n关键词：${(card.keywords || []).join('、')}`,
    )
    .join('\n\n')

  return `请基于以下信息做一份全方位中文分析。

要求：
- 必须结合用户问题，不要只解释牌义。
- 每张牌都要说明：牌义、它在该牌位中的含义、对现实处境的提醒。
- 最后给出具体建议：该做什么、不该做什么、未来3天观察什么。

用户问题：${payload.question || '未提供'}
整理后的占卜问题：${payload.refinedQuestion || payload.question || '未提供'}
牌阵：${payload.spreadName || '三牌牌阵'}
问题主题：${payload.theme || '未分类'}

抽到的牌：
${cardLines}
`
}

function extractText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
  }
  return ''
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

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(payload) },
      ],
      temperature: 0.7,
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || `AI API request failed with ${response.status}`)
  }

  return {
    source: PROVIDER,
    model: MODEL,
    text: extractText(data) || 'AI 已返回，但没有解析到文本内容。',
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
    body: JSON.stringify(body),
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(404, { error: 'Not found' })
  }

  let payload = {}
  try {
    payload = event.body ? JSON.parse(event.body) : {}
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  try {
    const result = await createReading(payload)
    return jsonResponse(200, result)
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'AI reading failed',
    })
  }
}
