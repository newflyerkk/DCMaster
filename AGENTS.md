# DCMaster 维护规则

本仓库仅管理 DCMaster，勿合入另一个产品的源码或发布包。每次更新须完成相关检查、更新说明并提交推送至 https://github.com/newflyerkk/DCMaster，安装包发布至本仓库 Releases。禁止上传凭据、用户素材或构建缓存，不强制推送。

用户要求每次更新同时更新 Figma 已导入的本地插件。运行 npm run build 会读取未入库的 .local-deploy.json，自动更新目标目录的 manifest.json、dist/code.js 和 dist/ui.html。每次更新必须确认本地部署成功，再同步 GitHub。不要改变目标插件 ID 或要求用户重新导入。
