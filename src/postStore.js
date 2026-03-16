import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
import { db } from "./firebase"

const POSTS_COLLECTION = "posts"
const REPORTS_COLLECTION = "reports"

const LEGACY_QUESTION_MAP = {
  "컨셉 전달이 되나요?": "컨셉이 명확히 전달되나요?",
  "타이포 가독성이 충분한가요?": "타이포가 잘 읽히나요?",
  "색감이 조화롭게 전달되나요?": "색감 조화가 자연스러운가요?",
  "레이아웃이 안정적으로 전달되나요?": "레이아웃 균형이 안정적인가요?",
  "전체 완성도가 충분히 전달되나요?": "전체 완성도가 충분한가요?"
}

function normalizeVisibility(value) {
  return value === "nickname" ? "nickname" : "anonymous"
}

function normalizeVoteChoice(value) {
  return value === "yes" || value === "maybe" || value === "no"
}

function normalizeQuestionText(question) {
  const text = question || ""
  return LEGACY_QUESTION_MAP[text] || text
}

function voteActorKey(actorId) {
  return encodeURIComponent(actorId || "")
}

function normalizePostShape(id, data) {
  const comments = Array.isArray(data.comments)
    ? data.comments.map((comment) => ({
        id: comment.id || `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        authorId: comment.authorId || "legacy-commenter",
        authorName: comment.authorName || "legacy-user",
        authorVisibility: normalizeVisibility(comment.authorVisibility),
        text: comment.text || "",
        createdAt: comment.createdAt || new Date().toISOString()
      }))
    : []

  const votesByUser = data.votesByUser && typeof data.votesByUser === "object"
    ? data.votesByUser
    : {}

  return {
    id,
    authorId: data.authorId || "legacy-author",
    authorName: data.authorName || "legacy-user",
    authorVisibility: normalizeVisibility(data.authorVisibility),
    media: Array.isArray(data.media) ? data.media : [],
    description: data.description || "",
    question: normalizeQuestionText(data.question),
    votes: {
      yes: Number(data.votes?.yes || 0),
      maybe: Number(data.votes?.maybe || 0),
      no: Number(data.votes?.no || 0)
    },
    votesByUser,
    comments,
    helpfulCommentId: data.helpfulCommentId || null,
    createdAt: data.createdAt || new Date().toISOString(),
    createdAtMs: Number(data.createdAtMs || Date.now())
  }
}

export function getUserVote(post, actorId) {
  if (!post || !actorId) return null
  const key = voteActorKey(actorId)
  const choice = post.votesByUser?.[key]
  return normalizeVoteChoice(choice) ? choice : null
}

export async function getPosts() {
  const postsRef = collection(db, POSTS_COLLECTION)
  const q = query(postsRef, orderBy("createdAtMs", "desc"))
  const snapshot = await getDocs(q)

  const posts = []
  const patchTasks = []

  snapshot.forEach((docSnap) => {
    const normalized = normalizePostShape(docSnap.id, docSnap.data())
    posts.push(normalized)

    // Legacy 문구/필드가 있으면 Firestore에 한 번 정규화 반영
    const raw = docSnap.data()
    const needsQuestionPatch = raw.question !== normalized.question
    const needsVotesByUser = raw.votesByUser === undefined
    if (needsQuestionPatch || needsVotesByUser) {
      patchTasks.push(
        updateDoc(doc(db, POSTS_COLLECTION, docSnap.id), {
          question: normalized.question,
          votesByUser: normalized.votesByUser
        })
      )
    }
  })

  if (patchTasks.length > 0) {
    await Promise.allSettled(patchTasks)
  }

  return posts
}

export async function addPost(input, author) {
  const now = new Date()
  await addDoc(collection(db, POSTS_COLLECTION), {
    authorId: author.id,
    authorName: author.name,
    authorVisibility: normalizeVisibility(author.visibility),
    media: input.media,
    description: input.description || "",
    question: normalizeQuestionText(input.question),
    votes: { yes: 0, maybe: 0, no: 0 },
    votesByUser: {},
    comments: [],
    helpfulCommentId: null,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime()
  })
}

export async function votePost(postId, choice, actorId) {
  if (!actorId || !normalizeVoteChoice(choice)) return false

  const postRef = doc(db, POSTS_COLLECTION, postId)
  const snapshot = await getDoc(postRef)
  if (!snapshot.exists()) return false

  const post = normalizePostShape(snapshot.id, snapshot.data())
  const key = voteActorKey(actorId)
  const prevChoice = post.votesByUser[key]

  if (prevChoice === choice) {
    post.votes[choice] = Math.max(0, post.votes[choice] - 1)
    delete post.votesByUser[key]
  } else {
    if (normalizeVoteChoice(prevChoice)) {
      post.votes[prevChoice] = Math.max(0, post.votes[prevChoice] - 1)
    }
    post.votes[choice] += 1
    post.votesByUser[key] = choice
  }

  await updateDoc(postRef, {
    votes: post.votes,
    votesByUser: post.votesByUser
  })
  return true
}

export async function addComment(postId, text, author) {
  const postRef = doc(db, POSTS_COLLECTION, postId)
  const snapshot = await getDoc(postRef)
  if (!snapshot.exists()) return false

  const post = normalizePostShape(snapshot.id, snapshot.data())
  post.comments.unshift({
    id: `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    authorId: author.id,
    authorName: author.name,
    authorVisibility: normalizeVisibility(author.visibility),
    text,
    createdAt: new Date().toISOString()
  })

  await updateDoc(postRef, { comments: post.comments })
  return true
}

export async function markHelpfulComment(postId, commentId, actorId) {
  const postRef = doc(db, POSTS_COLLECTION, postId)
  const snapshot = await getDoc(postRef)
  if (!snapshot.exists()) return false

  const post = normalizePostShape(snapshot.id, snapshot.data())
  if (post.authorId !== actorId) return false

  const commentExists = post.comments.some((comment) => comment.id === commentId)
  if (!commentExists) return false

  await updateDoc(postRef, { helpfulCommentId: commentId })
  return true
}

export async function deletePost(postId, actorId) {
  const postRef = doc(db, POSTS_COLLECTION, postId)
  const snapshot = await getDoc(postRef)
  if (!snapshot.exists()) return false

  const post = normalizePostShape(snapshot.id, snapshot.data())
  if (post.authorId !== actorId) return false

  await deleteDoc(postRef)
  return true
}

export async function reportTarget(targetType, targetId, actorId, postId = null, reason = "") {
  if (!actorId) return { ok: false, reason: "no-actor" }
  if (!targetId) return { ok: false, reason: "invalid-target" }
  if (targetType !== "post" && targetType !== "comment") {
    return { ok: false, reason: "invalid-type" }
  }

  const reportId = `${targetType}_${targetId}_${voteActorKey(actorId)}`
  const reportRef = doc(db, REPORTS_COLLECTION, reportId)
  const exists = await getDoc(reportRef)
  if (exists.exists()) {
    return { ok: false, reason: "duplicate" }
  }

  await setDoc(reportRef, {
    targetType,
    targetId,
    postId,
    reason,
    reporterId: actorId,
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now()
  })

  return { ok: true }
}
