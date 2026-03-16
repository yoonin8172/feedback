import {
  addComment,
  deletePost,
  getPosts,
  getUserVote,
  markHelpfulComment,
  reportTarget,
  votePost
} from "./postStore"
import { clearCurrentUser, getDisplayName } from "./authStore"
import { initSessionGate } from "./sessionGate"

const activeFeed = document.getElementById("activeFeed")
const feedCount = document.getElementById("feedCount")
const feedTitle = document.getElementById("feedTitle")
const tabNeeds = document.getElementById("tabNeeds")
const tabPopular = document.getElementById("tabPopular")

const navigationEntry = performance.getEntriesByType("navigation")[0]
const isReload = navigationEntry?.type === "reload"
const isDirectEnter = !document.referrer
if (isReload || isDirectEnter) {
  clearCurrentUser()
}

let currentUser = null
let currentView = "needs"
let feedData = { needsFeedback: [], popular: [] }

const FEEDBACK_NEEDED_MAX_REACTIONS = 7
const POPULAR_MIN_REACTIONS = 8
const POPULAR_MIN_COMMENTS = 2

const POST_REPORT_REASONS = [
  "부적절한 이미지/영상",
  "스팸/광고",
  "기타"
]

const COMMENT_REPORT_REASONS = [
  "지나친 비방",
  "욕설/혐오 표현",
  "스팸/도배",
  "기타"
]

function getReactionCount(post) {
  return (post.votes?.yes || 0) + (post.votes?.maybe || 0) + (post.votes?.no || 0)
}

function showReportReasonModal(title, reasons) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div")
    backdrop.className = "report-modal-backdrop"

    const panel = document.createElement("div")
    panel.className = "report-modal"
    panel.innerHTML = `
      <h3>${title}</h3>
      <p>신고 사유를 선택해주세요.</p>
      <div class="report-reason-list"></div>
      <button type="button" class="report-cancel-btn">취소</button>
    `
    backdrop.appendChild(panel)

    const reasonList = panel.querySelector(".report-reason-list")
    reasons.forEach((reason) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "report-reason-btn"
      button.textContent = reason
      button.addEventListener("click", () => cleanup(reason))
      reasonList.appendChild(button)
    })

    const cancelBtn = panel.querySelector(".report-cancel-btn")
    cancelBtn.addEventListener("click", () => cleanup(null))
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) cleanup(null)
    })

    function onKeyDown(event) {
      if (event.key === "Escape") cleanup(null)
    }

    function cleanup(value) {
      document.removeEventListener("keydown", onKeyDown)
      backdrop.remove()
      resolve(value)
    }

    document.addEventListener("keydown", onKeyDown)
    document.body.appendChild(backdrop)
  })
}

function getVisibleAuthorText(name, visibility) {
  return visibility === "nickname" ? `@${name}` : "익명"
}

function createMediaNode(item) {
  const wrapper = document.createElement("div")
  wrapper.className = "media-item"

  if (item.type === "video") {
    const video = document.createElement("video")
    video.src = item.url
    video.controls = true
    video.className = "post-media"
    wrapper.appendChild(video)
    return wrapper
  }

  const img = document.createElement("img")
  img.src = item.url
  img.alt = "업로드된 작업물"
  img.className = "post-media"
  wrapper.appendChild(img)
  return wrapper
}

function createCommentNode(post, comment) {
  const item = document.createElement("li")
  item.className = "comment-item"

  const head = document.createElement("div")
  head.className = "comment-head"

  const meta = document.createElement("p")
  meta.className = "comment-meta"
  meta.textContent = getVisibleAuthorText(comment.authorName, comment.authorVisibility)
  head.appendChild(meta)

  if (currentUser && comment.authorId !== currentUser.id) {
    const reportBtn = document.createElement("button")
    reportBtn.type = "button"
    reportBtn.className = "icon-btn comment-icon-btn"
    reportBtn.dataset.action = "report-comment"
    reportBtn.dataset.postId = post.id
    reportBtn.dataset.commentId = comment.id
    reportBtn.textContent = "⋮"
    reportBtn.title = "코멘트 신고"
    reportBtn.setAttribute("aria-label", "코멘트 신고")
    head.appendChild(reportBtn)
  }

  item.appendChild(head)

  const text = document.createElement("p")
  text.className = "comment-text"
  text.textContent = comment.text
  item.appendChild(text)

  const actions = document.createElement("div")
  actions.className = "comment-actions"

  if (post.helpfulCommentId === comment.id) {
    const badge = document.createElement("span")
    badge.className = "helpful-badge"
    badge.textContent = "도움된 코멘트"
    actions.appendChild(badge)
  } else if (currentUser && post.authorId === currentUser.id) {
    const helpfulBtn = document.createElement("button")
    helpfulBtn.type = "button"
    helpfulBtn.className = "mini-btn"
    helpfulBtn.dataset.action = "helpful"
    helpfulBtn.dataset.postId = post.id
    helpfulBtn.dataset.commentId = comment.id
    helpfulBtn.textContent = "도움 코멘트로 지정"
    actions.appendChild(helpfulBtn)
  }

  item.appendChild(actions)
  return item
}

