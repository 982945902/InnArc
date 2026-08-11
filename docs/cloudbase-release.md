# CloudBase 发布配置

## 数据集合

在正式环境创建以下集合，并仅允许云托管服务端访问写操作：

| 集合 | 主键策略 | 用途 |
| --- | --- | --- |
| `reflection_session` | 会话 UUID | 问题、追问回答、隐藏牌序、已选卡、完整解读与过期时间 |
| `consent_log` | 匿名用户 ID + 同意版本 | 18+ 与免责声明确认 |
| `safety_event` | 安全事件 UUID | 仅保存内容摘要、规则、类别与处理动作 |
| `safety_feedback` | 反馈 UUID | 用户提交的内容安全反馈 |
| `daily_usage` | 匿名用户 ID + 日期 | 每日完整解读额度，事务递增 |
| `reading_task` | `reading_` + 会话 UUID | 异步解读状态、执行租约与最终结果 |

至少建立 `reflection_session.userId + updatedAt`、`reflection_session.expiresAt`、`reading_task.status + updatedAt`、`safety_event.userId + createdAt`、`safety_feedback.status + receivedAt` 的查询索引。会话代码在 24 小时后拒绝访问；正式环境还需配置平台 TTL 或定时任务删除已过期会话和对应解读任务，不能只依赖应用层拒绝访问。

## 云托管

1. 使用仓库根目录的 `Dockerfile.api` 构建服务 `heart-mirror-api`。
2. 把 `.env.production.example` 中的值作为云托管服务端环境变量填写，密钥不得进入 Taro 包。
3. 健康检查路径设置为 `/health`，端口为 `8787`。
4. 确认云托管向服务传递可信的 `x-wx-openid`、`x-wx-appid` 和平台请求头；生产环境没有这些头会返回未认证。
5. 微信内容安全和所选模型供应商请求需要服务端出网能力。

## 卡面与小程序

把 `assets/cards/webp/` 原样上传到 HTTPS 静态资源根目录，使 `cards/webp/major-00.webp` 等 79 个文件可访问。把域名加入微信小程序 downloadFile 合法域名，并设置 `CARD_ASSET_BASE_URL`。Taro 生产变量参照 `apps/miniapp/.env.production.example`。

正式 AppID 写入 `apps/miniapp/project.config.json` 后，使用真实生产环境变量依次运行：

```bash
pnpm assets:manifest
pnpm check
pnpm test
pnpm build
pnpm release:gate
```
