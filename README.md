# 学情课堂工具包 (XiaoShu XueQing)

> 把任意互动 HTML 课件变成支持课堂实时学情统计的完整部署方案。
> 零外部依赖，仅需 Node.js，数据仅存本地。

## 这是什么

一个 19KB 的轻量工具包。你的 HTML 互动课件丢进来，加两行代码，双击启动脚本，全班学情数据就实时呈现在教师端看板里。

- **学生端**：手机浏览器打开链接，输姓名入班，正常操作课件，底部多了个掌握度自评面板，数据每 3 秒自动上报，学生无感知
- **教师端**：实时看板显示在线人数、综合评分、达标率、交互次数、ORP 分布、六维雷达图、事件流、学情结论，下课一键导出 CSV

## 核心特性

- 零外部依赖：不用 WebSocket、不用 Chart.js、不用 npm，只用 Node.js 内置模块
- 数据仅存教师电脑内存，重启即清空，不上传任何外部服务器
- 支持 Windows / Mac / Linux
- 评分公式：独立度 + 准确度 + 推进度 + 参与度 + 自主性

## 文件说明

| 文件 | 作用 |
|------|------|
| `xiaoshu-client.js` | 学生端注入脚本（活跃度追踪 + quiz 面板 + 数据上报） |
| `xiaoshu-server.js` | 零依赖 Node.js 服务器（静态文件 + 学情 API + CSV 导出） |
| `teacher.html` | 教师端实时看板（10 卡片 + 表格 + 分布图 + 雷达 + 排行 + 结论） |
| `启动局域网课堂.bat` | Windows 一键启动（自动找便携版/系统 Node.js） |
| `start-classroom.sh` | Linux/Mac 一键启动 |
| `docs/安装流程说明.md` | 给使用者的 5 步操作手册（含 Node.js 安装） |

## 快速开始

### 1. 安装 Node.js（只需一次）

安装版：https://nodejs.org/ 下载 LTS 版，双击 .msi 一路下一步

便携版：https://nodejs.org/dist/latest-v22.x.x/ 下载 zip，解压改名为 `node`，放到本目录

### 2. 部署你的课件

把你的 HTML 课件文件放到这个文件夹里，在 `</body>` 前加两行：

```html
<script src="xiaoshu-client.js"></script>
<script>
Xiaoshu.config({
  knowledgePoints: ['知识点A', '知识点B'],
  quiz: {
    title: '本课掌握度自评',
    question: '一道适合本课的判断题',
    levels: ['已掌握', '基本理解', '还需复习'],
  },
});
</script>
```

### 3. 启动课堂服务

Windows：双击 `启动局域网课堂.bat`

Linux/Mac：`./start-classroom.sh`

### 4. 学生入班

学生手机连同一 Wi-Fi，打开看板顶部显示的学生端地址，输姓名进班

### 5. 下课保存

教师端点「导出 CSV」保存数据

## 行为埋点

在课件交互按钮中插入 `Xiaoshu.report()` 调用：

```javascript
// 学生点「提示」
Xiaoshu.report('hint', { kp: '知识点A' });

// 学生点「答案」
Xiaoshu.report('answer', { kp: '知识点A' });

// 验证失败
Xiaoshu.report('error', { task: 'ch1', kp: '知识点A' });

// 完成一章
Xiaoshu.report('complete', { task: 'ch1' });

// 章节进度
Xiaoshu.report('progress', { current: 1, total: 3 });

// 记录课件特定数值
Xiaoshu.report('custom', { key: 'final_orp', value: 680 });
```

## 评分公式

```
独立度 = max(0, 1 - (提示×1 + 答案×2.5) / 6)
准确度 = max(0, 1 - 失败 / (失败 + 3))
推进度 = 完成数 / 总数

综合评分 = 独立度×30 + 准确度×25 + 推进度×20 + 推进度×15 + 自主×10
```

## 数据模型

学生快照每 3 秒上报：

```json
{
  "id": "stu-abc",
  "name": "张三",
  "counters": { "hints":1, "answers":0, "errors":2, "completions":1, "interactions":15 },
  "progress": { "current":1, "total":4 },
  "timings": { "peak_start":1700000, "peak_end":1700012 },
  "quiz_result": { "level":"mastered", "label":"已掌握" },
  "custom": { "final_orp":680, "final_ratio":"1:1000" },
  "event_log": [{ "e":"progress", "d":{"current":1}, "ts":1700001 }],
  "activity": { "last_active":1700010, "active_ratio":0.85, "idle_secs":0 }
}
```

## 生命周期

- 学生 POST 首次到达 → 创建记录，在线
- 12 秒无上报 → 标记离线
- 60 秒无上报 → 从列表移除
- 教师点「清堂重置」→ 全部清空
- 服务重启 → 全部清空

## 常见问题

| 问题 | 解决 |
|------|------|
| 学生端连不上 | 检查防火墙是否允许专用网络；确认师生在同一 Wi-Fi 网段 |
| 端口被占用 | bat 自动顺延到 8081/8082，看板顶部显示实际地址 |
| 看板显示「等待学生接入」 | 学生还没打开课件，或学生端用的是 file:// 协议（必须用 http://） |
| 换了一台教室电脑 | 把整个文件夹拷过去，Node.js 也要装（或带便携版 node 文件夹） |

## 使用约定

- 仅作教学参考，不作为学生评价依据
- 数据仅在教师电脑内存中，重启即清空
- 不上传任何外部服务器

## License

MIT