function createPostCard(post) {
  const card = document.createElement("article")
  card.className = "post-card"

  const postHead = document.createElement("div")
  postHead.className = "post-head"

  const authorMeta = document.createElement("p")
  authorMeta.className = "post-author"
  authorMeta.textContent = `작성자: ${getVisibleAuthorText(post.authorName, post.authorVisibility)}`
  postHead.appendChild(authorMeta)

  if (currentUser && post.authorId === currentUser.id) {
    const deleteBtn = document.createElement("button")
    deleteBtn.type = "button"
    deleteBtn.className = "icon-btn post-icon-btn"
    deleteBtn.dataset.action = "delete-post"
    deleteBtn.dataset.postId = post.id
    deleteBtn.textContent = "🗑"
    deleteBtn.title = "게시물 삭제"
    deleteBtn.setAttribute("aria-label", "게시물 삭제")
    postHead.appendChild(deleteBtn)
  } else if (currentUser) {
    const reportPostBtn = document.createElement("button")
    reportPostBtn.type = "button"
    reportPostBtn.className = "icon-btn post-icon-btn"
    reportPostBtn.dataset.action = "report-post"
    reportPostBtn.dataset.postId = post.id
    reportPostBtn.textContent = "⋮"
    reportPostBtn.title = "게시물 신고"
    reportPostBtn.setAttribute("aria-label", "게시물 신고")
    postHead.appendChild(reportPostBtn)
  }
  card.appendChild(postHead)

  if (post.media.length > 0) {
    const mediaGrid = document.createElement("div")
    mediaGrid.className = post.media.length > 1 ? "media-grid" : "media-grid single"
    post.media.forEach((item) => mediaGrid.appendChild(createMediaNode(item)))
    card.appendChild(mediaGrid)
  }

  if (post.description) {
    const description = document.createElement("p")
    description.className = "post-description"
    description.textContent = post.description
    card.appendChild(description)
  }

  const question = document.createElement("p")
  question.className = "post-question"
  question.textContent = post.question
  card.appendChild(question)

  const votes = document.createElement("div")
  votes.className = "vote-box"
  const myVote = getUserVote(post, currentUser?.id)

  const yesBtn = document.createElement("button")
  yesBtn.type = "button"
  yesBtn.className = `vote-btn ${myVote === "yes" ? "selected" : ""}`.trim()
  yesBtn.dataset.action = "vote"
  yesBtn.dataset.postId = post.id
  yesBtn.dataset.choice = "yes"
  yesBtn.textContent = `👍 예 ${post.votes.yes}`

  const maybeBtn = document.createElement("button")
  maybeBtn.type = "button"
  maybeBtn.className = `vote-btn ${myVote === "maybe" ? "selected" : ""}`.trim()
  maybeBtn.dataset.action = "vote"
  maybeBtn.dataset.postId = post.id
  maybeBtn.dataset.choice = "maybe"
  maybeBtn.textContent = `😐 애매해요 ${post.votes.maybe}`

  const noBtn = document.createElement("button")
  noBtn.type = "button"
  noBtn.className = `vote-btn ${myVote === "no" ? "selected" : ""}`.trim()
  noBtn.dataset.action = "vote"
  noBtn.dataset.postId = post.id
  noBtn.dataset.choice = "no"
  noBtn.textContent = `👎 아니요 ${post.votes.no}`

  votes.append(yesBtn, maybeBtn, noBtn)
  card.appendChild(votes)

  const commentForm = document.createElement("form")
  commentForm.className = "comment-form"
  commentForm.dataset.postId = post.id
  commentForm.innerHTML = `
    <input name="comment" type="text" maxlength="220" placeholder="피드백을 남겨주세요." />
    <select name="visibility" class="visibility-select">
      <option value="anonymous">익명</option>
      <option value="nickname">닉네임</option>
    </select>
    <button type="submit" class="mini-btn">등록</button>
  `
  card.appendChild(commentForm)

  const commentList = document.createElement("ul")
  commentList.className = "comment-list"
  if (post.comments.length === 0) {
    const empty = document.createElement("li")
    empty.className = "comment-empty"
    empty.textContent = "아직 코멘트가 없어요. 첫 피드백을 남겨보세요."
    commentList.appendChild(empty)
  } else {
    post.comments.forEach((comment) => {
      commentList.appendChild(createCommentNode(post, comment))
    })
  }
  card.appendChild(commentList)

  return card
}

