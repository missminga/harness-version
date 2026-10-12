# Human Harness 快乐路径

交互式可视化：[MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code) 里 `packages/agent-core-v2/src/human` 的四层状态机，**只走 happy path**。

用户提交一条 prompt 之后：

1. `input.submit` 进入 Agent 队列
2. `commitPendingToHistory`，进入 `running`，spawn id 为 `turn` 的 Turn
3. `gating` → `thinking`（`step.started`，`llmActor` 装配上下文）
4. `llm.done` 带 `toolCalls` → `acting`，发出 `turn.spawn_tools`
5. Agent `spawnTurnTools`；Tool `preparing`（交互式允许，`proceed`）→ `executing` → `finishing` → `tool.done`
6. outcomes 到齐 → `draining`；`turn.drain` 后 Agent 回 `turn.notify`（本例 notifications 与 reminders 都空）→ 回到 `gating` 或结束
7. 另一条路径：`llm.done` 没有工具 → 直接 `done`，跳过 `acting` / `draining`

不包含 abort、pause、retry / recovery、maxSteps 失败、用户中断、steer 回注。

静态站点，没有后端。Vite 的 `base` 是 `./`，资源用相对路径，对应项目页 [https://missminga.github.io/harness-vision/](https://missminga.github.io/harness-vision/)。仓库是 [missminga/harness-vision](https://github.com/missminga/harness-vision)。推送到 `main` 后，`.github/workflows/pages.yml` 会构建 `dist/` 并部署到 GitHub Pages。

## 脚本

```bash
npm install
npm run dev       # 本地预览
npm test          # 核对快乐路径与 token 估算
npm run build     # 类型检查 + 静态构建
npm run preview   # 预览 dist/
```

界面可以播放、单步、重置，点击节点看说明，右侧看事件 payload，并用会话 / Agent / Turn / Tool 高亮某一层。空格播放，左右方向键单步。

对照源码：

- `packages/agent-core-v2/src/human/session/machine.ts`
- `packages/agent-core-v2/src/human/agent/machine.ts`
- `packages/agent-core-v2/src/human/agent/turn.ts`
- `packages/agent-core-v2/src/human/tool/machine.ts`

上下文 token 估算与 `agent/context-usage.ts` 一致：ASCII 四个字符一个 token，非 ASCII 一个字符一个 token；还没有带 usage 的 assistant 时计入 system prompt 和 tools JSON，否则以最近一条非零 usage 为锚。

---

# Human harness happy path

An interactive view of the four state machines under `packages/agent-core-v2/src/human` in [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code). **Happy path only.**

After a prompt is submitted:

1. `input.submit` appends to the agent queue
2. `commitPendingToHistory` enters `running` and spawns a turn actor whose id is `turn`
3. `gating` → `thinking` (`step.started`, `llmActor` assembles context)
4. `llm.done` with `toolCalls` → `acting` and `turn.spawn_tools`
5. The agent runs `spawnTurnTools`. The tool goes `preparing` (interactive allow is `proceed`) → `executing` → `finishing` → `tool.done`
6. When every outcome is in, the turn enters `draining`. `turn.drain` makes the agent reply with `turn.notify` (notifications and reminders are empty here) and the turn returns to `gating` or finishes
7. The other path: `llm.done` with no tools goes straight to `done`, skipping `acting` / `draining`

Abort, pause, retry / recovery, maxSteps failure, user interrupt, and steer re-injection are not on this diagram.

The site is static. Vite `base` is `./`, so asset URLs stay relative and load at [https://missminga.github.io/harness-vision/](https://missminga.github.io/harness-vision/). The repository is [missminga/harness-vision](https://github.com/missminga/harness-vision). A push to `main` runs `.github/workflows/pages.yml`, which builds `dist/` and deploys GitHub Pages.

## Scripts

```bash
npm install
npm run dev       # local preview
npm test          # happy-path and token-estimate checks
npm run build     # typecheck and static build
npm run preview   # serve dist/
```

Play, step, and reset the trace. Click a node for its description, read event payloads in the side panel, and highlight the Session, Agent, Turn, or Tool layer. Space plays; arrow keys step.

Source of the model:

- `packages/agent-core-v2/src/human/session/machine.ts`
- `packages/agent-core-v2/src/human/agent/machine.ts`
- `packages/agent-core-v2/src/human/agent/turn.ts`
- `packages/agent-core-v2/src/human/tool/machine.ts`

Token estimates follow `agent/context-usage.ts`: one token per four ASCII characters, one token per non-ASCII character. Before any assistant usage exists, the system prompt and the tools JSON are included. After that, the latest non-zero usage is the anchor and only later messages are estimated.
