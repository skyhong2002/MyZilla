# Infovore 整合評估

依 Mac 端提供的現況，Infovore `/api/ingest/events` 接收的是 calendar events（上限 50），另有 Dayflow days 和 health-connect。把瀏覽紀錄偽裝成行事曆事件會破壞事件語意，也會不必要地擴散原始網址。

建議新增獨立的、需要身分驗證的 MyZilla summary source，經使用者選擇後提供日期、造訪次數、網站數、估計前景時間等彙總。必須明定時區、區間、跨裝置加總規則，以及歷史匯入沒有閱讀時長。網址、標題、搜尋詞與原始事件維持在 MyZilla。

現有 `/api/report?from=...&to=...` 可作為私人查詢基礎，但包含 domain 細節，不應直接發布到 Infovore 公開時間線。正式串接時應有獨立唯讀摘要金鑰，並設計只包含使用者選擇欄位的 endpoint；現有完整讀寫金鑰不宜交給公開呈現端。此輪只完成設計評估，未修改或傳送資料至 Infovore。