function partitionPosts(posts) {
  const withScores = posts.map((post) => ({
    post,
    reactions: getReactionCount(post),
    comments: post.comments?.length || 0
  }))

  let popular = withScores
    .filter(
      (item) =>
        item.reactions >= POPULAR_MIN_REACTIONS &&
        item.comments >= POPULAR_MIN_COMMENTS
    )
    .sort(
      (a, b) =>
        b.reactions - a.reactions ||
        b.comments - a.comments ||
        new Date(b.post.createdAt) - new Date(a.post.createdAt)
    )
    .map((item) => item.post)

  const popularIds = new Set(popular.map((post) => post.id))
  let needsFeedback = withScores
    .filter(
      (item) =>
        !popularIds.has(item.post.id) &&
        item.reactions <= FEEDBACK_NEEDED_MAX_REACTIONS
    )
    .sort(
      (a, b) =>
        a.reactions - b.reactions ||
        a.comments - b.comments ||
        new Date(b.post.createdAt) - new Date(a.post.createdAt)
    )
    .map((item) => item.post)

  if (needsFeedback.length === 0 && popular.length === 0) {
    needsFeedback = [...withScores]
      .sort(
        (a, b) =>
          a.reactions - b.reactions ||
          a.comments - b.comments ||
          new Date(b.post.createdAt) - new Date(a.post.createdAt)
      )
      .map((item) => item.post)
  }

  if (needsFeedback.length === 0) {
    needsFeedback = withScores
      .filter((item) => !popularIds.has(item.post.id))
      .sort(
        (a, b) =>
          a.reactions - b.reactions ||
          a.comments - b.comments ||
          new Date(b.post.createdAt) - new Date(a.post.createdAt)
      )
      .map((item) => item.post)
  }

  return { needsFeedback, popular }
}

function setActiveTab(view) {
  currentView = view
  tabNeeds?.classList.toggle("active", view === "needs")
  tabPopular?.classList.toggle("active", view === "popular")
}

function renderFeed(items, emptyMessage) {
  activeFeed.innerHTML = ""

  if (items.length === 0) {
    const empty = document.createElement("p")
    empty.className = "empty-feed"
    empty.textContent = emptyMessage
    activeFeed.appendChild(empty)
    return
  }

  items.forEach((post) => activeFeed.appendChild(createPostCard(post)))
}

function renderActiveView() {
  if (currentView === "popular") {
    feedTitle.textContent = "반응이 많은 작업"
    feedCount.textContent = `${feedData.popular.length}개`
    renderFeed(feedData.popular, "아직 반응이 많은 작업이 없어요.")
    return
  }

  feedTitle.textContent = "피드백이 필요한 작업"
  feedCount.textContent = `${feedData.needsFeedback.length}개`
  renderFeed(feedData.needsFeedback, "아직 게시물이 없어요. 첫 작업을 올려보세요.")
}

async function render() {
  if (!currentUser) {
    document.body.classList.add("login-only")
    activeFeed.innerHTML = ""
    feedCount.textContent = "0개"
    return
  }

  document.body.classList.remove("login-only")

  const posts = await getPosts()
  feedData = partitionPosts(posts)

  if (currentView === "popular" && feedData.popular.length === 0) {
    setActiveTab("needs")
  }

  renderActiveView()
}

tabNeeds?.addEventListener("click", () => {
  setActiveTab("needs")
  renderActiveView()
})

tabPopular?.addEventListener("click", () => {
  setActiveTab("popular")
  renderActiveView()
})

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button")
  if (!button || !currentUser) return

  if (button.dataset.action === "vote") {
    const { postId, choice } = button.dataset
    const updated = await votePost(postId, choice, currentUser.id)
    if (updated) render()
  }

  if (button.dataset.action === "helpful") {
    const { postId, commentId } = button.dataset
    const updated = await markHelpfulComment(postId, commentId, currentUser.id)
    if (updated) {
      render()
    }
  }

  if (button.dataset.action === "delete-post") {
    const { postId } = button.dataset
    const shouldDelete = window.confirm("이 게시물을 삭제할까요?")
    if (!shouldDelete) return

    const deleted = await deletePost(postId, currentUser.id)
    if (deleted) {
      render()
    }
  }

  if (button.dataset.action === "report-post") {
    const { postId } = button.dataset
    const reason = await showReportReasonModal("게시물 신고", POST_REPORT_REASONS)
    if (!reason) return

    const result = await reportTarget("post", postId, currentUser.id, postId, reason)
    if (result.ok) {
      window.alert("신고가 접수되었습니다.")
    } else if (result.reason === "duplicate") {
      window.alert("이미 신고한 게시물입니다.")
    }
  }

  if (button.dataset.action === "report-comment") {
    const { postId, commentId } = button.dataset
    const reason = await showReportReasonModal("코멘트 신고", COMMENT_REPORT_REASONS)
    if (!reason) return

    const result = await reportTarget("comment", commentId, currentUser.id, postId, reason)
    if (result.ok) {
      window.alert("신고가 접수되었습니다.")
    } else if (result.reason === "duplicate") {
      window.alert("이미 신고한 코멘트입니다.")
    }
  }
})

document.addEventListener("submit", async (event) => {
  const form = event.target
  if (!form.classList.contains("comment-form") || !currentUser) return

  event.preventDefault()
  const input = form.querySelector("input[name='comment']")
  const visibilityInput = form.querySelector("select[name='visibility']")
  const text = input.value.trim()
  if (!text) return

  const updated = await addComment(form.dataset.postId, text, {
    id: currentUser.id,
    name: getDisplayName(currentUser),
    visibility: visibilityInput?.value || "anonymous"
  })

  if (updated) render()
})

initSessionGate({
  onRequireLogin: () => {
    currentUser = null
    render()
  },
  onReady: (user) => {
    currentUser = user
    render()
  }
})
