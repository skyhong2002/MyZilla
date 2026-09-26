# 安裝 MyZilla 瀏覽器擴充功能

如果設定檔的歷史已完成原生匯入，安裝後只需開始記錄新的活動，不要再按「匯入全部歷史」。

## Brave、Chrome、Arc、Dia

1. 下載並解壓縮 [Chromium 版本](https://myzilla.observe.tw/downloads/myzilla-chromium.zip)。
2. 開啟目前瀏覽器的擴充功能管理頁，啟用「開發人員模式」。
3. 選「載入未封裝項目」，指定解壓後含 `manifest.json` 的目錄。
4. 將 MyZilla 固定到工具列並開啟。

每個瀏覽器、每個設定檔需要各安裝一次。需要 Chromium 核心 120 以上。

## Zen、Firefox

1. 下載並解壓縮 [Firefox 版本](https://myzilla.observe.tw/downloads/myzilla-firefox.zip)。
2. 開啟 `about:debugging#/runtime/this-firefox`。
3. 選「暫時載入附加元件」，選取解壓目錄中的 `manifest.json`。
4. 從工具列開啟 MyZilla。

此測試版尚未 Mozilla 簽署，暫時安裝在瀏覽器重啟後需重新載入；先完成同步再關閉。每個設定檔分別安裝，需要 Firefox 核心 140 以上。已在實際 Firefox 與 Zen 1.22.3b Linux 的隔離設定檔驗證擷取、匯入與同步。

## 連線與開始記錄

1. 伺服器填 `https://myzilla.observe.tw`。
2. 填入目前的瀏覽器、設定檔與裝置名稱，方便辨識來源。
3. 貼上存取金鑰，按「儲存並連線」，接受該伺服器的連線授權。
4. 按「開始記錄」。預設暫停，無痕視窗不記錄。

使用部署時設定的存取金鑰；網站回顧頁使用同一金鑰解鎖。

新紀錄先保存於本機，斷線後會等恢復連線再補送。介面顯示待同步筆數，也可按「立即同步」。前景時間從開始記錄後才會累積，過去歷史不會換算成閱讀時長。

如果本機 DNS 尚未更新而無法開啟網域，先確認本機解析狀態；伺服器目前透過 Cloudflare Tunnel 提供 HTTPS。
