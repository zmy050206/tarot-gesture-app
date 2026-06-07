import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { motion } from 'framer-motion'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Hand,
  MousePointer2,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import tarotBack from './assets/tarot-back.png'
import tarotFront from './assets/tarot-front.png'
import './App.css'

type TarotCard = {
  id: number
  name: string
  arcana: string
  keywords: string[]
  color: string
  image?: string
}

type Gesture = 'idle' | 'left' | 'right' | 'stop' | 'fist' | 'select' | 'point' | 'pinch'
type ReadingPhase = 'idle' | 'shuffling' | 'selecting' | 'complete'
type Screen = 'question' | 'draw' | 'reading'
type DrawMode = 'idle' | 'shuffling' | 'browsing' | 'aiming' | 'capturing' | 'selected' | 'transitioning'
type CardOrientation = 'upright' | 'reversed'
type SpreadKey = 'timeline' | 'obstacle' | 'relationship'
type GestureDebug = {
  extendedCount: number
  pinch: number
  tilt: number
}
type HandInteraction = {
  cursor?: { x: number; y: number; visible: boolean }
  gesture: Gesture
  strength?: number
  debug?: GestureDebug
}
type HandCursor = { x: number; y: number; visible: boolean }
type ReadingItem = {
  focus: string
  card: TarotCard
  orientation: CardOrientation
  text: string
  layers: {
    essence: string
    reality: string
    action: string
  }
}

type AiReadingState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  text: string
  source?: 'openai' | 'fallback'
  model?: string | null
  error?: string
}

const majorCards = [
  ['愚者', '启程', '信任', '自由'],
  ['魔术师', '意志', '创造', '显化'],
  ['女祭司', '直觉', '秘密', '沉静'],
  ['皇后', '丰盛', '滋养', '关系'],
  ['皇帝', '秩序', '边界', '掌控'],
  ['教皇', '传统', '信念', '指引'],
  ['恋人', '选择', '吸引', '同盟'],
  ['战车', '推进', '胜利', '自律'],
  ['力量', '温柔', '勇气', '驯服'],
  ['隐士', '独处', '洞察', '答案'],
  ['命运之轮', '转机', '循环', '契机'],
  ['正义', '平衡', '因果', '判断'],
  ['倒吊人', '暂停', '换位', '牺牲'],
  ['死神', '结束', '蜕变', '清理'],
  ['节制', '调和', '疗愈', '耐心'],
  ['恶魔', '执念', '诱惑', '束缚'],
  ['高塔', '冲击', '真相', '重建'],
  ['星星', '希望', '祝福', '复原'],
  ['月亮', '迷雾', '梦境', '不安'],
  ['太阳', '喜悦', '坦荡', '成功'],
  ['审判', '唤醒', '回应', '召唤'],
  ['世界', '完成', '整合', '抵达'],
]

const suits = ['权杖', '圣杯', '宝剑', '星币']
const ranks = ['王牌', '二', '三', '四', '五', '六', '七', '八', '九', '十', '侍从', '骑士', '王后', '国王']
const suitSlugs = ['wands', 'cups', 'swords', 'pentacles']
const rankSlugs = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'page', 'knight', 'queen', 'king']
const colors = ['#f65ca9', '#9a6dff', '#54d9ff', '#f6b950', '#58e6a7', '#ff7468']
const spreadOptions: Array<{ key: SpreadKey; name: string; hint: string; positions: [string, string, string] }> = [
  {
    key: 'timeline',
    name: '时间线牌阵',
    hint: '适合看事情如何从过去走到下一步。',
    positions: ['过去的线索', '现在的能量', '未来的建议'],
  },
  {
    key: 'obstacle',
    name: '问题牌阵',
    hint: '适合看卡住点、真正阻碍和可执行建议。',
    positions: ['问题核心', '隐藏阻碍', '行动建议'],
  },
  {
    key: 'relationship',
    name: '关系牌阵',
    hint: '适合关系、合作、暧昧、沟通与双方状态。',
    positions: ['你的状态', '对方状态', '关系走向'],
  },
]
const cardSpacing = 124

const minorCardArtById = Object.fromEntries(
  suitSlugs.flatMap((suit, suitIndex) =>
    rankSlugs.map((rank, rankIndex) => [
      22 + suitIndex * rankSlugs.length + rankIndex,
      `/tarot-cards/${rank}-of-${suit}.png`,
    ]),
  ),
) as Record<number, string>

const cardArtById: Record<number, string> = {
  0: '/tarot-cards/the-fool.png',
  1: '/tarot-cards/the-magician.png',
  2: '/tarot-cards/the-high-priestess.png',
  3: '/tarot-cards/the-empress.png',
  4: '/tarot-cards/the-emperor.png',
  5: '/tarot-cards/the-hierophant.png',
  6: '/tarot-cards/the-lovers.png',
  7: '/tarot-cards/the-chariot.png',
  8: '/tarot-cards/strength.png',
  9: '/tarot-cards/the-hermit.png',
  10: '/tarot-cards/wheel-of-fortune.png',
  11: '/tarot-cards/justice.png',
  12: '/tarot-cards/the-hanged-man.png',
  13: '/tarot-cards/death.png',
  14: '/tarot-cards/temperance.png',
  15: '/tarot-cards/the-devil.png',
  16: '/tarot-cards/the-tower.png',
  17: '/tarot-cards/the-star.png',
  18: '/tarot-cards/the-moon.png',
  19: '/tarot-cards/the-sun.png',
  20: '/tarot-cards/judgement.png',
  21: '/tarot-cards/the-world.png',
  ...minorCardArtById,
}

const tarotDeck: TarotCard[] = [
  ...majorCards.map(([name, ...keywords], index) => ({
    id: index,
    name,
    arcana: '大阿卡纳',
    keywords,
    color: colors[index % colors.length],
    image: cardArtById[index],
  })),
  ...suits
    .flatMap((suit, suitIndex) =>
      ranks.map((rank, rankIndex) => {
        const id = 22 + suitIndex * ranks.length + rankIndex
        return {
          id,
          name: `${rank}${suit}`,
          arcana: '小阿卡纳',
          keywords: [
            ['行动', '火花', '主动'][rankIndex % 3],
            ['情绪', '选择', '沟通'][suitIndex % 3],
            ['进展', '提醒', '调整'][(rankIndex + suitIndex) % 3],
          ],
          color: colors[(rankIndex + suitIndex * 2) % colors.length],
          image: cardArtById[id],
        }
      }),
    )
]

function shuffleCards(cards: TarotCard[]) {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function cardFront(card?: TarotCard) {
  return card?.image ?? tarotFront
}

function toRoman(value: number) {
  const numerals: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ]
  let rest = value
  let result = ''
  numerals.forEach(([number, roman]) => {
    while (rest >= number) {
      result += roman
      rest -= number
    }
  })
  return result
}

function cardDisplayName(card?: TarotCard) {
  if (!card) return '未知'
  if (card.id < majorCards.length) {
    return card.id === 0 ? `${card.name} 0` : `${card.name} ${toRoman(card.id)}`
  }

  const minorIndex = card.id - majorCards.length
  const suit = suits[Math.floor(minorIndex / ranks.length)]
  const rankIndex = minorIndex % ranks.length
  const rank = ranks[rankIndex]
  if (rankIndex <= 9) return `${suit} ${toRoman(rankIndex + 1)}`
  return `${suit} ${rank}`
}

function orientationLabel(orientation: CardOrientation) {
  return orientation === 'reversed' ? '逆位' : '正位'
}

function clampTrackPosition(position: number, length: number) {
  if (length <= 1) return 0
  return Math.max(0, Math.min(length - 1, position))
}

function clampIndex(position: number, length: number) {
  return Math.round(clampTrackPosition(position, length))
}

function refineQuestion(question: string) {
  const trimmed = question.trim()
  if (!trimmed) return ''
  const clean = trimmed.replace(/[？?。.!！]+$/g, '')
  if (/我该|如何|怎样|怎么|是否|能不能|会不会/.test(clean)) {
    return `${clean}？`
  }
  return `关于「${clean}」，我现在最需要看清什么？`
}

function inferQuestionTheme(question: string) {
  const text = question.toLowerCase()
  if (/(感情|关系|复合|喜欢|爱|恋|婚|伴侣|对象)/.test(text)) return 'relationship'
  if (/(工作|事业|职业|跳槽|老板|同事|项目|offer|创业|赚钱|收入)/.test(text)) return 'career'
  if (/(学业|考试|学习|论文|学校|专业|申请)/.test(text)) return 'study'
  if (/(健康|身体|焦虑|压力|睡眠|情绪|状态)/.test(text)) return 'wellbeing'
  return 'choice'
}

function themeLabel(theme: string) {
  if (theme === 'relationship') return '关系与情感'
  if (theme === 'career') return '事业与行动'
  if (theme === 'study') return '学习与成长'
  if (theme === 'wellbeing') return '身心状态'
  return '选择与方向'
}

