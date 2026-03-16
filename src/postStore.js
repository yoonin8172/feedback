const STORAGE_KEY = "design-feedback-posts"
const USER_VOTES_KEY = "design-feedback-user-votes"
const REPORTS_KEY = "design-feedback-reports"
const LEGACY_VOTE_SCOPE = "__legacy__"
const LEGACY_SAMPLE_POST_IDS = new Set(["seed-1", "seed-2"])

const LEGACY_QUESTION_MAP = {
  "컨셉 전달이 되나요?": "컨셉이 명확히 전달되나요?",
  "타이포 가독성이 충분한가요?": "타이포가 잘 읽히나요?",
  "색감이 조화롭게 전달되나요?": "색감 조화가 자연스러운가요?",
  "레이아웃이 안정적으로 전달되나요?": "레이아웃 균형이 안정적인가요?",
  "전체 완성도가 충분히 전달되나요?": "전체 완성도가 충분한가요?"
}

const seedPosts = []

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizeVoteStore(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {}
  }

  const entries = Object.entries(raw)
  const isLegacyShape = entries.every(
    ([, value]) => value === "yes" || value === "maybe" || value === "no"
  )
  if (isLegacyShape) {
    return { [LEGACY_VOTE_SCOPE]: raw }
  }

  const next = {}
  entries.forEach(([userId, votes]) => {
    if (!votes || typeof votes !== "object" || Array.isArray(votes)) return
    const cleanVotes = {}
    Object.entries(votes).forEach(([postId, choice]) => {
      if (choice === "yes" || choice === "maybe" || choice === "no") {
        cleanVotes[postId] = choice
      }
    })
    next[userId] = cleanVotes
  })
  return next
}

function normalizeVisibility(value) {
  return value === "nickname" ? "nickname" : "anonymous"
}

function normalizeVoteChoice(value) {
  return value === "yes" || value === "maybe" || value === "no"
}

function inferVisibility(name, explicitVisibility) {
  if (explicitVisibility) {
    return normalizeVisibility(explicitVisibility)
  }
  return name && name !== "익명" ? "nickname" : "anonymous"
}

function normalizeQuestionText(question) {
  const text = question || ""
  return LEGACY_QUESTION_MAP[text] || text
}

