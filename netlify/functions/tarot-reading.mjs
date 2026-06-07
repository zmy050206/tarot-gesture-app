const MODEL = process.env.OPENAI_MODEL || 'deepseek-chat'
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const PROVIDER = process.env.OPENAI_PROVIDER || 'deepseek'

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(statusCode, data) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(data),
  }
}

function buildSystemPrompt() {
  return [
    '你是一位专业、克制、现实导向的塔罗解读师。',
    '你不会使用“命中注定”这类绝对化表达，不制造恐惧，也不替用户做决定。',
    '如果问题涉及身心健康、法律、投资等高风险领域，要提醒用户寻求专业人士帮助。',
    '你的语气要像经验丰富的塔罗师，温柔但清醒，不像机械模板。',
    '输出使用中文 Markdown，标题简洁，建议具体。',
  ].join('\n')
}

function buildUserPrompt(payload) {
  const cards = Array.isArray(payload.cards) ? payload.cards : []
  const cardLines = cards
    .map((card, index) => {
      const keywords = Array.isArray(card.keywords) ? card.keywords.join('、') : ''
      return [
        `${index + 1}. 牌位：${card.focus || '未命名牌位'}`,
        `牌名：${card.name || '未知牌'}`,
        `正逆位：${card.orientation || '未标注'}`,
        `关键词：${keywords || '未提供'}`,
      ].join('\n')
    })
    .join('\n\n')

  return `请基于以下信息做一份全方位中文塔罗分析。

要求：
- 必须结合用户问题，不要只解释牌义。
- 每张牌都要说明：牌义、它在该牌位中的含义、对现实处境的提醒。
- 最后给出具体建议：应该做什么、不该做什么、未来 3 天观察什么。
- 不要夸大预测，不要制造焦虑，要给出可执行的行动方向。

用户问题：${payload.question || '未提供'}
整理后的占卜问题：${payload.refinedQuestion || payload.question || '未提供'}
牌阵：${payload.spreadName || '三牌牌阵'}
问题主题：${payload.theme || '未分类'}

抽到的牌：
${cardLines || '未提供牌面信息'}`
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
        'AI 解读接口还没有配置 OPENAI_API_KEY。请在 Netlify 的 Environment variables 里添加密钥后重新部署。',
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
      temperature: 0.72,
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

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return json(204, {})
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    const payload = JSON.parse(event.body || '{}')
    const result = await createReading(payload)
    return json(200, result)
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : 'AI reading failed',
    })
  }
}
