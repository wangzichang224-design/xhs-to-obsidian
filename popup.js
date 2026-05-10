const DEFAULT_CONFIG = {
  baseUrl: "http://127.0.0.1:27123",
  apiKey: "",
  folder: "Interviews/XHS"
};

const statusNode = document.getElementById("status");
const previewNode = document.getElementById("previewText");
const baseUrlInput = document.getElementById("baseUrl");
const apiKeyInput = document.getElementById("apiKey");
const folderInput = document.getElementById("folder");
const saveSettingsButton = document.getElementById("saveSettings");
const exportNowButton = document.getElementById("exportNow");

let latestExtraction = null;

document.addEventListener("DOMContentLoaded", init);
saveSettingsButton.addEventListener("click", saveSettings);
exportNowButton.addEventListener("click", exportCurrentTab);

async function init() {
  const config = await getConfig();
  hydrateForm(config);

  if (!config.apiKey) {
    setStatus("Paste your Obsidian API key, save settings, then export.", "error");
    await extractPreviewOnly();
    return;
  }

  await exportCurrentTab();
}

async function exportCurrentTab() {
  const config = readFormConfig();
  setBusy(true);

  try {
    if (!config.apiKey) {
      throw new Error("Missing Obsidian API key.");
    }

    await saveConfig(config);
    const extraction = await extractFromActiveTab();
    const vaultPath = buildVaultPath(config.folder, extraction.title);
    const images = extraction.images || [];

    setStatus(`Found ${images.length} image${images.length === 1 ? "" : "s"}. Saving...`, "");

    const exportedImages = await uploadImagesToObsidian(config, vaultPath, extraction);
    const markdown = renderMarkdown(extraction, exportedImages);

    latestExtraction = {
      ...extraction,
      markdown
    };
    previewNode.textContent = markdown;

    await writeMarkdownToObsidian(config, vaultPath, markdown);

    const savedImageCount = exportedImages.filter((image) => image.localPath).length;
    const failedImageCount = exportedImages.filter((image) => image.error).length;
    const imageMessage = images.length > 0
      ? ` with ${savedImageCount}/${images.length} images${failedImageCount ? `, ${failedImageCount} remote fallback` : ""}`
      : "";

    setStatus(`Saved to ${vaultPath}${imageMessage}`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
  }
}

async function extractPreviewOnly() {
  setBusy(true);

  try {
    const extraction = await extractFromActiveTab();
    latestExtraction = extraction;
    previewNode.textContent = extraction.markdown;
    setStatus("Preview ready. Save settings to export.", "");
  } catch (error) {
    previewNode.textContent = "No content extracted yet.";
    setStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    setBusy(false);
  }
}

async function saveSettings() {
  const config = readFormConfig();
  await saveConfig(config);
  setStatus("Settings saved.", "success");

  if (latestExtraction) {
    previewNode.textContent = latestExtraction.markdown;
  }
}

async function extractFromActiveTab() {
  const [tab] = await chromeTabsQuery({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url) {
    throw new Error("No active tab found.");
  }

  if (!/^https?:\/\/([^/]+\.)?xiaohongshu\.com\//i.test(tab.url)) {
    throw new Error("Open a Xiaohongshu note page before exporting.");
  }

  let response = await sendExtractMessage(tab.id);

  if (!response) {
    await chromeScriptingExecuteScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    response = await sendExtractMessage(tab.id);
  }

  if (!response?.ok) {
    throw new Error(response?.error || "Could not extract content from this page.");
  }

  return response.data;
}

async function sendExtractMessage(tabId) {
  try {
    return await chromeTabsSendMessage(tabId, { type: "XHS_EXTRACT_MARKDOWN" });
  } catch (_error) {
    return null;
  }
}

async function uploadImagesToObsidian(config, vaultPath, extraction) {
  const images = extraction.images || [];
  if (images.length === 0) {
    return [];
  }

  const noteDir = getDirName(vaultPath);
  const noteBaseName = stripMarkdownExtension(getBaseName(vaultPath));
  const exportedImages = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const imageNumber = String(index + 1).padStart(2, "0");

    try {
      setStatus(`Saving image ${index + 1}/${images.length}...`, "");
      const blob = await fetchImageBlob(image.url);
      const extension = extensionFromImage(image.url, blob.type);
      const filename = `${noteBaseName}-image-${imageNumber}.${extension}`;
      const vaultImagePath = `${noteDir}/assets/${filename}`;

      await writeBinaryToObsidian(config, vaultImagePath, blob);

      exportedImages.push({
        ...image,
        localPath: `assets/${filename}`,
        vaultPath: vaultImagePath
      });
    } catch (error) {
      exportedImages.push({
        ...image,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return exportedImages;
}

async function fetchImageBlob(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "force-cache",
      credentials: "include",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Image request returned ${response.status}`);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error("Downloaded image is empty.");
    }

    return blob;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function writeMarkdownToObsidian(config, vaultPath, markdown) {
  return writeFileToObsidian(config, vaultPath, markdown, "text/markdown; charset=utf-8");
}

async function writeBinaryToObsidian(config, vaultPath, blob) {
  return writeFileToObsidian(
    config,
    vaultPath,
    blob,
    blob.type || "application/octet-stream"
  );
}

async function writeFileToObsidian(config, vaultPath, body, contentType) {
  const baseUrl = trimTrailingSlash(config.baseUrl || DEFAULT_CONFIG.baseUrl);
  const encodedPath = vaultPath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `${baseUrl}/vault/${encodedPath}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": contentType
      },
      body,
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Obsidian API returned ${response.status}: ${errorBody || response.statusText}`);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Obsidian API request timed out. Check that Obsidian and Local REST API are running.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function renderMarkdown(extraction, exportedImages) {
  const tags = extraction.tags || [];
  const markdown = [
    "---",
    `source: "${String(extraction.url || "").replace(/"/g, '\\"')}"`,
    `captured: "${String(extraction.capturedAt || new Date().toISOString()).replace(/"/g, '\\"')}"`,
    'platform: "xiaohongshu"'
  ];

  if (tags.length > 0) {
    markdown.push(`tags: [${tags.map((tag) => `"${String(tag).replace(/"/g, '\\"')}"`).join(", ")}]`);
  }

  markdown.push(
    "---",
    "",
    `# ${escapeMarkdownHeading(extraction.title)}`,
    ""
  );

  const imageLines = buildImageMarkdownLines(exportedImages, extraction.images || []);
  if (imageLines.length > 0) {
    markdown.push("## Images", "", ...imageLines, "");
  }

  markdown.push(
    "## Text",
    "",
    extraction.bodyMarkdown || extraction.rawText || "_No body text found._",
    "",
    "## Source",
    "",
    `[Open original note](${extraction.url || ""})`
  );

  return markdown.join("\n");
}

