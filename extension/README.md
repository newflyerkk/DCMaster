# DC Master 视频填充助手 0.1.1（实验版）

在 Chrome 的 Figma 网页版提取已播放的视频填充，生成 MP4。独立安装，与 DC Master Figma 插件配套使用。Figma 桌面端不加载 Chrome 扩展。

## 安装

1. 解压安装包到固定目录。
2. Chrome 地址栏打开 `chrome://extensions`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本文件所在的 `extension` 文件夹（里面有 manifest.json 和 dist/main.js）。不要选择 Figma 插件的 manifest。
4. 登录 Figma 网页版，打开包含视频填充的文件。已经打开的页面需刷新一次。
5. 播放目标视频。在右下角「DC Master · 视频填充」面板中选择检测到的视频和清晰度。
6. 点击「提取为 MP4」，完成后点击「保存 MP4」。

若未检测到，保持扩展启用，刷新 Figma 页面后重新播放。检测列表按媒体 hash 区分，不自动推断 Figma 当前选中图层或图层名。可以先只播放目标视频以便识别。面板标题可折叠。

## 功能与边界

- 自动检测当前文件的 HLS 视频 manifest（fetch、XHR、已观测资源）。不猜测文件、视频资源地址。
- 最高/较小清晰度，多个资源手动选择，进度、取消，256 MB 输出限制。
- TS（H.264/AAC）本地转封装 MP4，不重新编码；fMP4 与 TS 均重建为带完整索引和明确时长的普通 MP4，保留编码数据，兼容本地播放器。
- 输出为 Figma 播放版本，不保证与最初上传文件相同；不会应用图层裁剪、圆角、蒙版，也不复制 Frame 的其他设计元素。
- 已支持普通完整点播播放列表、相对 URL、字节范围请求。
- 暂不支持独立音轨合并、加密、直播、时间线不连续、编码配置变化、非 H.264/AAC 的 TS；这些情况明确报错，不静默丢弃音轨或只导出部分内容。
- CDN 必须允许页面通过 CORS 读取；若 Figma 的未公开媒体接口变化，需要更新扩展。
- 若视频超过内存限制，可以尝试「较小文件」。

## 访问范围

仅在 `https://www.figma.com/*` 和 `https://figma.com/*` 运行，不申请 cookies、浏览历史、所有网站、下载管理等权限。使用当前页面的同源登录状态，不读取或导出 Cookie，不上传文件到第三方。下载地址来自检测到的 Figma 播放列表；跨域请求不附带页面 Cookie。所有媒体合并在本机内存中完成，离开页面或切换文件后释放结果。

扩展运行于页面 MAIN world，Figma 页面可见同一上下文；只在你信任并有权访问的 Figma 文件中使用。扩展不会修改设计节点。

## 已验证 / 未验证

已验证：本地生成的 3 秒 H.264 + AAC 测试视频，TS 和 fMP4 两类，下载及转换后 ffprobe 确认音轨、视频轨道、尺寸、时长，并通过 ffmpeg 全量解码；对加密、独立音轨、403、超限、取消等失败路径做测试。模拟 Figma 页面执行正式打包脚本的完整 UI 流程。

尚未验证：真实 Figma 登录账号的视频资源下载。当前测试机器的 Chrome 打开文件后停在 Figma 登录页，因此本版为实验版，不能承诺所有 Figma 视频填充可导出。

## 技术参考

- 官方 Video API：https://developers.figma.com/docs/plugins/api/Video/
- HLS 在网页上下文提取方案参考：https://github.com/blackorchidX/figma-video-downloader
- 本项目自行实现资源选择、播放列表验证、下载限制与 UI；TS 封装使用 mux.js：https://github.com/videojs/mux.js
- 第三方许可见 THIRD_PARTY_NOTICES.txt。

## 0.1.1 修复

修复流式 MP4 时长占位值导致 QuickTime 错误显示超长时长与黑屏的问题。使用 Mediabunny 重建索引和轨道时长，保持音视频相对时间关系，不重新编码。增加播放列表时长与实际帧时长一致性检查。

用户提供的实际异常文件已修复：6.95 秒，748×1620，H.264 + AAC；完整解码通过，QuickTime 显示 00:07 且能播放正常画面。原始网络下载流程未重新验证。另已验证 TS/fMP4 模拟浏览器下载、跳转与非黑画面检查。

升级：用本版本文件替换原扩展目录内容，在 chrome://extensions 点击该扩展的重新加载，然后刷新 Figma 网页；面板应显示 0.1.1。

MP4 封装依赖 Mediabunny：https://github.com/Vanilagy/mediabunny
