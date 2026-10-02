# AI 週回顧

首頁「我的入口」的「本週回顧」卡片，以及 `/dashboard.html` 總覽最上方的「AI 週回顧」完整版，都由排程把擁有者帳號最近 7 天的瀏覽紀錄交給 AI 模型整理，寫成重點、觀察、值得繼續的線索與一個反問。每則觀察都附上依據段落或頁面，可展開查看。這是本專案唯一會把瀏覽資料送到外部 AI 的功能；[個人洞察](personal-insights.md)的五個面向仍只在伺服器以規則計算。

## 排程與觸發

`deploy/myzilla-digest.timer` 每天 08:00（Asia/Taipei）啟動 `myzilla-digest.service`，執行 `src/digest/job.ts`。`Persistent=true`，主機在 08:00 關機時，開機後補跑。工作先比較 events 的筆數與最後造訪時間；和上一份回顧相同就直接結束，不呼叫模型。有新紀錄才整理，期間為「最後一筆資料往前 7 天」，並非此刻往前 7 天。

```bash
npm run digest               # 與排程相同
npm run digest -- --force    # 忽略「沒有新紀錄」，重新產生回顧
npm run digest -- --days 14  # 自訂期間
journalctl --user -u myzilla-digest.service   # 查看執行紀錄
```

安裝：將兩個 unit 複製到 `~/.config/systemd/user/`，`systemctl --user daemon-reload && systemctl --user enable --now myzilla-digest.timer`。

## 模型與流程

透過 sky-mini 上的中央 AI 閘道（OpenAI 相容的 `/v1/chat/completions`，政策見 `ai-gateway` repo）呼叫。程式只要求語意別名，實際模型由閘道決定：分類用 `sky-fast`，其餘用 `sky-quality`。每次呼叫以 strict JSON Schema 限定輸出格式並指定 `reasoning_effort`，逾時 20 分鐘。Deck 的 `.env` 需要：

```bash
MYZILLA_LLM_BASE_URL=http://100.71.224.62:8318/v1   # sky-mini 本機為 http://127.0.0.1:8317/v1
MYZILLA_LLM_API_KEY=<ai-gateway clients.env 中 myzilla= 的金鑰>
# 選填，預設即為以下別名
# MYZILLA_CLASSIFIER_MODEL=sky-fast
# MYZILLA_INTERPRETER_MODEL=sky-quality
```

兩個變數都必須設定；缺任一個時排程在開啟資料庫前就以錯誤結束，並在紀錄中指出缺少的變數。

每筆分類、段落解讀與回顧都記下「要求的別名→實際回答的模型」（例如 `sky-fast→gpt-6-luna`，取自閘道回應的 `model`），畫面顯示實際模型。

1. **主題分類**（`sky-fast`）：只送尚未分類的頁面，每批 300 頁，含網站、路徑、標題。既有主題名稱放在提示最前面，新頁面盡量沿用。
2. **主題整理**（`sky-quality`）：將新出現的標籤歸入「主題／面向」兩層，既有名稱不改。
3. **段落解讀**（`sky-quality`）：同一裝置、瀏覽器、設定檔，間隔不超過 30 分鐘且至少三個不同頁面的段落，每段寫一句在做什麼、推測目的，並標成完成、沒收尾、閒逛或不明。段落的頁面組合改變時才重新解讀。
4. **週回顧**（`sky-quality`）：只送主題統計、每日前五主題、段落解讀與跨月回訪頁面，不送原始紀錄。輸入和上一份相同時沿用。

頁面篩選與個人洞察共用 `isUtility`：非 HTTP(S)、登入頁、收件匣、平台首頁、空白標題等不參與；網址移除 utm_*、fbclid、gclid、msclkid。引用到不存在的段落或頁面 ID 會被移除，數量記在 `dropped`。模型偶爾混入的常見簡體字，會以固定對照表轉成繁體。

某批沒有完整回覆時，該次資料版本會標記為未完成，下一次排程即使沒有新紀錄也會補做。

快取只依資料判斷，不依模型：「沒有新紀錄」的檢查不含模型；已分類的頁面（以網址）與已解讀的段落（以頁面組合）一律沿用，不會因換模型或換閘道重做；週回顧的輸入雜湊包含要求的別名而非實際模型，所以閘道改了別名的對應也不會重新產生。從 `gpt-6.1-sol` 改成 `sky-quality` 會讓雜湊變一次，但只在有新紀錄時才可能重寫回顧，而有新紀錄時提示本來就會變。想讓新模型重寫本週回顧，執行 `npm run digest -- --force`（只重寫回顧，既有分類與段落解讀照舊）；要整批重新分類需手動清空 `ai_page_topics`／`ai_sessions`。

## 資料與 API

四個資料表都以 account 為鍵，原始 events 不修改：

- `ai_page_topics`：頁面網址 → 原始主題標籤（`model` 欄記「別名→實際模型」，下同）
- `ai_taxonomy`：原始標籤 → 主題、面向
- `ai_sessions`：段落鍵（起始時間 + 頁面組合的雜湊）→ 解讀
- `ai_digests`：每次產生的回顧，含期間、資料版本、輸入雜湊，以及畫面所需的引用內容

`GET /api/digest` 以既有 Bearer 身分回傳該帳號最新一份回顧，尚未產生時為 `{digest:null}`。只讀，不在請求時呼叫模型。SQLite 一致性備份涵蓋這些資料表。

## 範圍與限制

排程只處理擁有者帳號（`owner`）；其他受邀帳號未同意把紀錄送到外部服務，不會被分析。送出的內容包含頁面標題與網址，經 sky-mini 閘道送到其上游的 Codex 訂閱帳號，依該 ChatGPT 帳號的條款處理。

模型只看標題與網址，沒有頁面內文；「在做什麼」「沒收尾」都是推測，畫面標示「只依標題與網址推測」。多分頁與背景開頁會混在同一段落。實測約 1,500 頁、100 段的一週：首次約 15 分鐘，之後每天只處理新增部分，沒有新紀錄時不到 1 秒結束。
