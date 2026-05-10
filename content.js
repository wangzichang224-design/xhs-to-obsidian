(() => {
  if (window.__xhsToObsidianInstalled) {
    return;
  }

  window.__xhsToObsidianInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "XHS_EXTRACT_MARKDOWN") {
      return undefined;
    }

    try {
      sendResponse({
        ok: true,
        data: extractCurrentNote()
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return true;
  });

  function extractCurrentNote() {
    const titleNode = findTitleNode();
    const title = normalizeText(titleNode ? visibleText(titleNode) : findTitle()) || "Untitled Xiaohongshu Note";
    const body = findBodyMarkdown();
    const tags = findTags(body.rawText);
    const images = findNoteImages(titleNode, title);
    const capturedAt = new Date().toISOString();
    const markdown = renderMarkdown({
      title,
      bodyMarkdown: body.markdown,
      tags,
      images,
      capturedAt
    });

    return {
      title,
      bodyMarkdown: body.markdown,
      markdown,
      rawText: body.rawText,
      tags,
      images,
      url: location.href,
      capturedAt
    };
  }

  function renderMarkdown({ title, bodyMarkdown, tags, images, capturedAt }) {
    const markdown = [
      "---",
      `source: "${location.href.replace(/"/g, '\\"')}"`,
      `captured: "${capturedAt}"`,
      'platform: "xiaohongshu"'
    ];

    if (tags.length > 0) {
      markdown.push(`tags: [${tags.map((tag) => `"${tag.replace(/"/g, '\\"')}"`).join(", ")}]`);
    }

    markdown.push(
      "---",
      "",
      `# ${escapeMarkdownHeading(title)}`,
      ""
    );

    if (images.length > 0) {
      markdown.push("## Images", "");
      images.forEach((image, index) => {
        markdown.push(`![XHS image ${index + 1}](<${image.url}>)`, "");
      });
    }

    markdown.push(
      "## Text",
      "",
      bodyMarkdown || "_No body text found._",
      "",
      "## Source",
      "",
      `[Open original note](${location.href})`
    );

    return markdown.join("\n");
  }

  function findTitleNode() {
    return Array.from(document.querySelectorAll("h1"))
      .find((node) => visibleText(node));
  }

  function findTitle() {
    const visibleH1 = Array.from(document.querySelectorAll("h1"))
      .map((node) => visibleText(node))
      .find(Boolean);

    if (visibleH1) {
      return visibleH1;
    }

    const ogTitle = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]')?.content;
    if (ogTitle) {
      return ogTitle;
    }

    return document.title
      .replace(/\s*[-_]\s*小红书\s*$/i, "")
      .replace(/\s*-\s*你的生活指南\s*$/i, "");
  }

  function findBodyMarkdown() {
    const selectorGroups = [
      "#detail-desc",
      ".note-content",
      ".note-text",
      "[class*='note-text']",
      "[class*='noteText']",
      "[class*='note-content']",
      "[class*='desc']",
      "article",
      "main"
    ];

    const candidates = [];

    selectorGroups.forEach((selector, index) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (!isVisible(node)) {
          return;
        }

        const rawText = normalizeLines(visibleText(node));
        if (!rawText) {
          return;
        }

        candidates.push({
          node,
          rawText,
          score: scoreCandidate(rawText, index)
        });
      });
    });

    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best) {
      const rawText = normalizeLines(document.body?.innerText || "");
      return {
        rawText,
        markdown: textToMarkdown(rawText)
      };
    }

    return {
      rawText: best.rawText,
      markdown: textToMarkdown(best.rawText)
    };
  }

  function findNoteImages(titleNode, title) {
    const root = findNoteRoot(titleNode) || document;
    const candidates = [];

    root.querySelectorAll("img").forEach((image) => {
      const url = pickImageUrl(image);
      if (!url) {
        return;
      }

      const rect = image.getBoundingClientRect();
      candidates.push({
        url,
        alt: normalizeText(image.alt) || title,
        width: Math.round(rect.width || image.naturalWidth || 0),
        height: Math.round(rect.height || image.naturalHeight || 0),
        naturalWidth: image.naturalWidth || 0,
        naturalHeight: image.naturalHeight || 0,
        score: scoreImageCandidate(image, rect),
        element: image
      });
    });

    root.querySelectorAll("[style*='background-image']").forEach((element) => {
      const rect = element.getBoundingClientRect();
      parseBackgroundImageUrls(getComputedStyle(element).backgroundImage).forEach((url) => {
        candidates.push({
          url,
          alt: title,
          width: Math.round(rect.width || 0),
          height: Math.round(rect.height || 0),
          naturalWidth: 0,
          naturalHeight: 0,
          score: scoreImageCandidate(element, rect),
          element
        });
      });
    });

    const seen = new Set();
    return candidates
      .filter(isUsefulNoteImage)
      .sort((a, b) => b.score - a.score)
      .filter((candidate) => {
        const key = imageDedupeKey(candidate.url);
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .sort((a, b) => documentPosition(a.element, b.element))
      .slice(0, 12)
      .map(({ url, alt, width, height, naturalWidth, naturalHeight }) => ({
        url,
        alt,
        width,
        height,
        naturalWidth,
        naturalHeight
      }));
  }

  function findNoteRoot(titleNode) {
    if (titleNode) {
      let current = titleNode.parentElement;

      while (current && current !== document.body) {
        if (hasLargeImage(current)) {
          return current;
        }

        current = current.parentElement;
      }
    }

    const selectors = [
      "[role='dialog']",
      ".note-detail-container",
      ".note-detail",
      ".note-container",
      ".feed-detail",
      ".modal"
    ];

    return selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .find((node) => isVisible(node) && hasLargeImage(node));
  }

  function hasLargeImage(root) {
    return Array.from(root.querySelectorAll("img")).some((image) => {
      const rect = image.getBoundingClientRect();
      return isUsefulImageSize(rect, image.naturalWidth, image.naturalHeight);
    });
  }

  function pickImageUrl(image) {
    const fromCurrent = image.currentSrc || image.src;
    if (isHttpUrl(fromCurrent)) {
      return new URL(fromCurrent, location.href).href;
    }

    const dataAttrs = ["data-src", "data-original", "data-lazy-src", "data-url"];
    for (const attr of dataAttrs) {
      const value = image.getAttribute(attr);
      if (isHttpUrl(value)) {
        return new URL(value, location.href).href;
      }
    }

    const srcset = image.getAttribute("srcset") || "";
    const fromSrcset = pickLargestSrcsetUrl(srcset);
    if (fromSrcset) {
      return new URL(fromSrcset, location.href).href;
    }

    return "";
  }

  function pickLargestSrcsetUrl(srcset) {
    return srcset
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [url, descriptor = ""] = item.split(/\s+/);
        const size = Number.parseFloat(descriptor.replace(/[^\d.]/g, "")) || 0;
        return { url, size };
      })
      .filter((item) => isHttpUrl(item.url))
      .sort((a, b) => b.size - a.size)[0]?.url || "";
  }

  function parseBackgroundImageUrls(backgroundImage) {
    const urls = [];
    const pattern = /url\((['"]?)(.*?)\1\)/g;
    let match = pattern.exec(backgroundImage);

    while (match) {
      const url = match[2];
      if (isHttpUrl(url)) {
        urls.push(new URL(url, location.href).href);
      }

      match = pattern.exec(backgroundImage);
    }

    return urls;
  }

  function isUsefulNoteImage(candidate) {
    const url = candidate.url.toLowerCase();

    if (!isHttpUrl(candidate.url)) {
      return false;
    }

    if (/\.(svg)(\?|#|$)/i.test(url)) {
      return false;
    }

    if (/avatar|icon|emoji|sticker|logo|profile|comment|user/i.test(url)) {
      return false;
    }

    return isUsefulImageSize(
      { width: candidate.width, height: candidate.height },
      candidate.naturalWidth,
      candidate.naturalHeight
    );
  }

  function isUsefulImageSize(rect, naturalWidth, naturalHeight) {
    const visibleWidth = rect.width || 0;
    const visibleHeight = rect.height || 0;

    if (visibleWidth >= 180 && visibleHeight >= 180) {
      return true;
    }

    if (visibleWidth > 0 || visibleHeight > 0) {
      return false;
    }

    return naturalWidth >= 500 && naturalHeight >= 500;
  }

  function scoreImageCandidate(element, rect) {
    const area = Math.round((rect.width || 0) * (rect.height || 0));
    const viewportBonus = rect.left < window.innerWidth * 0.72 ? 5000 : 0;
    const classPenalty = /avatar|icon|emoji|sticker|logo/i.test(element.className || "") ? 100000 : 0;

    return area + viewportBonus - classPenalty;
  }

  function imageDedupeKey(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch (_error) {
      return url;
    }
  }

  function documentPosition(a, b) {
    if (a === b) {
      return 0;
    }

    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1;
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function scoreCandidate(text, selectorIndex) {
    const length = text.length;
    const usefulLength = Math.min(length, 2000);
    const selectorBonus = (10 - selectorIndex) * 80;
    const tooLargePenalty = length > 5000 ? 1200 : 0;
    const navigationPenalty = /首页|消息|购物|发布|登录|搜索/.test(text.slice(0, 120)) ? 300 : 0;

    return usefulLength + selectorBonus - tooLargePenalty - navigationPenalty;
  }

  function textToMarkdown(text) {
    const lines = normalizeLines(text)
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, allLines) => line || allLines[index - 1]);

    return lines
      .map((line) => {
        if (/^#\S/.test(line)) {
          return line;
        }

        return line.replace(/\u00a0/g, " ");
      })
      .join("\n");
  }

  function findTags(text) {
    const tags = new Set();
    const matches = text.match(/#[\p{L}\p{N}_\-\u4e00-\u9fa5]+/gu) || [];

    matches.forEach((match) => {
      tags.add(match.replace(/^#/, ""));
    });

    return Array.from(tags).slice(0, 20);
  }

  function visibleText(node) {
    if (!node) {
      return "";
    }

    return normalizeText(node.innerText || node.textContent || "");
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeLines(text) {
    return normalizeText(text)
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, lines) => line || lines[index - 1])
      .join("\n");
  }

  function escapeMarkdownHeading(text) {
    return String(text || "").replace(/^#+\s*/, "").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  }

  function isVisible(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();

    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
  }
})();
