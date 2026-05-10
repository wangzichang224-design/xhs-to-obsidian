# XHS to Obsidian

一个 Manifest V3 Chrome 扩展：打开小红书笔记后，点击扩展图标，即可提取当前笔记的标题、正文、话题标签和图片，转换成 Markdown，并通过 Obsidian 的 Local REST API 保存到本地 Obsidian 库。

默认保存目录：

```text
Interviews/XHS
```

图片会保存到同级 `assets` 文件夹，并自动插入到 Markdown 笔记中。

## 功能

- 提取小红书笔记标题、正文、话题标签和来源链接。
- 抓取笔记图片，并保存到 Obsidian vault。
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

打开 Obsidian：

1. 点击左下角齿轮，进入 `设置`。
2. 找到 `第三方插件` 或 `Community plugins`。
3. 如果看到 `安全模式` 或 `Restricted mode`，先关闭它。
4. 点击 `浏览` 或 `Browse`。
5. 搜索：

   ```text
   Local REST API
   ```

6. 点进插件详情页，点击 `安装` 或 `Install`。
7. 安装完成后，点击 `启用` 或 `Enable`。

### 2. 找到 API Key

还是在 Obsidian 设置里：

1. 进入 `第三方插件`。
2. 在已安装插件里找到 `Local REST API`。
3. 点击它旁边的齿轮或设置入口。
4. 找到 `API Key`。
5. 复制那一长串 key。

先不要关闭 Obsidian。这个插件需要 Obsidian 保持打开，Chrome 扩展才能把内容写进去。

注意：只复制 key 本身，不要加 `Bearer`。

### 3. 开启 HTTP Server

在 `Local REST API` 的设置页面里，找到类似下面的选项：

```text
Enable Non-Encrypted (HTTP) Server
```

或者：

```text
Non-encrypted HTTP server
```

把它打开。

地址保持默认：

```text
http://127.0.0.1:27123
```

如果看到安全警告不用慌。`127.0.0.1` 是本机地址，只要你是在自己电脑上本地使用，别人无法通过这个地址直接访问你的电脑。

如果你使用 HTTPS，也可以填：

```text
https://127.0.0.1:27124
```

HTTPS 模式可能需要先信任 Local REST API 的本地证书。

### 4. 创建 Interviews/XHS 文件夹

在 Obsidian 左侧文件列表里：

1. 右键空白处。
2. 选择新建文件夹，名字写：

   ```text
   Interviews
   ```

3. 点进 `Interviews`。
4. 再右键，新建文件夹：

   ```text
   XHS
   ```

最后应该是：

```text
Interviews
└── XHS
```

如果没有先创建这个文件夹，导出时可能会失败。

## 在 Chrome 中加载插件

如果你是从 GitHub 下载给自己或别人使用：

1. 打开仓库页面。
2. 点击绿色 `Code` 按钮。
3. 点击 `Download ZIP`。
4. 解压 ZIP。
5. 记住解压后的项目文件夹位置，里面应该能看到 `manifest.json`。

然后打开 Chrome：

1. 进入：

   ```text
   chrome://extensions/
   ```

2. 打开右上角 `开发者模式`。
3. 点击 `加载已解压的扩展程序`。
4. 选择刚才解压后的项目文件夹，也就是包含 `manifest.json` 的那个文件夹。

如果是在本机开发目录里直接测试，可以选择当前项目文件夹：

```text
C:\Users\王子畅\Documents\New project 3
```

加载成功后，Chrome 右上角会出现扩展图标。也可以点击浏览器右上角的拼图按钮，把这个插件固定到工具栏。

## 导出小红书笔记

1. 打开一篇小红书笔记页面。
2. 点击浏览器右上角的 `XHS to Obsidian` 扩展图标。
3. 在弹窗里填写：

   ```text
   Local REST API URL:
   http://127.0.0.1:27123

   API Key:
   粘贴你刚才从 Obsidian 复制的那串 key

   Vault Folder:
   Interviews/XHS
   ```

4. 先点击 `Save Settings`。
5. 再点击 `Export`。

成功后，Obsidian 的 `Interviews/XHS` 文件夹里会出现一个新的 `.md` 文件。

## 导出结果

Markdown 文件示例：

```text
Interviews/XHS/2026-05-10 06-17-39 百度产品一面.md
```

图片文件示例：

```text
Interviews/XHS/assets/2026-05-10 06-17-39 百度产品一面-image-01.webp
```

Markdown 通常会包含：

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
- 本仓库不包含任何 API Key。

## 常见问题

### API Key 是不是要带 Bearer？

不用。弹窗里的 `API Key` 只填 Obsidian 插件设置页里复制出来的 key 本身。

插件请求 Obsidian 时会自动加上：

```text
Authorization: Bearer <your-api-key>
```

### 导出成功但没有图片？

先确认小红书笔记弹窗里的图片已经加载出来，再点击扩展图标。

修改扩展代码后，需要在 `chrome://extensions/` 里点击扩展卡片的刷新按钮，然后重新打开或刷新小红书页面。

### Obsidian 没有出现新文件？

检查：

- Obsidian 是否正在运行。
- Local REST API 插件是否启用。
- HTTP Server 是否已经打开。
- API URL 是否是 `http://127.0.0.1:27123`。
- API Key 是否只粘贴了 key 本身，不要带 `Bearer`。
- `Interviews/XHS` 文件夹是否已经创建。

### 可以识别图片里的文字吗？

当前版本会保存图片，但不会 OCR 图片文字。

如果小红书笔记的关键信息都在图片里，插件会把图片一起保存到 Obsidian；如果想把图片里的文字也变成可搜索文本，需要额外接 OCR 能力。

## 分享给别人

可以直接分享这个 GitHub 仓库地址。对方下载后按上面的 Chrome 加载步骤操作即可。

如果要分享压缩包，只需要包含这些文件：

```text
manifest.json
content.js
popup.html
popup.css
popup.js
README.md
```

不要把自己的 API Key、Chrome 用户数据目录或 Obsidian vault 私密内容一起分享。