function buildImageMarkdownLines(exportedImages, originalImages) {
  const images = exportedImages.length > 0 ? exportedImages : originalImages;

  return images.map((image, index) => {
    const alt = escapeMarkdownAlt(image.alt || `XHS image ${index + 1}`);

    if (image.localPath) {
      return `![${alt}](<${image.localPath}>)`;
    }

    return `![${alt}](<${image.url}>)`;
  });
}

function buildVaultPath(folder, title) {
  const cleanFolder = (folder || DEFAULT_CONFIG.folder)
    .split("/")
    .map((part) => sanitizePathPart(part))
    .filter(Boolean)
    .join("/");
  const timestamp = formatTimestamp(new Date());
  const filenameTitle = sanitizePathPart(title).slice(0, 80) || "Untitled Xiaohongshu Note";

  return `${cleanFolder}/${timestamp} ${filenameTitle}.md`;
}

function getDirName(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function getBaseName(path) {
  return String(path || "").split("/").filter(Boolean).pop() || "Untitled";
}

function stripMarkdownExtension(filename) {
  return String(filename || "").replace(/\.md$/i, "");
}

function extensionFromImage(url, contentType) {
  const mimeExtension = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp"
  }[String(contentType || "").split(";")[0].toLowerCase()];

  if (mimeExtension) {
    return mimeExtension;
  }

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{3,5})$/i);
    if (match) {
      return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    }
  } catch (_error) {
    // Fall through to the safe default.
  }

  return "jpg";
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + " " + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("-");
}

function sanitizePathPart(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdownHeading(text) {
  return String(text || "").replace(/^#+\s*/, "").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function escapeMarkdownAlt(text) {
  return String(text || "").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\n/g, " ");
}

function hydrateForm(config) {
  baseUrlInput.value = config.baseUrl || DEFAULT_CONFIG.baseUrl;
  apiKeyInput.value = config.apiKey || "";
  folderInput.value = config.folder || DEFAULT_CONFIG.folder;
}

function readFormConfig() {
  return {
    baseUrl: trimTrailingSlash(baseUrlInput.value.trim() || DEFAULT_CONFIG.baseUrl),
    apiKey: apiKeyInput.value.trim(),
    folder: folderInput.value.trim() || DEFAULT_CONFIG.folder
  };
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_CONFIG, (items) => resolve(items));
  });
}

async function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set(config, resolve);
  });
}

function chromeTabsQuery(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs);
    });
  });
}

function chromeTabsSendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function chromeScriptingExecuteScript(details) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(details, (results) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(results);
    });
  });
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function setBusy(isBusy) {
  saveSettingsButton.disabled = isBusy;
  exportNowButton.disabled = isBusy;
}

function setStatus(message, tone) {
  statusNode.textContent = message;
  statusNode.className = ["status", tone].filter(Boolean).join(" ");
}