function themeAdvice(theme: string) {
  if (theme === 'relationship') return '不要只看对方的反应，也要看自己是否在这段关系里感到稳定、被尊重和能表达真实需求。'
  if (theme === 'career') return '把判断从“想不想”落到“成本、资源、时机、下一步证据”上，先做一个低风险验证。'
  if (theme === 'study') return '与其追求马上看见结果，不如先建立可持续节奏，把目标拆成每天能完成的小块。'
  if (theme === 'wellbeing') return '先降低消耗，再谈突破；身体和情绪给出的信号，是你做决定时不能忽略的信息。'
  return '这不是让你立刻押注某个答案，而是先看清自己真正害怕失去什么、真正想靠近什么。'
}

function cardMeaning(card: TarotCard, position: string, theme: string, question: string, positionIndex = 0) {
  const keywords = card.keywords.join('、')
  const subject = `围绕「${question}」`
  if (positionIndex === 0) {
    return `${position}的「${card.name}」说明，过去影响你的核心不是单一事件，而是一种关于${keywords}的惯性。${subject}，这张牌提醒你先分辨：哪些判断来自经验，哪些只是旧有防御。`
  }
  if (positionIndex === 1) {
    return `${position}的「${card.name}」显示，当下最活跃的能量是${keywords}。${subject}，你现在不适合完全被情绪推着走，应该把直觉转成一个可以验证的行动。`
  }
  return `${position}的「${card.name}」给出的建议，是把${keywords}作为未来几天的观察重点。${subject}，答案不会只靠等待出现，你需要主动创造一个更清晰的反馈。${themeAdvice(theme)}`
}

function layeredReading(card: TarotCard, _position: string, theme: string, question: string, orientation: CardOrientation, positionIndex = 0) {
  const keywords = card.keywords.slice(0, 3)
  const themeTone = themeLabel(theme)
  const cleanQuestion = question || '当前的问题'
  const orientationTone =
    orientation === 'reversed'
      ? '逆位让这股能量表现为阻滞、迟疑或内在消耗，需要先松开卡住你的部分。'
      : '正位说明这股能量可以被直接使用，关键在于把它落成清晰行动。'
  const positionGuide =
    positionIndex === 0
      ? '这张牌指出过去留下的惯性，以及你可能仍在沿用的旧判断。'
      : positionIndex === 1
        ? '这张牌显示此刻最活跃的能量，也就是当下最需要被看见的矛盾。'
        : '这张牌给出未来几天更值得尝试的方向，而不是绝对结论。'
  const reality =
    positionIndex === 0
      ? `你在「${cleanQuestion}」里可能并不是缺少答案，而是被旧经验牵引。${card.name} 提醒你先分清：哪些判断来自事实，哪些只是防御。${orientationTone}`
      : positionIndex === 1
        ? `围绕「${cleanQuestion}」，现在真正需要处理的是 ${keywords[0]} 与 ${keywords[1] ?? keywords[0]} 之间的张力。不要急着证明自己是对的，先把可验证的信息摆出来。${orientationTone}`
        : `接下来不要只等待局面自然明朗。${card.name} 要你主动制造一个小反馈，让现实告诉你下一步该靠近还是后退。${orientationTone}`
  const action =
    theme === 'relationship'
      ? '用一句清楚的话表达需求，不用试探代替沟通。观察对方是否愿意回应你的边界。'
      : theme === 'career'
        ? '把决定拆成成本、资源、时间和反馈四项，本周先做一个低风险验证。'
        : theme === 'study'
          ? '把目标拆成今天能完成的一小步，用完成度判断进展，不用焦虑感判断。'
          : theme === 'wellbeing'
            ? '先降低消耗，安排一次休息或记录，再决定是否继续推进。'
            : '给自己 48 小时收集证据，先测试一个最小行动，再回来修正判断。'

  return {
    essence: `${orientationLabel(orientation)}的 ${card.name} 核心能量是 ${keywords.join(' / ')}。在「${themeTone}」里，它更像一个提醒：${positionGuide}`,
    reality,
    action,
  }
}

function followUpReading(
  followUp: string,
  originalQuestion: string,
  theme: string,
  spreadName: string,
  items: ReadingItem[],
) {
  const cleanFollowUp = followUp.trim()
  const anchor = items
    .map((item) => `${item.focus}：${cardDisplayName(item.card)}（${orientationLabel(item.orientation)}）`)
    .join('；')
  const themeName = themeLabel(theme)
  const reversedCount = items.filter((item) => item.orientation === 'reversed').length
  const actionCard = items[2]
  const tensionCard = items[1] ?? items[0]
  const asksWhy = /为什么|原因|why|怎么会|为何/.test(cleanFollowUp)
  const asksAction = /怎么办|怎么做|建议|行动|下一步|应该/.test(cleanFollowUp)
  const asksOutcome = /结果|未来|会不会|能不能|是否|可能/.test(cleanFollowUp)
  const tone =
    reversedCount >= 2
      ? '这组三牌里逆位偏多，说明问题的关键不是立刻推进，而是先处理阻滞、误解或内在消耗。'
      : '这组三牌的能量比较可用，重点是把直觉转成一个能被现实验证的小行动。'

  if (asksWhy) {
    return `围绕你的追问「${cleanFollowUp}」，牌面给出的原因线索是：${anchor}。在「${spreadName}」和「${themeName}」主题里，${tensionCard.focus} 的 ${cardDisplayName(tensionCard.card)} 最像核心矛盾。${tone} 结合原问题「${originalQuestion}」，你可以先问自己：我是在回应事实，还是在回应过去形成的预设？`
  }

  if (asksOutcome) {
    return `关于「${cleanFollowUp}」，这副牌不把结果说成单一注定，而是给出「${themeName}」里的趋势：${anchor}。如果你继续沿用现在的方式，${tensionCard.focus} 的能量会反复出现；如果你采纳 ${actionCard.focus} 的提示，局面会更容易朝清晰、可沟通、可验证的方向发展。${tone}`
  }

  if (asksAction) {
    return `针对「${cleanFollowUp}」，最直接的行动建议来自 ${actionCard.focus} 的 ${cardDisplayName(actionCard.card)}：${actionCard.layers.action} 今天不要试图一次解决全部问题，只做一个能带来「${themeName}」反馈的小动作。${tone}`
  }

  return `我会把你的追问「${cleanFollowUp}」放回原问题「${originalQuestion}」里看。当前牌阵是「${spreadName}」，三张牌为：${anchor}。重点不是寻找绝对答案，而是看见这三股力量如何互相牵引：先辨认 ${items[0].focus} 的惯性，再处理 ${tensionCard.focus} 的矛盾，最后用 ${actionCard.focus} 的建议做一次小验证。${tone}`
}

function buildReadingSummary({
  question,
  spreadName,
  theme,
  reading,
  summaryAdvice,
  followUpQuestion,
  followUpAnswer,
}: {
  question: string
  spreadName: string
  theme: string
  reading: ReadingItem[]
  summaryAdvice: string
  followUpQuestion: string
  followUpAnswer: string
}) {
  const cards = reading
    .map(
      (item, index) =>
        `${index + 1}. ${item.focus}｜${cardDisplayName(item.card)}（${orientationLabel(item.orientation)}）\n` +
        `牌义：${item.layers.essence}\n` +
        `现实提醒：${item.layers.reality}\n` +
        `行动：${item.layers.action}`,
    )
    .join('\n\n')
  const followUp = followUpAnswer
    ? `\n\n追问：${followUpQuestion}\n追加解读：${followUpAnswer}`
    : ''

  return `Vibecoding Tarot Reading\n\n问题：${question}\n牌阵：${spreadName}\n主题：${themeLabel(theme)}\n\n${cards}\n\n总建议：${summaryAdvice}${followUp}`
}

