# XHS to Obsidian

一个 Manifest V3 Chrome 扩展：打开小红书笔记后，点击扩展图标，即可提取当前笔记的标题、正文和图片，转换成 Markdown，并通过 Obsidian 的 Local REST API 保存到本地 Obsidian 库。

默认保存目录：

```text
Interviews/XHS
```

图片会保存到同级 `assets` 文件夹，并自动插入到 Markdown 笔记中。

## 功能

- 提取小红书笔记标题、正文、话题标签和来源链接。
- 抓取笔记图片并保存到 Obsidian vault。
- 生成带 front matter 的 Markdown。
- 支持 Obsidian Local REST API 的 HTTP 和 HTTPS 地址。
- API Key 只保存在本机 Chrome 扩展的 `chrome.storage.local`，不会写入项目文件。

## 文件结构

```text
.
├── manifest.json
├── content.js
├── popup.html
├── popup.css
├── popup.js
└── README.md
```

## 使用前准备

### 1. 安装 Obsidian 插件

在 Obsidian 中安装并启用社区插件：

```text
Local REST API
```

进入插件设置，复制 API Key。

### 2. 启用本地 API

推荐开启 Local REST API 插件里的非加密 HTTP Server，默认地址：

```text
http://127.0.0.1:27123
```

如果你使用 HTTPS，也可以填：

```text
https://127.0.0.1:27124
```

HTTPS 模式可能需要先信任 Local REST API 的本地证书。

### 3. 创建 Obsidian 文件夹

在你的 Obsidian vault 中创建：

```text
Interviews/XHS
```

## 在 Chrome 中加载

1. 下载或克隆这个仓库。
2. 打开 Chrome，进入：

   ```text
   chrome://extensions/
   ```

3. 打开右上角 `开发者模式`。
4. 点击 `加载已解压的扩展程序`。
5. 选择本项目文件夹。
6. 打开任意小红书笔记页面。
7. 点击浏览器右上角扩展图标。
8. 首次使用时填写：

   ```text
   Local REST API URL: http://127.0.0.1:27123
   API Key: 你的 Obsidian Local REST API Key
   Vault Folder: Interviews/XHS
   ```

9. 点击 `Save Settings`，再点击 `Export`。

## 导出结果

Markdown 文件示例：

```text
Interviews/XHS/2026-05-10 06-17-39 百度产品一面.md
```

图片文件示例：

```text
Interviews/XHS/assets/2026-05-10 06-17-39 百度产品一面-image-01.webp
```

Markdown 会包含：

- 来源链接
- 抓取时间
- 平台信息
- 标签
- 图片
- 正文
- 原始链接

## 安全说明

- `http://127.0.0.1:27123` 是本机地址，别人拿到这个 URL 也访问不到你的电脑。
- 真正需要保护的是 Obsidian Local REST API 的 API Key。
- 不要把 API Key 截图、提交到 GitHub 或发给别人。
- 本仓库不会包含任何 API Key。

## 常见问题

### 导出成功但没有图片？

先确认小红书笔记弹窗里的图片已经加载出来，再点击扩展图标。修改扩展代码后，需要在 `chrome://extensions/` 里点击扩展卡片的刷新按钮重新加载。

### Obsidian 没有出现新文件？

检查：

- Obsidian 是否正在运行。
- Local REST API 插件是否启用。
- API URL 是否正确。
- API Key 是否只粘贴了 key 本身，不要带 `Bearer`。
- `Interviews/XHS` 文件夹是否已经创建。

### 可以识别图片里的文字吗？

当前版本会保存图片，但不会 OCR 图片文字。如果要把图片中的面试题转成可搜索文本，需要额外接 OCR 能力。

## 分享给别人

可以直接分享仓库地址。对方下载后按上面的 Chrome 加载步骤操作即可。

如果要分享压缩包，可以把以下文件打包：

```text
manifest.json
content.js
popup.html
popup.css
popup.js
README.md
```

不要把自己的 API Key 或 Chrome 用户数据目录一起分享。
