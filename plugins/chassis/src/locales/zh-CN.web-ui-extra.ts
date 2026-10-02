import type { LocaleCatalog } from "../i18n.ts";

export const zhCNWebUiExtra: LocaleCatalog = {
  "Open sent email: {subject}": "打开已发送的邮件：{subject}",
  "No subject": "无主题",
  "(No subject)": "（无主题）",
  "Undisclosed recipients": "未公开的收件人",
  "To: {recipients}": "收件人：{recipients}",
  "· Cc: {recipients}": "· 抄送：{recipients}",
  "Attachments: {names}": "附件：{names}",
  "This email has no text body.": "这封邮件没有文本正文。",
  "No sent emails in this account.": "此账号还没有已发送的邮件。",
  "Couldn't load chat.": "无法加载对话。",
  "Ask about this email": "询问这封邮件",
  "Loading chat…": "正在加载对话…",
  "Loading sent mail…": "正在加载已发送邮件…",
  "Loading email…": "正在加载邮件…",

  "Choose an image smaller than 2 MB.": "请选择小于 2 MB 的图片。",
  "Choose a PNG, JPEG, WebP, GIF, or SVG image.": "请选择 PNG、JPEG、WebP、GIF 或 SVG 图片。",
  "This image has no visible size.": "这张图片没有可见尺寸。",
  "Image uploads are unavailable in this browser.": "当前浏览器不支持上传图片。",
  "This image is too complex. Choose a simpler image.": "这张图片过于复杂，请选择更简单的图片。",

  "Imported theme": "导入的主题",
  "This is a binary plist. In iTerm2, export the preset again to the XML .itermcolors file.":
    "这是二进制 plist。请在 iTerm2 中把该配色方案重新导出为 XML 格式的 .itermcolors 文件。",
  "Expected an iTerm2 .itermcolors file with a Background Color and a Foreground Color.":
    "需要一个包含 Background Color 和 Foreground Color 的 iTerm2 .itermcolors 文件。",
  "Expected a VS Code color theme object.": "需要一个 VS Code 配色主题对象。",
  "Expected a VS Code color theme with an editor.background color.":
    "需要一个带 editor.background 颜色的 VS Code 配色主题。",

  "Summarize my recent emails": "总结我最近的邮件",
  "Summarize my inbox": "总结我的收件箱",
  "Summarize this email": "总结这封邮件",
  "Summarize this thread": "总结这个话题",
  "Which drafts should I review first?": "我该先看哪些草稿？",
  "What needs my attention?": "有什么需要我处理？",
  "What should I follow up on?": "我该跟进什么？",
  "What needs my input?": "有什么需要我定夺？",
  "Explain the proposal": "解释一下这个提案",
  "Does this still need a reply?": "这个还需要回复吗？",
  "Help me write a reply": "帮我写回复",
  "Make it shorter": "写短一些",
  "Make it more friendly": "语气更友好一些",
  "Remove the salutations": "去掉称呼",
  "Send the draft with your instructions": "按你的要求发送这封草稿",
  "Send it": "发送",

  "Already open in a pane": "已经在某个面板中打开了",
  "Split left": "向左分屏",
  "Split right": "向右分屏",
  "Split up": "向上分屏",
  "Split down": "向下分屏",
  "Show here": "显示在这里",
  "Replace pane": "替换面板",
  "Open as tab": "作为标签页打开",
  "Split this pane with a new session": "用一个新会话拆分此面板",
  "Open full screen": "全屏打开",
  Tools: "工具",
  "This conversation's workspace": "本对话的工作区",
  "Back to this chat": "回到这段对话",
  "Session tools": "会话工具",

  "Shared channel": "共享频道",
  "No active run to signal.": "没有正在进行的运行可以通知。",
  "Approve or deny the pending command to continue.": "请批准或拒绝待处理的命令以继续。",
  "The credential request is still pending. Please try again.": "凭据请求仍在等待中，请重试。",
  "Could not continue after the approval.": "批准之后无法继续。",
  "This approval is no longer available — it may have expired or already been handled.":
    "这条审批已不可用——它可能已过期或已被处理。",
  "Nothing to send.": "没有可发送的内容。",
  "Message wasn’t sent. Check your connection and try again.": "消息没有发送成功。请检查网络连接后重试。",
  "Timed out waiting for the agent to respond.": "等待助手响应超时。",

  History: "历史记录",
  "Forget this fact": "忘掉这条事实",
  "No remembered facts match this search.": "没有匹配这次搜索的记忆事实。",
  "The agent hasn’t noted any facts yet.": "助手还没有记下任何事实。",

  "Couldn't read that file. Expected an iTerm2 .itermcolors or a VS Code color theme .json.":
    "无法读取该文件。请提供 iTerm2 的 .itermcolors 文件或 VS Code 配色主题 .json 文件。",
  "Diagram is too large": "图表太大",
  "Images are not supported in chat diagrams": "聊天图表不支持图片",
  "Diagram dimensions are too large": "图表尺寸太大",
  "Rendering diagram…": "正在渲染图表…",
  "Diagram will render when the reply finishes.": "回复结束后会渲染图表。",
  "Unable to render this diagram. Its source is shown below.": "无法渲染这张图表，源码显示在下方。",
  "Mermaid diagram. Diagram source is available below.": "Mermaid 图表。图表源码显示在下方。",

  "Shared conversation": "共享对话",
  "This link is unavailable": "此链接不可用",
  "The conversation is unavailable or you may not have access.": "该对话不可用，或者你没有访问权限。",
  "Organization only": "仅限组织内",
  "Shared snapshot · {date} · {audience}": "共享快照 · {date} · {audience}",
  "This approval couldn't be applied right now — the conversation is waiting on a different approval.":
    "这条审批暂时无法生效——这段对话正在等待另一条审批。",

  "This connection expired or was started in another QM account. Sign in to the account you want to connect and try again.":
    "此连接已过期，或是在另一个 QM 账号中发起的。请登录你想连接的账号后重试。",
  "Slack authorization was cancelled. Your QM account has not been linked.":
    "Slack 授权已取消。你的 QM 账号还没有关联。",
  "Could not start Slack authorization. Please try again.": "无法发起 Slack 授权，请重试。",
  "Could not verify the Slack authorization link.": "无法验证这个 Slack 授权链接。",
  "Could not connect Slack.": "无法连接 Slack。",

  "Create token": "创建 token",
  "Under App Configuration Tokens, choose Generate Token, select your workspace, and copy the access token (not the refresh token).":
    "在 App Configuration Tokens 下选择 Generate Token，选中你的工作区，然后复制 access token（不是 refresh token）。",
  "Submit token securely": "安全地提交 token",
  "App created. No more token copying needed.": "应用已创建，不用再复制 token 了。",
  "Paste it only in the secure form, never in this conversation. QM uses it to create its app, then discards it.":
    "只把它粘贴到安全表单里，不要粘贴到这段对话中。QM 会用它创建应用，然后丢弃它。",
  "This token can manage other apps you own in the selected workspace. Your company owns the app QM creates.":
    "这个 token 可以管理你在所选工作区里拥有的其他应用。QM 创建的应用归你的公司所有。",
  "Check progress": "查看进度",

  "Could not check the Slack installation. Try again.": "无法检查 Slack 安装状态，请重试。",
  "Could not open your browser. Please try again.": "无法打开你的浏览器，请重试。",
  "Allow a new tab to install QM, then try again.": "请允许弹出新标签页来安装 QM，然后重试。",
  "Connecting Slack": "正在连接 Slack",
  "Opening Slack…": "正在打开 Slack…",
  "Checking Slack…": "正在检查 Slack…",
  "QM added to Slack": "QM 已添加到 Slack",
  "Work with QM where your team already talks.": "在团队本来就在沟通的地方用 QM 干活。",

  "Think of it as your YC partner in a box. The more you use QM, the more context we have, the more we can help.":
    "就把它当成装在盒子里的 YC 合伙人。你用 QM 越多，我们掌握的背景就越多，能帮上忙的地方也越多。",
  "Welcome to QM, your agent harness. Use it to research customers, build tools, and automate the everyday work of running {company}":
    "欢迎使用 QM，你的智能体工作台。用它来调研客户、构建工具，把经营 {company} 的日常事务自动化。",
  "Opening {name}…": "正在打开 {name}…",

  "Remove access": "移除访问权限",
  "Cancel selection": "取消选择",
  "People with access": "拥有访问权限的人",
  "General access": "通用访问权限",
  "Add {email} with view access": "以查看权限添加 {email}",
  "Access for {scope}": "{scope} 的访问权限",
  Restricted: "受限",
  "They receive an app link by email and sign in with this address. This does not add them to your organization.":
    "他们会收到一封带应用链接的邮件，并使用这个地址登录。这不会把他们加入你的组织。",

  "No apps shared with you.": "没有共享给你的应用。",
  "No apps of your own yet.": "你还没有自己的应用。",
  "Unknown owner": "归属未知",

  "Drop files": "拖放文件",
  "Uploading…": "上传中…",
  "All files": "全部文件",
  "All types": "全部类型",
  Images: "图片",
  Documents: "文档",
  Other: "其他",

  "Previous 7 days": "最近 7 天",
  "Previous 30 days": "最近 30 天",
  "Couldn't update the pinned header setting.": "无法更新置顶页眉设置。",
  "Turning it on posts and pins the header; turning it off unpins and removes it. Default follows the org-wide setting. Model changes edit the pinned message in place.":
    "开启后会发布并置顶这条页眉；关闭后会取消置顶并删除。默认跟随组织级设置。更换模型时会就地修改这条置顶消息。",
  Older: "更早",

  "Header pinned in the channel.": "已在该频道置顶页眉。",
  "Pinned header removed.": "已取消置顶页眉。",
  "Pinned header": "置顶页眉",
  "A small pinned message in the Slack channel naming the model in use.":
    "在 Slack 频道里置顶的一条小消息，写明当前使用的模型。",
  "Pinned Slack header for this channel": "此频道的 Slack 置顶页眉",
  "Default ({state})": "默认（{state}）",

  "Popular apps": "常用应用",
  "No apps match “{query}”. Try another name.": "没有匹配“{query}”的应用。换个名字试试。",
  "Use it to research customers and investors, fundraise, and automate the everyday work of running {company}":
    "用它调研客户和投资人、推进融资，并把经营 {company} 的日常事务自动化。",
  "Show fewer apps": "收起应用列表",
  "Browse all {count} apps": "浏览全部 {count} 个应用",
  "{count} app found": "找到 {count} 个应用",
  "{count} apps found": "找到 {count} 个应用",

  "Ready to use in chat": "已可在对话中使用",
  "Opens in a new tab": "在新标签页中打开",
  "Authorize access · New tab": "授权访问 · 新标签页",
  "Connected {name}": "已连接 {name}",
  "your account": "你的账号",

  "(no longer offered)": "（已不再提供）",

  "Org settings, people, and policy": "组织设置、成员与策略",
  "Coming soon.": "即将推出。",
  "No model is available": "没有可用的模型",
  "Go to": "前往",
  "Suggested activities": "推荐的活动",
  "Agent is working": "助手正在工作",
  "You no longer have access to the original conversation.": "你已无权访问原对话。",
  "Forked from": "派生自",
  "Inbox assistant": "收件箱助手",
  "Use an API key": "使用 API 密钥",

  "Plain-language guidance for proactive work. Leave empty to respond only when addressed.":
    "用白话写清楚主动工作的要求。留空则只在被直接问到时才回复。",
  "For example: Flag anything that could delay the launch.": "例如：标出任何可能拖慢上线的事项。",
};
