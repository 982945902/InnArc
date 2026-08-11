# 心镜

面向微信小程序的心理投射与自我觉察工具。产品不预测事件，不给出吉凶、健康、婚姻或财务结论。

## 仓库结构

- `apps/miniapp`：Taro 4 + React + TypeScript 小程序
- `apps/api`：Fastify API，Effect 管理持久化异步任务、错误、依赖与生命周期
- `packages/contracts`：前后端共享接口契约
- `packages/deck`：78 张牌的固定事实数据；抽牌由服务端随机算法完成
- `packages/agent`：Pi Agent 适配层；只允许输出追问、牌阵和解读结构
- `assets/cards`：标准 78 张原创穆夏风卡面、牌背、线上图与缩略图

## 本地运行

```bash
pnpm install
cp .env.example .env
cp apps/miniapp/.env.example apps/miniapp/.env
pnpm dev:api
pnpm dev:weapp
```

默认 `AI_DRIVER=fake`，不需要模型密钥即可走通完整链路。接入真实模型时改为 `AI_DRIVER=pi` 并配置服务商密钥。完整解读使用 `202 taskId` + 轮询，不依赖小程序不支持的 SSE；任务中断后可以继续获取。

开发环境的 API 会在 `/assets/` 提供本地卡图；生产环境不打包卡图，必须把 `assets/cards/webp/` 上传到 HTTPS CDN。运行 `pnpm assets:manifest` 可重新生成 78 张资源摘要，`pnpm preflight` 会逐张校验标准名称、图片 ID 与文件哈希。

完整的状态机、API、Effect/Pi 边界和验收项见 [首个纵向切片](./docs/implementation.md)。

## 合规原则

用户输入和模型输出均需经过内容安全审核；模型仅基于已抽出的卡牌事实提供开放式自我觉察提示。所有页面保留“内容仅供娱乐与自我觉察，不构成任何专业建议”的声明。
