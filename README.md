# Read & Pick 读词助手

**English-first reading for learners: see Chinese only when you need it, and pick the words worth *using*, not just the hard ones.**

一个给英语学习者的 Chrome 插件：页面默认只显示英文，卡住了才看那一段的中文；一键从文章里挑出值得学的词，标好“该主动用 / 认识就行”和“口语能说 / 只适合写”，收藏后导出 Markdown。

<!-- 截图上传到 docs 文件夹后，删掉这一行和最后一行的注释符号，图片就会显示
![划词和卡片](docs/screenshot-card.png)
![单段翻译](docs/screenshot-translate.png)
-->

## 为什么做这个

普通翻译插件有两个问题：

1. **看不到上下文。** 一篇讲芯片出口管制的文章，chips 被翻成了“薯片”。
2. **整页中文摆在那里，眼睛会自动滑到中文上。** 读完了，英文还是没进脑子。

Read & Pick 的思路反过来：英文为主，中文按需；挑词时不只看“难不难”，更看“这个词我该不该主动用、在什么场合用”。

## 功能

- **单段翻译**：每段旁边有个“译”字，点一下出这一段的中文，再点收起。翻译时会带上文章标题和上一段做上下文。
- **挑词**：把整篇文章交给大模型，按你的水平挑 12 到 20 个词，直接在原文里划线。
  - 粉色实线 `active`：值得主动用
  - 蓝色虚线 `passive`：认识就行
  - 灰色点线 `niche`：专有名词或术语，理解即可
- **词卡**：英文释义、中文、常用搭配、可整句背的例句；书面词会给口语替身，容易读偏的词（一词多义、俚语、false friend）会单独提醒。
- **Register 标签**：🗣 口语可用 / ✍️ 写作专用 / 👀 认识即可 / 🗣✍️ 两边都行 / 🗣👀 俚语
- **收藏和导出**：收藏时自动带上原句和来源链接，一键导出 `.md`，可以直接导入 Notion 或 Obsidian。
- **浮窗**：可拖动，自动贴边，可缩成小圆点，位置会记住。
- **快捷键**：Option / Alt + Shift + A 全文中文开关。

## 安装

暂未上架 Chrome 应用商店，需要手动加载，大约 2 分钟：

1. 下载：点这个页面右侧的 **Releases**，下载最新的 `read-pick.zip` 并解压。（也可以点绿色的 **Code → Download ZIP**。）
2. Chrome 地址栏打开 `chrome://extensions`
3. 右上角打开 **开发者模式**
4. 点 **加载已解压的扩展程序**，选中解压出来的 `read-pick` 文件夹
5. 自动弹出设置页，填好 API（见下一节），点“测试连接”

> 文件夹装好后不要删除或移动，Chrome 每次都从这里读取。
> 如果同时开着其他网页翻译插件，建议先关掉，避免互相干扰。

## 需要你自己的 API key

插件不带任何服务器，翻译和挑词都调用你自己的大模型 API。支持所有兼容 OpenAI 格式的接口。

| 服务 | 接口地址 | 模型 |
|---|---|---|
| DeepSeek（便宜，中英效果好） | `https://api.deepseek.com` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` 等 |
| 其他兼容服务 | 服务商给的 base URL | 服务商给的模型名 |

**DeepSeek key 怎么拿：** 打开 DeepSeek 开放平台，注册登录，充一点钱（几块钱能用很久），在“API keys”里创建一个，复制 `sk-` 开头的那串填进设置页。key 只显示一次，记得保存。

**大概花多少钱：** 用 DeepSeek 的话，单段翻译几乎可以忽略，整篇挑词一次大约几分钱人民币，以服务商当前价格为准。

## 让它更懂你

设置页里的“学习者说明”会原样发给模型。写清楚你的水平、目标、工作和爱好，挑词会更准，例句也会往你的生活里造。例如：

```
C1 English reader (Chinese native), target IELTS 7.5. Weak spot is speaking.
Works in marketing. Hobbies: hiking, coffee, travel in Japan.
```

## 隐私

- API key 只保存在你自己浏览器的本地存储里，不会上传到任何地方。
- 你点“译”或“挑词”时，对应的文章文字会发送给**你自己设置的那个 API 地址**，除此之外不发给任何人。
- 插件需要“读取所有网站”的权限，因为它要在你阅读的任意网页上显示按钮和划线。

详见 [PRIVACY.md](PRIVACY.md)。

## 自己改

整个插件是纯 JavaScript，没有构建步骤，改完在 `chrome://extensions` 点刷新就生效。

| 文件 | 管什么 |
|---|---|
| `background.js` | 调 API，翻译和挑词的 prompt 都在这里 |
| `content.js` | 页面上的一切：译按钮、划线、词卡、浮窗 |
| `content.css` | 页面上的样式和配色 |
| `popup.html / popup.js` | 工具栏弹窗：收藏列表、导出 Markdown |
| `options.html / options.js` | 设置页 |

想改挑词标准，最快的办法是改 `background.js` 里 `vocab()` 的 prompt；想改导出格式，改 `popup.js` 里的 `toMarkdown()`。

## 已知限制

- 被链接切开的短语可能划不上线，但仍会出现在浮窗的词表里。
- 少数网站正文不在 `<p>` 标签里，浮窗不会出现。
- 目前只支持英文译中文。

欢迎在 Issues 里反馈问题和想法。

## License

[MIT](LICENSE)：可以自由使用、修改和分发，保留版权声明即可。
