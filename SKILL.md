# 学情采集技能包 (xiaoshu-xueqing)

将一个互动 HTML 课件快速升级为支持课堂实时学情统计的完整部署方案。
零外部依赖，仅需 Node.js。

## 触发条件
用户提供一个互动 HTML 课件文件，要求添加课堂实时学情统计功能。

## 输入
- 用户指定的互动 HTML 文件路径（必须）
- （可选）知识点名称列表，用于看板图表
- （可选）雷达图六维名称
- （可选）自评题目（quiz 配置）

## 执行步骤

### 1. 定位与准备
- 确认用户 HTML 文件路径，读取文件内容
- 确认文件所在目录（后续所有产物放在同目录）

### 2. 生成项目文件
从 `assets/` 目录复制以下文件到用户 HTML 所在目录：
- `xiaoshu-client.js` → 学生端注入脚本
- `xiaoshu-server.js` → Node.js 服务器（零依赖）
- `teacher.html` → 教师端实时看板
- `启动局域网课堂.bat` → Windows 一键启动
- `start-classroom.sh` → Linux/Mac 一键启动

### 3. 注入学生端脚本 + 配置
在用户 HTML 的 `</body>` 前插入：
`html
<script src="xiaoshu-client.js"></script>
`
在 `<head>` 末尾或 `<body>` 开头插入配置：
`html
<script>
Xiaoshu.config({
  knowledgePoints: ['知识点A', '知识点B'],
  quiz: {
    title: '本课掌握度自评',
    question: '一道判断/理解题，学生选择掌握程度',
    levels: ['已掌握', '基本理解', '还需复习'],
  },
});
</script>
`

### 4. 添加行为埋点（关键步骤）
分析用户 HTML 的交互逻辑，在以下位置插入 `Xiaoshu.report()` 调用：

| 场景 | 调用 | 示例位置 |
|------|------|----------|
| 学生点击"提示" | `Xiaoshu.report('hint', { kp: '条件判断' })` | 提示按钮 click 回调 |
| 学生点击"答案" | `Xiaoshu.report('answer', { kp: '条件判断' })` | 答案按钮 click 回调 |
| 验证/判分失败 | `Xiaoshu.report('error', { task: 'ch1', kp: '条件判断' })` | 判分函数 fail 分支 |
| 完成一章/一关 | `Xiaoshu.report('complete', { task: 'ch1' })` | 通关回调 |
| 章节进度更新 | `Xiaoshu.report('progress', { current: 2, total: 3 })` | 章节切换时 |
| 进入某章开始 | `Xiaoshu.report('chapter_start', { task: 'ch1' })` | 章节进入时 |
| 课件特定数值 | `Xiaoshu.report('custom', { key: 'final_orp', value: 680 })` | 计算结果产出时 |

埋点原则：
- 只在用户 HTML 已有的交互逻辑中插入，不改变原有行为
- 每个 `Xiaoshu.report()` 调用不超过 1 行
- 如果 HTML 中找不到明确的交互点（如纯展示页），只注入 client 脚本，跳过埋点
- quiz 面板由 client 自动插入，无需手动加 HTML

### 5. 输出使用说明
向用户说明：
- 启动方式：双击 `启动局域网课堂.bat`（Windows）
- 教师端：自动打开看板，或手动访问 `http://localhost:8080/teacher.html`
- 学生端：看板顶部显示的学生地址，学生连同一 Wi-Fi 打开即可
- 数据仅在教师电脑内存中，重启即清空
- 下课前可点「导出 CSV」保存数据
- 只作教学参考，不作为学生评价依据

## 数据模型

### 学生快照（每 3 秒上报）
`json
{
  "id": "stu-abc123",
  "name": "张三",
  "ts": 1700000000,
  "counters": { "hints": 1, "answers": 0, "errors": 2, "completions": 1, "interactions": 15 },
  "progress": { "current": 1, "total": 3 },
  "timings": { "ch1_start": 1700000000, "ch1_end": 1700000120 },
  "self_assessment": null,
  "quiz_result": { "level": "mastered", "label": "已掌握" },
  "page_load": 1700000000,
  "custom": { "final_orp": 680, "final_ratio": "1:1000" },
  "event_log": [{ "e": "progress", "d": { "current": 1 }, "ts": 1700000010 }],
  "activity": { "last_active": 1700000010, "active_ratio": 0.85, "idle_secs": 0 }
}
`

### 生命周期
- 学生 POST 首次到达 → 创建记录，在线
- 12 秒无上报 → 标记离线
- 60 秒无上报 → 从列表移除
- 教师点「清堂重置」→ 全部清空
- 服务重启 → 全部清空

### 评分公式
`
独立度 = max(0, 1 - (提示×1 + 答案×2.5) / 6)
准确度 = max(0, 1 - 失败 / (失败 + 3))
推进度 = 完成数 / 总数

综合评分 = 独立度×30 + 准确度×25 + 推进度×20 + 推进度×15 + 自主×10
（百分制，未开始学习的学生不计入班级均分）
`

## 文件说明

| 文件 | 作用 | 修改频率 |
|------|------|----------|
| `xiaoshu-client.js` | 学生端注入，自动检测课堂模式，上报数据，quiz 面板 | 低 |
| `xiaoshu-server.js` | 静态文件服务 + 学情 API，内存存储 | 低 |
| `teacher.html` | 教师端看板，轮询渲染 | 低 |
| `启动局域网课堂.bat` | Windows 一键启动 | 低 |
| `start-classroom.sh` | Linux/Mac 一键启动 | 低 |
| 用户的 HTML | 课件本体 + 注入的 client 脚本 + report 埋点 | 高 |