function buildShareSnippet({
  question,
  spreadName,
  theme,
  reading,
}: {
  question: string
  spreadName: string
  theme: string
  reading: ReadingItem[]
}) {
  const cards = reading
    .map((item) => `${item.focus}：${cardDisplayName(item.card)}（${orientationLabel(item.orientation)}）`)
    .join('｜')
  const signal = reading[2]?.layers.action || reading[1]?.layers.reality || '把问题拆小，用一个可验证的行动回应现实。'
  return `我的塔罗三牌：${spreadName}\n问题：${question}\n主题：${themeLabel(theme)}\n${cards}\n\n今日提醒：${signal}\n\n#VibecodingTarot`
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function downloadTextFile(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function safeFilename(text: string) {
  const base = text.trim().slice(0, 28).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-')
  return `${base || 'tarot-reading'}-${new Date().toISOString().slice(0, 10)}.txt`
}

function actionSteps(theme: string, cards: TarotCard[]) {
  const sharedKeywords = cards.flatMap((card) => card.keywords).slice(0, 5).join('、')
  if (theme === 'relationship') {
    return `行动建议：先写下你最想确认的一句话，再找一个平静时机表达；不要用试探代替沟通。接下来观察对方是否愿意回应你的边界与需求。关键词：${sharedKeywords}。`
  }
  if (theme === 'career') {
    return `行动建议：列出三个可验证指标，例如时间成本、收益空间、他人反馈；本周先完成一个最小尝试，而不是马上做终局决定。关键词：${sharedKeywords}。`
  }
  if (theme === 'study') {
    return `行动建议：把目标拆成 3 个小任务，今天只完成第一个；用完成度而不是焦虑程度判断自己是否在前进。关键词：${sharedKeywords}。`
  }
  if (theme === 'wellbeing') {
    return `行动建议：先安排一次真正的休息和一次情绪记录，再决定下一步；如果压力持续影响生活，要优先寻求现实支持。关键词：${sharedKeywords}。`
  }
  return `行动建议：给自己 48 小时收集证据，不急着定论；选择一个最小行动去测试现实反馈，再回来调整判断。关键词：${sharedKeywords}。`
}

function App() {
  const [screen, setScreen] = useState<Screen>('question')
  const [question, setQuestion] = useState('')
  const [spreadKey, setSpreadKey] = useState<SpreadKey>('timeline')
  const [isFocusing, setIsFocusing] = useState(false)
  const [focusCount, setFocusCount] = useState(5)
  const [phase, setPhase] = useState<ReadingPhase>('idle')
  const [deckOrder, setDeckOrder] = useState(() => shuffleCards(tarotDeck))
  const [trackPosition, setTrackPosition] = useState(0)
  const [selectedCards, setSelectedCards] = useState<TarotCard[]>([])
  const [cardOrientations, setCardOrientations] = useState<Record<number, CardOrientation>>({})
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [followUpAnswer, setFollowUpAnswer] = useState('')
  const [aiReading, setAiReading] = useState<AiReadingState>({ status: 'idle', text: '' })
  const [copyFeedback, setCopyFeedback] = useState('')
  const [downloadFeedback, setDownloadFeedback] = useState('')
  const [shareFeedback, setShareFeedback] = useState('')
  const [pendingCard, setPendingCard] = useState<TarotCard | null>(null)
  const [isRevealed, setIsRevealed] = useState(false)
  const [gesture, setGesture] = useState<Gesture>('idle')
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [controlMode, setControlMode] = useState<'camera' | 'mouse'>('camera')
  const [shuffleRun, setShuffleRun] = useState(0)
  const [shuffleProgress, setShuffleProgress] = useState(0)
  const [isGesturePaused, setIsGesturePaused] = useState(false)
  const [handCursor, setHandCursor] = useState({ x: 0.5, y: 0.5, visible: false })
  const [selectionBurst, setSelectionBurst] = useState(0)
  const [drawMode, setDrawMode] = useState<DrawMode>('idle')
  const [capturingCard, setCapturingCard] = useState<TarotCard | null>(null)
  const [particleOrigin, setParticleOrigin] = useState({ x: 50, y: 43 })
  const [railSpacing, setRailSpacing] = useState(() =>
    typeof window === 'undefined' ? cardSpacing : Math.max(140, Math.min(154, window.innerWidth / 9.4)),
  )
  const [viewportCards, setViewportCards] = useState(() =>
    typeof window === 'undefined' ? 9 : Math.max(7, Math.min(11, window.innerWidth / Math.max(140, Math.min(154, window.innerWidth / 9.4)))),
  )
  const [gestureDebug, setGestureDebug] = useState<GestureDebug | null>(null)

  const activeCardRef = useRef<TarotCard>(deckOrder[0])
  const selectedCardsRef = useRef<TarotCard[]>([])
  const pendingCardRef = useRef<TarotCard | null>(null)
  const capturingCardRef = useRef<TarotCard | null>(null)
  const phaseRef = useRef<ReadingPhase>('idle')
  const trackPositionRef = useRef(0)
  const targetTrackRef = useRef(0)
  const handVelocityRef = useRef(0)
  const rafTrackRef = useRef<number | null>(null)
  const rafShuffleRef = useRef<number | null>(null)
  const lastCaptureAtRef = useRef(0)
  const gestureConfirmLockedRef = useRef(false)
  const gestureReadyAtRef = useRef(0)
  const gestureVelocityRef = useRef(0)
  const pinchTapRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 })
  const dragRef = useRef<{ startX: number; startPosition: number } | null>(null)

  const activeIndex = clampIndex(trackPosition, deckOrder.length)
  const activeCard = deckOrder[activeIndex] ?? deckOrder[0]
  const isShuffling = phase === 'shuffling'
  const isPreviewing = pendingCard !== null
  const canSlide = phase === 'selecting' && selectedCards.length < 3 && drawMode !== 'capturing'
  const canSelect = phase === 'selecting' && selectedCards.length < 3 && drawMode !== 'capturing'
  const refinedQuestion = useMemo(() => refineQuestion(question), [question])
  // Render all cards in the viewport so the rail feels fully expanded.
  // Z-fighting between neighbors is mitigated via low opacity + blur, not by
  // hiding cards (which made the rail look like a single static card).
  const visibleRadius = Math.max(3, Math.ceil(viewportCards / 2))

  useEffect(() => {
    activeCardRef.current = activeCard
  }, [activeCard])

  useEffect(() => {
    selectedCardsRef.current = selectedCards
  }, [selectedCards])

  useEffect(() => {
    pendingCardRef.current = pendingCard
  }, [pendingCard])

  useEffect(() => {
    capturingCardRef.current = capturingCard
  }, [capturingCard])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    trackPositionRef.current = trackPosition
  }, [trackPosition])

  useEffect(() => {
    const updateViewportCards = () => {
      const nextSpacing = Math.max(140, Math.min(154, window.innerWidth / 9.4))
      setRailSpacing(nextSpacing)
      setViewportCards(Math.max(7, Math.min(11, window.innerWidth / nextSpacing)))
    }
    updateViewportCards()
    window.addEventListener('resize', updateViewportCards)
    return () => window.removeEventListener('resize', updateViewportCards)
  }, [deckOrder.length])

  useEffect(() => {
    const tick = () => {
      if (phaseRef.current === 'selecting' && !pendingCardRef.current) {
        const velocity = handVelocityRef.current
        if (Math.abs(velocity) > 0.003) {
          targetTrackRef.current += velocity
          handVelocityRef.current *= 0.972
        }
        targetTrackRef.current = clampTrackPosition(targetTrackRef.current, deckOrder.length)
        const current = trackPositionRef.current
        const next = current + (targetTrackRef.current - current) * 0.26
        if (Math.abs(next - current) > 0.0008) {
          trackPositionRef.current = next
          setTrackPosition(next)
        }
      }
      rafTrackRef.current = requestAnimationFrame(tick)
    }
    rafTrackRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafTrackRef.current) cancelAnimationFrame(rafTrackRef.current)
    }
  }, [deckOrder.length])

  useEffect(() => {
    return () => {
      if (rafShuffleRef.current) cancelAnimationFrame(rafShuffleRef.current)
    }
  }, [])

  const visibleCards = useMemo(() => {
    const radius = phase === 'shuffling' ? 8 : visibleRadius
    return deckOrder
      .map((card, index) => ({
        card,
        index,
        offset: index - trackPosition,
      }))
      .filter(({ offset }) => Math.abs(offset) <= radius)
  }, [deckOrder, phase, trackPosition, visibleRadius])

  const shuffleCardsInView = useMemo(() => {
    const cards = []
    const baseIndex = Math.floor(trackPosition)
    const fractionalOffset = trackPosition - baseIndex
    const radius = phase === 'shuffling' ? 8 : 5
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = Math.max(0, Math.min(deckOrder.length - 1, baseIndex + offset))
      cards.push({
        card: deckOrder[index],
        index,
        offset: offset - fractionalOffset,
      })
    }
    return cards
  }, [deckOrder, phase, trackPosition])

  const startReading = useCallback(() => {
    if (rafShuffleRef.current) cancelAnimationFrame(rafShuffleRef.current)
    setSelectedCards([])
    setCardOrientations({})
    setFollowUpQuestion('')
    setFollowUpAnswer('')
    setAiReading({ status: 'idle', text: '' })
    setCopyFeedback('')
    setDownloadFeedback('')
    setShareFeedback('')
    setPendingCard(null)
    setCapturingCard(null)
    pendingCardRef.current = null
    capturingCardRef.current = null
    setIsRevealed(false)
    setIsGesturePaused(false)
    setHandCursor((cursor) => ({ ...cursor, visible: false }))
    gestureConfirmLockedRef.current = false
    gestureReadyAtRef.current = performance.now() + 900
    pinchTapRef.current = { count: 0, lastAt: 0 }
    setPhase('shuffling')
    setDrawMode('shuffling')
    setShuffleProgress(0)
    setShuffleRun((run) => run + 1)
    setTrackPosition(0)
    trackPositionRef.current = 0
    targetTrackRef.current = 0
    handVelocityRef.current = 0
    gestureVelocityRef.current = 0
    pinchTapRef.current = { count: 0, lastAt: 0 }

    const duration = 2800
    const startedAt = performance.now()
    const animateShuffle = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      setShuffleProgress(progress)
      if (progress < 1) {
        rafShuffleRef.current = requestAnimationFrame(animateShuffle)
        return
      }
      rafShuffleRef.current = null
      setDeckOrder(shuffleCards(tarotDeck))
      const nextPosition = Math.floor(Math.random() * tarotDeck.length)
      setTrackPosition(nextPosition)
      trackPositionRef.current = nextPosition
      targetTrackRef.current = nextPosition
      gestureConfirmLockedRef.current = false
      gestureReadyAtRef.current = performance.now() + 650
      setPhase('selecting')
      setDrawMode('browsing')
    }
    rafShuffleRef.current = requestAnimationFrame(animateShuffle)
  }, [])

  const goToDraw = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!question.trim() || isFocusing) return
    setIsFocusing(true)
    setFocusCount(5)
    Array.from({ length: 5 }).forEach((_, index) => {
      window.setTimeout(() => setFocusCount(4 - index), (index + 1) * 1000)
    })
    window.setTimeout(() => {
      resetReadingState()
      setScreen('draw')
      setIsFocusing(false)
    }, 5200)
  }

  const backToQuestion = () => {
    resetReadingState()
    setScreen('question')
    setIsFocusing(false)
    setFocusCount(5)
  }

  const resetReadingState = () => {
    if (rafShuffleRef.current) {
      cancelAnimationFrame(rafShuffleRef.current)
      rafShuffleRef.current = null
    }
    setSelectedCards([])
    setCardOrientations({})
    setFollowUpQuestion('')
    setFollowUpAnswer('')
    setAiReading({ status: 'idle', text: '' })
    setCopyFeedback('')
    setDownloadFeedback('')
    setShareFeedback('')
    setPendingCard(null)
    setCapturingCard(null)
    pendingCardRef.current = null
    capturingCardRef.current = null
    setIsRevealed(false)
    setIsGesturePaused(false)
    setHandCursor((cursor) => ({ ...cursor, visible: false }))
    gestureConfirmLockedRef.current = false
    gestureReadyAtRef.current = 0
    setPhase('idle')
    setDrawMode('idle')
    setShuffleProgress(0)
    setTrackPosition(0)
    trackPositionRef.current = 0
    targetTrackRef.current = 0
    handVelocityRef.current = 0
    setDeckOrder(shuffleCards(tarotDeck))
  }

  const slideDeck = useCallback((direction: 'left' | 'right', distance = 0.24) => {
    if (phaseRef.current !== 'selecting') return
    if (pendingCardRef.current) return
    setIsRevealed(false)
    targetTrackRef.current += direction === 'left' ? -distance : distance
    targetTrackRef.current = clampTrackPosition(targetTrackRef.current, deckOrder.length)
    pinchTapRef.current = { count: 0, lastAt: 0 }
  }, [deckOrder.length])

  const captureCard = useCallback((card: TarotCard, origin?: { x: number; y: number; visible: boolean }) => {
    if (phaseRef.current !== 'selecting') return
    if (capturingCardRef.current) return
    const cards = selectedCardsRef.current
    if (cards.length >= 3 || cards.some((selected) => selected.id === card.id)) {
      setPendingCard(null)
      return
    }
    const cardIndex = deckOrder.findIndex((item) => item.id === card.id)
    if (cardIndex < 0) return
    const offset = cardIndex - trackPositionRef.current
    const originX = Math.max(12, Math.min(88, 50 + (offset * railSpacing) / Math.max(1, window.innerWidth) * 100))
    setParticleOrigin({
      x: origin?.visible ? origin.x * 100 : handCursor.visible ? handCursor.x * 100 : originX,
      y: origin?.visible ? origin.y * 100 : handCursor.visible ? handCursor.y * 100 : 42,
    })
    setPendingCard(card)
    pendingCardRef.current = card
    setDrawMode('capturing')
    setCapturingCard(card)
    capturingCardRef.current = card
    setSelectionBurst((burst) => burst + 1)
    handVelocityRef.current = 0
    window.setTimeout(() => {
      const nextCards = [...selectedCardsRef.current, card]
      selectedCardsRef.current = nextCards
      setSelectedCards(nextCards)
      setCardOrientations((orientations) => ({
        ...orientations,
        [card.id]: Math.random() > 0.38 ? 'upright' : 'reversed',
      }))
      setPendingCard(null)
      setCapturingCard(null)
      pendingCardRef.current = null
      capturingCardRef.current = null
      pinchTapRef.current = { count: 0, lastAt: 0 }
      setIsRevealed(false)
      if (nextCards.length === 3) {
        setPhase('complete')
        setDrawMode('transitioning')
        window.setTimeout(() => setDrawMode('selected'), 780)
        window.setTimeout(() => setScreen('reading'), 1360)
      } else {
        handVelocityRef.current = 0
        gestureVelocityRef.current = 0
        gestureConfirmLockedRef.current = true
        gestureReadyAtRef.current = performance.now() + 1250
        targetTrackRef.current = clampTrackPosition(trackPositionRef.current + 2.2, deckOrder.length)
        setDrawMode('browsing')
        setIsGesturePaused(false)
      }
    }, 760)
  }, [deckOrder, handCursor.visible, handCursor.x, handCursor.y, railSpacing])

  const selectActive = useCallback(() => {
    if (phaseRef.current !== 'selecting' || capturingCardRef.current) return
    const card = activeCardRef.current
    const cards = selectedCardsRef.current
    if (cards.length >= 3 || cards.some((selected) => selected.id === card.id)) return
    captureCard(card)
  }, [captureCard])

  const confirmPendingCard = useCallback(() => {
    const card = pendingCardRef.current
    if (!card) return
    captureCard(card)
  }, [captureCard])

  const backToDraw = () => {
    setIsRevealed(false)
    setScreen('draw')
  }

  const rejectPendingCard = useCallback(() => {
    setPendingCard(null)
    setCapturingCard(null)
    pendingCardRef.current = null
    capturingCardRef.current = null
    setDrawMode('browsing')
    setIsGesturePaused(false)
    gestureConfirmLockedRef.current = true
    gestureReadyAtRef.current = performance.now() + 800
    pinchTapRef.current = { count: 0, lastAt: 0 }
    targetTrackRef.current = clampTrackPosition(trackPositionRef.current + 1.8, deckOrder.length)
  }, [deckOrder.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screen !== 'draw') return
      if (event.key === 'ArrowLeft') slideDeck('left', 0.55)
      if (event.key === 'ArrowRight') slideDeck('right', 0.55)
      if (event.key === 'Enter' || event.key === ' ') selectActive()
      if (event.key === 'Escape') rejectPendingCard()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rejectPendingCard, screen, selectActive, slideDeck])

  const handleHandInteraction = useCallback((interaction: HandInteraction) => {
    setGesture(interaction.gesture)
    setGestureDebug(interaction.debug ?? null)
    setHandCursor(interaction.cursor ?? { x: 0.5, y: 0.5, visible: false })

    if (interaction.gesture !== 'fist') gestureConfirmLockedRef.current = false

    if (phaseRef.current !== 'selecting') return
    if (capturingCardRef.current) return

    if (interaction.gesture === 'idle') {
      handVelocityRef.current *= 0.94
      return
    }

    if (interaction.gesture === 'stop') {
      handVelocityRef.current = 0
      gestureVelocityRef.current = 0
      setIsGesturePaused(true)
      setDrawMode('browsing')
      return
    }

    if (interaction.gesture === 'fist') {
      const now = performance.now()
      handVelocityRef.current = 0
      gestureVelocityRef.current = 0
      setIsGesturePaused(true)
      setDrawMode('browsing')
      if (!gestureConfirmLockedRef.current && now >= gestureReadyAtRef.current && now - lastCaptureAtRef.current > 900) {
        gestureConfirmLockedRef.current = true
        lastCaptureAtRef.current = now
        selectActive()
      }
      return
    }

    if (interaction.gesture === 'point') {
      handVelocityRef.current *= 0.96
      // Fix P1: 'aiming' state was dead code - the type/list/CSS/gestureEnergy
      // all reference it, but nothing was ever setting drawMode to 'aiming'.
      // Now when user points, modeLabel shows "aiming" and the deck-zone
      // background follows the fingertip (gestureEnergy jumps to 0.92).
      setDrawMode('aiming')
      return
    }

    if (interaction.gesture === 'left') {
      if (pendingCardRef.current) return
      setIsGesturePaused(false)
      setDrawMode('browsing')
      const targetVelocity = -0.072 * (interaction.strength ?? 1)
      gestureVelocityRef.current += (targetVelocity - gestureVelocityRef.current) * 0.38
      handVelocityRef.current += (gestureVelocityRef.current - handVelocityRef.current) * 0.46
      return
    }

    if (interaction.gesture === 'right') {
      if (pendingCardRef.current) return
      setIsGesturePaused(false)
      setDrawMode('browsing')
      const targetVelocity = 0.072 * (interaction.strength ?? 1)
      gestureVelocityRef.current += (targetVelocity - gestureVelocityRef.current) * 0.38
      handVelocityRef.current += (gestureVelocityRef.current - handVelocityRef.current) * 0.46
      return
    }

    if (interaction.gesture === 'pinch') return
  }, [selectActive])

  const handleHandInteractionRef = useRef(handleHandInteraction)
  useEffect(() => {
    handleHandInteractionRef.current = handleHandInteraction
  }, [handleHandInteraction])

  useEffect(() => {
    if (controlMode !== 'mouse') return
    const cursor = { x: 0.5, y: 0.5, visible: true }
    let lastEmitAt = 0
    const emit = (interaction: HandInteraction) => {
      handleHandInteractionRef.current(interaction)
    }
    const onMouseMove = (event: MouseEvent) => {
      cursor.x = Math.min(1, Math.max(0, event.clientX / window.innerWidth))
      cursor.y = Math.min(1, Math.max(0, event.clientY / window.innerHeight))
      cursor.visible = true
      const now = performance.now()
      if (now - lastEmitAt < 28) return
      lastEmitAt = now
      emit({ gesture: 'point', cursor: { ...cursor } })
    }
    const onMouseLeave = () => {
      cursor.visible = false
      emit({ gesture: 'idle', cursor: { ...cursor } })
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      emit({ gesture: 'fist' })
    }
    window.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [controlMode])

  const beginDrag = (clientX: number) => {
    if (!canSlide) return
    dragRef.current = { startX: clientX, startPosition: trackPosition }
  }

  const updateDrag = (clientX: number) => {
    const drag = dragRef.current
    if (!drag || !canSlide) return
    const nextPosition = drag.startPosition - (clientX - drag.startX) / railSpacing
    handVelocityRef.current = 0
    const clampedPosition = clampTrackPosition(nextPosition, deckOrder.length)
    targetTrackRef.current = clampedPosition
    trackPositionRef.current = clampedPosition
    setTrackPosition(clampedPosition)
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const questionTheme = inferQuestionTheme(refinedQuestion || question)
  const activeSpread = spreadOptions.find((spread) => spread.key === spreadKey) ?? spreadOptions[0]
  const spreadPositions = activeSpread.positions
  const reading = selectedCards.map((card, index) => {
    const focus = spreadPositions[index]
    const orientation = cardOrientations[card.id] ?? 'upright'
    return {
      focus,
      card,
      orientation,
      text: cardMeaning(card, focus, questionTheme, refinedQuestion || question, index),
      layers: layeredReading(card, focus, questionTheme, refinedQuestion || question, orientation, index),
    }
  })
  const summaryAdvice = selectedCards.length === 3 ? actionSteps(questionTheme, selectedCards) : ''
  const readingSummary =
    isRevealed && reading.length === 3
      ? buildReadingSummary({
          question: refinedQuestion || question,
          spreadName: activeSpread.name,
          theme: questionTheme,
          reading,
          summaryAdvice,
          followUpQuestion,
          followUpAnswer,
        })
      : ''
  const fullReadingSummary =
    readingSummary && aiReading.status === 'ready' && aiReading.text
      ? `${readingSummary}\n\nAI 综合解读：\n${aiReading.text}`
      : readingSummary

  useEffect(() => {
    if (!isRevealed || selectedCards.length !== 3) {
      return
    }

    const cardsForAi = selectedCards.map((card, index) => ({
      focus: spreadPositions[index],
      name: cardDisplayName(card),
      orientation: orientationLabel(cardOrientations[card.id] ?? 'upright'),
      keywords: card.keywords,
    }))
    const controller = new AbortController()
    Promise.resolve().then(() => setAiReading({ status: 'loading', text: '' }))
    fetch('/api/tarot-reading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        question,
        refinedQuestion,
        spreadName: activeSpread.name,
        theme: themeLabel(questionTheme),
        cards: cardsForAi,
      }),
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'AI 解读生成失败')
        setAiReading({
          status: 'ready',
          text: data.text || '',
          source: data.source,
          model: data.model,
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setAiReading({
          status: 'error',
          text: '',
          error: error instanceof Error ? error.message : 'AI 解读生成失败',
        })
      })

    return () => controller.abort()
  }, [activeSpread.name, cardOrientations, isRevealed, question, questionTheme, refinedQuestion, selectedCards, spreadPositions])
  const shareSnippet =
    isRevealed && reading.length === 3
      ? buildShareSnippet({
          question: refinedQuestion || question,
          spreadName: activeSpread.name,
          theme: questionTheme,
          reading,
        })
      : ''
  const askFollowUp = (event: React.FormEvent) => {
    event.preventDefault()
    if (!followUpQuestion.trim() || reading.length !== 3) return
    setFollowUpAnswer(
      followUpReading(
        followUpQuestion,
        refinedQuestion || question,
        questionTheme,
        activeSpread.name,
        reading,
      ),
    )
  }
  const copyReading = async () => {
    if (!fullReadingSummary) return
    try {
      await copyText(fullReadingSummary)
      setCopyFeedback('已复制完整结果')
      window.setTimeout(() => setCopyFeedback(''), 1800)
    } catch {
      setCopyFeedback('复制失败，请手动选择文本')
    }
  }
  const copyShareSnippet = async () => {
    if (!shareSnippet) return
    try {
      await copyText(shareSnippet)
      setShareFeedback('已复制分享文案')
      window.setTimeout(() => setShareFeedback(''), 1800)
    } catch {
      setShareFeedback('复制失败')
    }
  }
  const downloadReading = () => {
    if (!fullReadingSummary) return
    downloadTextFile(fullReadingSummary, safeFilename(refinedQuestion || question))
    setDownloadFeedback('已下载')
    window.setTimeout(() => setDownloadFeedback(''), 1800)
  }
  const gestureEnergy =
    screen === 'draw'
      ? drawMode === 'capturing'
        ? 1
        : drawMode === 'aiming' && handCursor.visible
          ? 0.92
          : gesture === 'left' || gesture === 'right'
            ? 0.55
            : gesture === 'stop'
              ? 0.36
              : 0
      : 0
  const shellStyle =
    screen === 'draw'
      ? ({
          '--hand-x': `${handCursor.x * 100}%`,
          '--hand-y': `${handCursor.y * 100}%`,
          '--gesture-energy': gestureEnergy,
          '--gesture-direction': gesture === 'left' ? -1 : gesture === 'right' ? 1 : 0,
        } as React.CSSProperties)
      : undefined

  if (screen === 'question') {
    return (
      <main className="app-shell question-screen">
        <div className="cosmos" />
        <section className={`question-gate ${isFocusing ? 'is-focusing' : ''}`}>
          <div className="question-art" style={{ '--card-back': `url(${tarotBack})` } as React.CSSProperties}>
            <span />
            <span />
            <span />
          </div>
          <form className="question-card" onSubmit={goToDraw}>
            <p className="micro">Vibecoding Tarot</p>
            <h1>先让问题安静下来</h1>
            <p className="question-intro">写下一个具体、真诚、正在困扰你的问题。进入抽牌前，系统会帮你把它整理成更适合占卜的问法，并留出 5 秒聚焦时间。</p>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：我该如何面对现在最重要的选择？"
              autoFocus
            />
            {refinedQuestion && (
              <div className="refined-question">
                <span>整理后的占卜问题</span>
                <p>{refinedQuestion}</p>
              </div>
            )}
            <div className="spread-picker" role="radiogroup" aria-label="选择牌阵">
              {spreadOptions.map((spread) => (
                <label key={spread.key} className={spreadKey === spread.key ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="spread"
                    value={spread.key}
                    checked={spreadKey === spread.key}
                    onChange={() => setSpreadKey(spread.key)}
                  />
                  <span>{spread.name}</span>
                  <small>{spread.hint}</small>
                </label>
              ))}
            </div>
            <button type="submit" className="start-button" disabled={!question.trim() || isFocusing}>
              <Sparkles size={18} />
              {isFocusing ? '正在聚焦' : '开始静心'}
            </button>
          </form>
          {isFocusing && (
            <motion.div
              className="focus-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="breath-orb">
                <span>{focusCount || '入'}</span>
              </div>
              <p>请把问题留在心中，慢慢呼吸</p>
            </motion.div>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className={`app-shell ${screen === 'draw' ? 'draw-screen' : ''} ${screen === 'reading' ? 'reading-screen' : ''}`} style={shellStyle}>
      <div className="cosmos" />

      <header className="topbar">
        <div>
          <p className="micro">Vibecoding Tarot</p>
          <h1>{screen === 'reading' ? '牌已经回应了你' : '抽张牌吗，我的朋友'}</h1>
        </div>
        <div className="status-pill">
          <Sparkles size={18} />
          {selectedCards.length}/3 已选择
        </div>
      </header>

      <section className="question-summary">
        <span>你的问题</span>
        <p>{refinedQuestion || question}</p>
        <small>{activeSpread.name} · {activeSpread.positions.join(' / ')}</small>
        <button type="button" onClick={backToQuestion}>修改问题</button>
      </section>

      {screen === 'draw' && (
      <section className="stage">
        <div className={`deck-zone phase-${phase} mode-${drawMode}`}>
          <div
            className="immersive-stars"
            aria-hidden="true"
            style={
              {
                '--cursor-x': `${handCursor.x * 100}%`,
                '--cursor-y': `${handCursor.y * 100}%`,
                '--cursor-opacity': handCursor.visible && isGesturePaused ? 1 : 0,
              } as React.CSSProperties
            }
          />
          <div className="table-relics" aria-hidden="true">
            <span className="relic candle relic-left" />
            <span className="relic crystal relic-right" />
            <span className="relic astrolabe" />
          </div>
          <div className="deck-header">
            <span>78 张盲选牌池</span>
            <strong>{statusText(phase)}</strong>
          </div>
          <div className="gesture-readout" aria-live="polite">
            <span>{modeLabel(drawMode)}</span>
            <span>{gestureLabel(gesture)}</span>
            {gestureDebug && (
              <>
                <span>指 {gestureDebug.extendedCount}</span>
                <span>捏 {gestureDebug.pinch.toFixed(2)}</span>
                <span>倾 {gestureDebug.tilt.toFixed(2)}</span>
              </>
            )}
          </div>
          <div className="gesture-guide" aria-label="手势说明">
            <span>开掌倾斜：滑动牌流</span>
            <span>握拳：暂停</span>
            <span>食指：悬停选牌</span>
            <span>拇指食指捏两下：确认</span>
          </div>
          {phase !== 'idle' && (
            <div className="ritual-status" aria-live="polite">
              {ritualPrompt(drawMode, selectedCards.length)}
            </div>
          )}
          {isShuffling && (
            <motion.div
              className="ritual-whisper"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              请保持问题在心中，牌流正在重新排序
            </motion.div>
          )}

          {phase === 'idle' ? (
            <div className="start-gate">
              <div className="deck-stack" style={{ '--card-back': `url(${tarotBack})` } as React.CSSProperties}>
                {Array.from({ length: 9 }).map((_, index) => (
                  <span key={index} style={{ '--stack-index': index } as React.CSSProperties} />
                ))}
              </div>
              <button type="button" className="start-button" onClick={startReading}>
                <Play size={18} />
                开始抽牌
              </button>
            </div>
          ) : (
            <>
              <div
                className={`card-rail ${isShuffling ? 'is-shuffling' : ''} ${isGesturePaused ? 'is-paused' : ''} mode-${drawMode}`}
                aria-label="塔罗牌滑动选择轨道"
                onWheel={(event) => {
                  if (!canSlide) return
                  handVelocityRef.current = 0
                  targetTrackRef.current += (event.deltaY + event.deltaX) / 320
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  beginDrag(event.clientX)
                }}
                onPointerMove={(event) => updateDrag(event.clientX)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {(isShuffling ? shuffleCardsInView : visibleCards).map(({ card, index, offset }) => {
                  const isActive = Math.abs(offset) < 0.5
                  const isPicked = selectedCards.some((picked) => picked.id === card.id)
                  const isPending = pendingCard?.id === card.id
                  const isCapturing = capturingCard?.id === card.id
                  const isLocked = (gesture === 'stop' || gesture === 'fist') && isActive && !isPending
                  const distance = Math.abs(offset)
                  const shuffleMotion = shuffleCardMotion(offset, index, shuffleRun, shuffleProgress)
                  return (
                    <button
                      type="button"
                      key={isShuffling ? `${card.id}-${index}` : card.id}
                      className={`tarot-card ${isActive ? 'active' : ''} ${isPicked ? 'picked' : ''} ${isPending ? 'preview' : ''} ${isCapturing ? 'capturing' : ''} ${isLocked ? 'locked' : ''}`}
                      style={
                        {
                          '--card-color': card.color,
                          '--card-back': `url(${tarotBack})`,
                          '--card-front': `url(${cardFront(card)})`,
                          transform: `translate3d(${isShuffling ? shuffleMotion.x : offset * railSpacing}px, 0, 0)`,
                          opacity: isShuffling
                            ? shuffleMotion.opacity
                            : isCapturing || isPicked || distance > 5
                              ? 0
                              : isActive
                                ? 1
                                : 0.55,
                          filter: isActive ? 'none' : 'blur(0.6px)',
                          zIndex: isCapturing ? 96 : isPending ? 82 : isActive ? 72 : 44 - distance,
                        } as React.CSSProperties
                      }
                      onClick={() => {
                        if (!canSlide) return
                        const nextPosition = clampTrackPosition(index, deckOrder.length)
                        targetTrackRef.current = nextPosition
                        trackPositionRef.current = nextPosition
                        setTrackPosition(nextPosition)
                        if (isActive) selectActive()
                      }}
                      aria-label="盲选一张塔罗牌"
                    >
                      <span className="card-face card-face-back" />
                      <span className="card-face card-face-front">
                        <i className="reveal-flare" aria-hidden="true" />
                        <b>{cardDisplayName(card)}</b>
                        <small>{card.keywords.join(' / ')}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
              {selectionBurst > 0 && (
                <div
                  key={selectionBurst}
                  className="selection-particles"
                  aria-hidden="true"
                  style={
                    {
                      '--burst-x': `${particleOrigin.x}%`,
                      '--burst-y': `${particleOrigin.y}%`,
                      '--slot-pull': `${selectedCards.length * 34 - 34}px`,
                      '--slot-y': `${Math.max(80, window.innerHeight - 126)}px`,
                    } as React.CSSProperties
                  }
                >
                  {Array.from({ length: 72 }).map((_, index) => (
                    <span
                      key={index}
                      style={
                        {
                          '--i': index,
                          '--angle': `${(index * 137.5) % 360}deg`,
                          '--drift': `${60 + (index % 11) * 10}px`,
                          '--scatter-y': `${-72 + (index % 9) * 11}px`,
                          '--spark-offset': `${((index % 5) - 2) * 12}px`,
                          '--spark-size': `${2 + (index % 4)}px`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
              )}

              <div className="draw-slots" aria-label="已选择的三张牌位">
                {spreadPositions.map((position, index) => {
                  const selected = selectedCards[index]
                  const isReceiving = drawMode === 'capturing' && selectedCards.length === index
                  return (
                    <div
                      key={position}
                      className={`draw-slot ${selected ? 'filled' : ''} ${isReceiving ? 'receiving' : ''} ${drawMode === 'transitioning' ? 'finalizing' : ''}`}
                      style={{ '--slot-index': index } as React.CSSProperties}
                    >
                      <span>{position}</span>
                      <b>{selected ? cardDisplayName(selected) : `0${index + 1}`}</b>
                      {selected && <em>{orientationLabel(cardOrientations[selected.id] ?? 'upright')}</em>}
                    </div>
                  )
                })}
              </div>

              <div className="controls">
                <button type="button" onClick={() => slideDeck('left', 0.55)} disabled={!canSlide}>
                  <ChevronLeft size={20} />
                </button>
                <button type="button" className="select-button" onClick={selectActive} disabled={!canSelect || isPreviewing}>
                  <Hand size={18} />
                  翻开当前牌
                </button>
                <button type="button" onClick={() => slideDeck('right', 0.55)} disabled={!canSlide}>
                  <ChevronRight size={20} />
                </button>
                {pendingCard && (
                  <>
                    <button type="button" className="confirm-button" onClick={confirmPendingCard}>确认这张</button>
                    <button type="button" onClick={rejectPendingCard}>重新选</button>
                  </>
                )}
                {phase === 'complete' && (
                  <button type="button" className="shuffle-button" onClick={startReading}>
                    <Sparkles size={18} />
                    重新洗牌
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="camera-panel">
          <div className="panel-title">
            <Camera size={18} />
            占卜镜
          </div>
          <div className="control-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={controlMode === 'camera'}
              className={`mode-tab ${controlMode === 'camera' ? 'active' : ''}`}
              onClick={() => setControlMode('camera')}
            >
              摄像头
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={controlMode === 'mouse'}
              className={`mode-tab ${controlMode === 'mouse' ? 'active' : ''}`}
              onClick={() => setControlMode('mouse')}
            >
              鼠标 / 键盘
            </button>
          </div>
          {controlMode === 'camera' ? (
            <>
              <GestureCamera enabled={cameraEnabled} onHand={handleHandInteraction} gesture={gesture} />
              <button type="button" className="camera-toggle" onClick={() => setCameraEnabled((value) => !value)}>
                {cameraEnabled ? '关闭镜头' : '开启镜头'}
              </button>
              <p className="hint">一指让牌流向左，两指让牌流向右；五指让中心牌停驻，握拳回应这张牌。</p>
            </>
          ) : (
            <div className="mouse-panel">
              <div className="mouse-icon-row">
                <MousePointer2 size={36} strokeWidth={1.5} />
              </div>
              <p className="hint">移动鼠标定位中心牌<br />左键单击 = 抽牌</p>
              <p className="hint hint-secondary">键盘：← → 切牌 · 空格 / 回车 确认 · Esc 取消</p>
            </div>
          )}
        </aside>
      </section>
      )}

      {screen === 'reading' && (
      <section className="reading-board">
        <div className="spread">
          {spreadPositions.map((position, index) => {
            const card = selectedCards[index]
            const orientation = card ? cardOrientations[card.id] ?? 'upright' : 'upright'
            return (
              <motion.div
                key={position}
                className={`spread-card ${card && isRevealed ? 'revealed' : ''} ${card && orientation === 'reversed' ? 'is-reversed' : ''}`}
                style={
                  {
                    '--card-color': card?.color || '#6d5bff',
                    '--card-front': `url(${cardFront(card)})`,
                  } as React.CSSProperties
                }
                animate={{ y: card && isRevealed ? -8 : 0, scale: card && isRevealed ? 1.02 : 1 }}
                transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="spread-face spread-back">
                  <span>{position}</span>
                  <b>{card ? '已抽取' : '等待选择'}</b>
                </div>
                <div className="spread-face spread-front">
                  <i className="reveal-flare" aria-hidden="true" />
                  <span>{position}</span>
                  <b>{cardDisplayName(card)}</b>
                  {card && <em>{orientationLabel(orientation)}</em>}
                  <small>{card?.keywords.join(' / ')}</small>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="interpretation">
          <div className="interpretation-head">
            <div>
              <p className="micro">Professional Reading</p>
              <h2>三牌测评</h2>
            </div>
            <div className="interpretation-actions">
              <button
                type="button"
                className="reveal-button"
                onClick={() => setIsRevealed(true)}
                disabled={selectedCards.length < 3}
              >
                <Eye size={17} />
                翻开三牌
              </button>
              <button
                type="button"
                onClick={copyReading}
                disabled={!readingSummary}
                title={copyFeedback || '复制完整占卜结果'}
              >
                <Copy size={17} />
                {copyFeedback || '复制结果'}
              </button>
              <button
                type="button"
                onClick={copyShareSnippet}
                disabled={!shareSnippet}
                title={shareFeedback || '复制短版分享文案'}
              >
                <Sparkles size={17} />
                {shareFeedback || '复制分享'}
              </button>
              <button
                type="button"
                onClick={downloadReading}
                disabled={!readingSummary}
                title={downloadFeedback || '下载完整占卜结果'}
              >
                <Download size={17} />
                {downloadFeedback || '下载结果'}
              </button>
              <button
                type="button"
                onClick={() => {
                  resetReadingState()
                  setScreen('draw')
                }}
              >
                <RotateCcw size={17} />
                重置
              </button>
              <button type="button" onClick={backToDraw}>
                <Hand size={17} />
                返回抽牌
              </button>
            </div>
          </div>
          {isRevealed && reading.length === 3 ? (
            <div className="reading-copy">
              <div className="analysis-badge">智能分析：{themeLabel(questionTheme)}</div>
              <section className={`ai-reading ai-${aiReading.status}`}>
                <div>
                  <span>AI 综合解读</span>
                  {aiReading.model && <em>{aiReading.model}</em>}
                </div>
                {aiReading.status === 'loading' && <p>正在结合你的问题、牌阵、正逆位和三张牌生成专业分析...</p>}
                {aiReading.status === 'ready' && <pre>{aiReading.text}</pre>}
                {aiReading.status === 'error' && <p>AI 解读暂时不可用：{aiReading.error}。下方仍保留本地规则解读。</p>}
              </section>
              {reading.map((item) => (
                <article key={item.focus} className="reading-item">
                  <span>{item.focus}</span>
                  <h3>{cardDisplayName(item.card)} <em>{orientationLabel(item.orientation)}</em></h3>
                  <div className="reading-layers">
                    <section>
                      <b>牌义</b>
                      <p>{item.layers.essence}</p>
                    </section>
                    <section>
                      <b>现实提醒</b>
                      <p>{item.layers.reality}</p>
                    </section>
                    <section>
                      <b>行动</b>
                      <p>{item.layers.action}</p>
                    </section>
                  </div>
                  <details>
                    <summary>完整解读</summary>
                    <p>{item.text}</p>
                  </details>
                </article>
              ))}
              <strong>{summaryAdvice}</strong>
              <form className="follow-up" onSubmit={askFollowUp}>
                <label htmlFor="follow-up-question">继续追问</label>
                <div>
                  <input
                    id="follow-up-question"
                    value={followUpQuestion}
                    onChange={(event) => setFollowUpQuestion(event.target.value)}
                    placeholder="例如：我现在最应该做什么？为什么会这样？"
                  />
                  <button type="submit" disabled={!followUpQuestion.trim()}>分析追问</button>
                </div>
                {followUpAnswer && (
                  <output>
                    <span>追加解读</span>
                    <p>{followUpAnswer}</p>
                  </output>
                )}
              </form>
            </div>
          ) : (
            <p className="empty-copy">点击“开始抽牌”后系统会先洗牌一次。盲选三张牌，再点击“翻开”获得过去、现在、未来三个层面的解读。</p>
          )}
        </div>
      </section>
      )}
    </main>
  )
}

function statusText(phase: ReadingPhase) {
  if (phase === 'idle') return '等待开始'
  if (phase === 'shuffling') return '洗牌中'
  if (phase === 'selecting') return '滑动盲选'
  return '三张已抽取'
}

function modeLabel(mode: DrawMode) {
  if (mode === 'transitioning') return 'Reading'
  if (mode === 'idle') return '等待'
  if (mode === 'shuffling') return '洗牌'
  if (mode === 'browsing') return '浏览'
  if (mode === 'aiming') return '瞄准'
  if (mode === 'capturing') return '捕获'
  return '完成'
}

function ritualPrompt(mode: DrawMode, selectedCount: number) {
  if (mode === 'transitioning') return '三张牌位正在聚光，解读即将开启。'
  const next = selectedCount + 1
  if (mode === 'idle') return '写下问题后，牌桌会为你展开。'
  if (mode === 'shuffling') return '牌流正在横向展开，并把顺序重新收拢。'
  if (mode === 'aiming') return `第 ${next} 张牌正在回应你的指尖。`
  if (mode === 'capturing') return '这张牌化为光点，进入你的牌位。'
  if (mode === 'selected') return '三张牌已经就位，解读即将开启。'
  return `保持问题在心中，选择第 ${next} 张回应你的牌。`
}

function shuffleCardMotion(offset: number, index: number, run: number, progress: number) {
  const distance = Math.abs(offset)
  const side = index % 2 === 0 ? -1 : 1
  const phase = (index + run) * 0.54
  const wave = Math.sin(progress * Math.PI * 6 + phase)
  const expand = smoothSegment(progress, 0.03, 0.34)
  const riffle = smoothSegment(progress, 0.28, 0.66)
  const bridge = smoothSegment(progress, 0.56, 0.78)
  const gather = smoothSegment(progress, 0.72, 1)
  const openX = shuffleSpreadX(offset) + wave * 18
  const weaveX = offset * 34 + side * (58 + distance * 4) + wave * 16
  const bridgeX = shuffleSpreadX(offset) * 0.38 + side * 34 + wave * 8
  const stackedX = offset * 2.1
  const expandedX = mix(offset * 4, openX, expand)
  const riffledX = mix(expandedX, weaveX, riffle)
  const bridgedX = mix(riffledX, bridgeX, bridge)

  const openY = shuffleFanY(offset) + wave * 10
  const weaveY = shuffleWaveY(offset) + side * 9
  const bridgeY = 16 + distance * 0.9 - Math.sin(progress * Math.PI) * 10
  const stackedY = 26 + distance * 0.22
  const expandedY = mix(34, openY, expand)
  const riffledY = mix(expandedY, weaveY, riffle)
  const bridgedY = mix(riffledY, bridgeY, bridge)

  return {
    x: mix(bridgedX, stackedX, gather),
    y: mix(bridgedY, stackedY, gather),
    scale: mix(mix(0.72, 0.94, expand), 0.72, gather),
    rotate: mix(mix(offset * 0.4, offset * 2.2 + side * 5 + wave * 2, expand), offset * 0.05, gather),
    rotateX: mix(mix(20, 8, expand), 22, gather),
    rotateY: mix(side * 4 * riffle, 0, gather),
    opacity: mix(mix(0.42, 0.96, expand), 0.9, gather),
  }
}

function mix(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

function smoothSegment(progress: number, start: number, end: number) {
  if (progress <= start) return 0
  if (progress >= end) return 1
  const t = (progress - start) / (end - start)
  return t * t * (3 - 2 * t)
}

function shuffleSpreadX(offset: number) {
  const direction = offset === 0 ? 0 : Math.sign(offset)
  const compressed = Math.tanh(Math.abs(offset) / 7) * 390
  return direction * compressed + offset * 18
}

function shuffleFanY(offset: number) {
  return 8 + Math.abs(offset) * 2.4 + Math.pow(Math.abs(offset), 1.35) * 1.1
}

function shuffleWaveY(offset: number) {
  return Math.sin(offset * 0.95) * 26 + Math.abs(offset) * 1.5
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothHandCursor(rawCursor: HandCursor, smoothedCursorRef: MutableRefObject<HandCursor>) {
  const current = smoothedCursorRef.current
  if (!rawCursor.visible) {
    const hidden = { ...current, visible: false }
    smoothedCursorRef.current = hidden
    return hidden
  }
  const amount = current.visible ? 0.56 : 0.82
  const next = {
    x: mix(current.x, rawCursor.x, amount),
    y: mix(current.y, rawCursor.y, amount),
    visible: true,
  }
  smoothedCursorRef.current = next
  return next
}

function GestureCamera({
  enabled,
  onHand,
  gesture,
}: {
  enabled: boolean
  onHand: (interaction: HandInteraction) => void
  gesture: Gesture
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const onHandRef = useRef(onHand)
  const rafRef = useRef<number | null>(null)
  const lastGestureRef = useRef(0)
  const lastVideoTimeRef = useRef(-1)
  const lastDrawRef = useRef(0)
  const lastInferenceRef = useRef(0)
  const stableGestureRef = useRef<Gesture>('idle')
  const candidateGestureRef = useRef<Gesture>('idle')
  const candidateCountRef = useRef(0)
  const smoothedCursorRef = useRef<HandCursor>({ x: 0.5, y: 0.5, visible: false })
  const lastSentCursorRef = useRef<HandCursor>({ x: 0.5, y: 0.5, visible: false })
  const pinchLockedRef = useRef(false)
  const [status, setStatus] = useState('镜头未开启')

  useEffect(() => {
    onHandRef.current = onHand
  }, [onHand])

  useEffect(() => {
    const videoElement = videoRef.current
    if (!enabled) {
      stopCamera(videoElement)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    let isCancelled = false

    const start = async () => {
      try {
        setStatus('加载 MediaPipe')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
        )
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        })

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        })
        if (!videoRef.current || isCancelled) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStatus('正在识别手势')
        detect()
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '镜头启动失败')
      }
    }

    const detect = () => {
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }

      if (video.currentTime === lastVideoTimeRef.current) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }
      lastVideoTimeRef.current = video.currentTime

      const now = performance.now()
      if (now - lastInferenceRef.current < 26) {
        rafRef.current = requestAnimationFrame(detect)
        return
      }
      lastInferenceRef.current = now
      const result = landmarker.detectForVideo(video, performance.now())
      if (now - lastDrawRef.current > 220) {
        lastDrawRef.current = now
        drawHand(result, canvasRef.current)
      }
      const rawInteraction = readHandInteraction(result, smoothedCursorRef, pinchLockedRef)
      const interaction = stabilizeInteraction(rawInteraction, stableGestureRef, candidateGestureRef, candidateCountRef)
      const nextGesture = interaction.gesture
      const interval = nextGesture === 'fist' ? 54 : nextGesture === 'pinch' ? 64 : nextGesture === 'stop' ? 78 : nextGesture === 'point' ? 22 : nextGesture === 'idle' ? 110 : 28
      const cursor = interaction.cursor
      const cursorDelta = cursor?.visible
        ? Math.hypot(cursor.x - lastSentCursorRef.current.x, cursor.y - lastSentCursorRef.current.y)
        : 1
      const shouldSendCursor = nextGesture !== 'point' || cursorDelta > 0.007 || now - lastGestureRef.current > 52
      if ((nextGesture !== 'idle' || interaction.cursor?.visible === false) && now - lastGestureRef.current > interval && shouldSendCursor) {
        lastGestureRef.current = now
        if (cursor?.visible) lastSentCursorRef.current = cursor
        onHandRef.current(interaction)
      }
      rafRef.current = requestAnimationFrame(detect)
    }

    start()

    return () => {
      isCancelled = true
      stopCamera(videoElement)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [enabled])

  return (
    <div className="camera-view">
      <video ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} width="240" height="180" />
      <div className="gesture-badge">{gestureLabel(gesture)}</div>
      <span>{enabled ? status : '镜头未开启'}</span>
    </div>
  )
}

function readHandInteraction(
  result: HandLandmarkerResult,
  smoothedCursorRef: MutableRefObject<HandCursor>,
  pinchLockedRef: MutableRefObject<boolean>,
): HandInteraction {
  const hand = result.landmarks?.[0]
  if (!hand) {
    pinchLockedRef.current = false
    smoothedCursorRef.current = { ...smoothedCursorRef.current, visible: false }
    return { gesture: 'idle', cursor: smoothedCursorRef.current }
  }

  const wrist = hand[0]
  const indexMcp = hand[5]
  const pinkyMcp = hand[17]
  const thumbTip = hand[4]
  const thumbIp = hand[3]
  const indexTip = hand[8]
  const middleMcp = hand[9]
  const fingerTips = [hand[8], hand[12], hand[16], hand[20]]
  const fingerPips = [hand[6], hand[10], hand[14], hand[18]]
  const extendedFingers = fingerTips.map((tip, index) => tip.y < fingerPips[index].y - 0.022)
  const extendedCount = extendedFingers.filter(Boolean).length
  const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)
  const palmSize = Math.max(0.08, Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y))
  const palmCenter = {
    x: (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4,
    y: (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4,
  }
  const curledCount = fingerTips.filter((tip) => Math.hypot(tip.x - palmCenter.x, tip.y - palmCenter.y) < palmSize * 1.18).length
  const thumbFolded = Math.hypot(thumbTip.x - palmCenter.x, thumbTip.y - palmCenter.y) < palmSize * 1.34
  const isFist = curledCount >= 3 || (curledCount >= 2 && thumbFolded && extendedCount <= 1)
  const normalizedPinch = pinchDistance / palmSize
  const indexRaised = extendedFingers[0] || indexTip.y < indexMcp.y - 0.03
  const onlyIndexActive = indexRaised && !extendedFingers[1] && !extendedFingers[2] && !extendedFingers[3]
  const thumbOpen =
    Math.hypot(thumbTip.x - indexMcp.x, thumbTip.y - indexMcp.y) > 0.18 ||
    Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y) >
      Math.hypot(thumbIp.x - wrist.x, thumbIp.y - wrist.y) + 0.04
  const tilt = (indexMcp.y - pinkyMcp.y) / Math.max(0.08, Math.abs(indexMcp.x - pinkyMcp.x))
  const debug = {
    extendedCount,
    pinch: normalizedPinch,
    tilt,
  }
  const cursorVisible = indexRaised && onlyIndexActive
  const rawCursor = {
    x: clamp01(1 - indexTip.x),
    y: clamp01(indexTip.y),
    visible: cursorVisible,
  }
  const cursor = smoothHandCursor(rawCursor, smoothedCursorRef)

  const canPinch = extendedCount <= 3 || onlyIndexActive || normalizedPinch < 0.82
  const pinchEnter = canPinch && (pinchDistance < 0.15 || normalizedPinch < 0.88)
  const pinchRelease = pinchDistance > 0.19 && normalizedPinch > 1.05
  if (pinchLockedRef.current) {
    if (pinchRelease) {
      pinchLockedRef.current = false
    } else if (cursor.visible) {
      return { gesture: 'point', cursor, debug }
    } else {
      return { gesture: 'idle', cursor, debug }
    }
  }
  if (pinchEnter) {
    pinchLockedRef.current = true
    return { gesture: 'pinch', cursor: { ...cursor, visible: true }, debug }
  }
  if (isFist || extendedCount === 0) return { gesture: 'fist', cursor: { ...cursor, visible: false }, debug }
  if (cursor.visible) return { gesture: 'point', cursor, debug }

  if (extendedCount >= 4 && thumbOpen) {
    const deadZone = 0.055
    const strength = Math.min(2, Math.max(0.36, (Math.abs(tilt) - deadZone) * 4.4))
    if (tilt > deadZone) return { gesture: 'left', cursor: { ...cursor, visible: false }, strength, debug }
    if (tilt < -deadZone) return { gesture: 'right', cursor: { ...cursor, visible: false }, strength, debug }
    return { gesture: 'stop', cursor: { ...cursor, visible: false }, debug }
  }
  return { gesture: 'idle', cursor: { ...cursor, visible: false }, debug }
}

function stabilizeInteraction(
  interaction: HandInteraction,
  stableGestureRef: MutableRefObject<Gesture>,
  candidateGestureRef: MutableRefObject<Gesture>,
  candidateCountRef: MutableRefObject<number>,
) {
  const nextGesture = interaction.gesture
  if (nextGesture === 'point') {
    stableGestureRef.current = 'point'
    candidateGestureRef.current = 'point'
    candidateCountRef.current = 0
    return interaction
  }

  const framesNeeded = nextGesture === 'fist' || nextGesture === 'pinch' || nextGesture === 'stop' || nextGesture === 'left' || nextGesture === 'right' ? 1 : nextGesture === 'idle' ? 3 : 2
  if (candidateGestureRef.current === nextGesture) {
    candidateCountRef.current += 1
  } else {
    candidateGestureRef.current = nextGesture
    candidateCountRef.current = 1
  }

  if (candidateCountRef.current >= framesNeeded) {
    stableGestureRef.current = nextGesture
    return interaction
  }

  return {
    ...interaction,
    gesture: stableGestureRef.current,
  }
}

function drawHand(result: HandLandmarkerResult, canvas: HTMLCanvasElement | null) {
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  const hand = result.landmarks?.[0]
  if (!hand) return
  context.fillStyle = '#f6b950'
  hand.forEach((point) => {
    context.beginPath()
    context.arc(point.x * canvas.width, point.y * canvas.height, 3, 0, Math.PI * 2)
    context.fill()
  })
}

function stopCamera(video: HTMLVideoElement | null) {
  const stream = video?.srcObject as MediaStream | null
  stream?.getTracks().forEach((track) => track.stop())
  if (video) video.srcObject = null
}

function gestureLabel(gesture: Gesture) {
  if (gesture === 'left') return '开掌右倾：牌流向左'
  if (gesture === 'right') return '开掌左倾：牌流向右'
  if (gesture === 'stop') return '五指张开：锁定中心牌'
  if (gesture === 'fist') return '握拳：确认当前牌'
  if (gesture === 'select') return '牌在回应'
  if (gesture === 'point') return '食指已识别，但不参与抽牌'
  if (gesture === 'pinch') return '捏合已识别，但不参与抽牌'
  return '等待你的手势'
}

export default App