function migratePost(post) {
  const authorId = post.authorId || "legacy-author"
  const authorName = post.authorName || "legacy-user"
  const authorVisibility = inferVisibility(authorName, post.authorVisibility)

  const comments = (post.comments || []).map((comment) => {
    const commentAuthorName = comment.authorName || "legacy-user"
    return {
      id: comment.id || `legacy-comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      authorId: comment.authorId || "legacy-commenter",
      authorName: commentAuthorName,
      authorVisibility: inferVisibility(commentAuthorName, comment.authorVisibility),
      text: comment.text || "",
      createdAt: comment.createdAt || new Date().toISOString()
    }
  })

  return {
    ...post,
    authorId,
    authorName,
    authorVisibility,
    media: post.media || [],
    question: normalizeQuestionText(post.question),
    votes: {
      yes: Number(post.votes?.yes || 0),
      maybe: Number(post.votes?.maybe || 0),
      no: Number(post.votes?.no || 0)
    },
    comments,
    helpfulCommentId: post.helpfulCommentId || null,
    createdAt: post.createdAt || new Date().toISOString()
  }
}

function removeLegacySamplePosts(posts) {
  return posts.filter((post) => !LEGACY_SAMPLE_POST_IDS.has(post.id))
}

function ensureInitialized() {
  const posts = readJson(STORAGE_KEY, null)
  if (!posts) {
    writeJson(STORAGE_KEY, seedPosts)
  } else {
    const migrated = posts.map(migratePost)
    writeJson(STORAGE_KEY, removeLegacySamplePosts(migrated))
  }

  const userVotes = readJson(USER_VOTES_KEY, null)
  if (!userVotes) {
    writeJson(USER_VOTES_KEY, {})
  } else {
    const voteStore = normalizeVoteStore(userVotes)
    Object.values(voteStore).forEach((votes) => {
      if (!votes || typeof votes !== "object") return
      LEGACY_SAMPLE_POST_IDS.forEach((sampleId) => {
        delete votes[sampleId]
      })
    })
    writeJson(USER_VOTES_KEY, voteStore)
  }

  const reports = readJson(REPORTS_KEY, null)
  if (!reports) {
    writeJson(REPORTS_KEY, [])
  }
}

export function getPosts() {
  ensureInitialized()
  const posts = readJson(STORAGE_KEY, []).map(migratePost)
  return posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function addPost(input, author) {
  ensureInitialized()
  const next = {
    id: `post-${Date.now()}`,
    authorId: author.id,
    authorName: author.name,
    authorVisibility: normalizeVisibility(author.visibility),
    media: input.media,
    description: input.description || "",
    question: input.question,
    votes: { yes: 0, maybe: 0, no: 0 },
    comments: [],
    helpfulCommentId: null,
    createdAt: new Date().toISOString()
  }

  const posts = getPosts()
  posts.unshift(next)
  writeJson(STORAGE_KEY, posts)
}

export function votePost(postId, choice, actorId) {
  ensureInitialized()
  const posts = getPosts()
  if (!actorId) return false

  const voteStore = normalizeVoteStore(readJson(USER_VOTES_KEY, {}))
  const userVotes = voteStore[actorId] || {}

  const target = posts.find((post) => post.id === postId)
  if (!target || !normalizeVoteChoice(choice)) return false

  const prevChoice = userVotes[postId]
  if (prevChoice === choice) {
    target.votes[prevChoice] = Math.max(0, target.votes[prevChoice] - 1)
    delete userVotes[postId]
    voteStore[actorId] = userVotes
    writeJson(STORAGE_KEY, posts)
    writeJson(USER_VOTES_KEY, voteStore)
    return true
  }

  if (normalizeVoteChoice(prevChoice)) {
    target.votes[prevChoice] = Math.max(0, target.votes[prevChoice] - 1)
  }

  target.votes[choice] += 1
  userVotes[postId] = choice

  voteStore[actorId] = userVotes
  writeJson(STORAGE_KEY, posts)
  writeJson(USER_VOTES_KEY, voteStore)
  return true
}

export function getMyVote(postId, actorId) {
  ensureInitialized()
  if (!actorId) return null
  const voteStore = normalizeVoteStore(readJson(USER_VOTES_KEY, {}))
  const userVotes = voteStore[actorId] || {}
  return userVotes[postId] || null
}

export function addComment(postId, text, author) {
  ensureInitialized()
  const posts = getPosts()
  const target = posts.find((post) => post.id === postId)
  if (!target) return false

  target.comments.unshift({
    id: `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    authorId: author.id,
    authorName: author.name,
    authorVisibility: normalizeVisibility(author.visibility),
    text,
    createdAt: new Date().toISOString()
  })

  writeJson(STORAGE_KEY, posts)
  return true
}

export function markHelpfulComment(postId, commentId, actorId) {
  ensureInitialized()
  const posts = getPosts()
  const target = posts.find((post) => post.id === postId)
  if (!target) return false
  if (target.authorId !== actorId) return false

  const commentExists = target.comments.some((comment) => comment.id === commentId)
  if (!commentExists) return false

  target.helpfulCommentId = commentId
  writeJson(STORAGE_KEY, posts)
  return true
}

export function deletePost(postId, actorId) {
  ensureInitialized()
  if (!actorId) return false

  const posts = getPosts()
  const target = posts.find((post) => post.id === postId)
  if (!target) return false
  if (target.authorId !== actorId) return false

  const nextPosts = posts.filter((post) => post.id !== postId)
  writeJson(STORAGE_KEY, nextPosts)

  const voteStore = normalizeVoteStore(readJson(USER_VOTES_KEY, {}))
  Object.values(voteStore).forEach((userVotes) => {
    if (userVotes && typeof userVotes === "object") {
      delete userVotes[postId]
    }
  })
  writeJson(USER_VOTES_KEY, voteStore)
  return true
}

export function reportTarget(targetType, targetId, actorId, postId = null, reason = "") {
  ensureInitialized()
  if (!actorId) return { ok: false, reason: "no-actor" }
  if (!targetId) return { ok: false, reason: "invalid-target" }
  if (targetType !== "post" && targetType !== "comment") {
    return { ok: false, reason: "invalid-type" }
  }

  const reports = readJson(REPORTS_KEY, [])
  const alreadyReported = reports.some(
    (report) =>
      report.targetType === targetType &&
      report.targetId === targetId &&
      report.reporterId === actorId
  )

  if (alreadyReported) {
    return { ok: false, reason: "duplicate" }
  }

  reports.unshift({
    id: `report-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    targetType,
    targetId,
    postId,
    reason,
    reporterId: actorId,
    createdAt: new Date().toISOString()
  })
  writeJson(REPORTS_KEY, reports)
  return { ok: true }
}
