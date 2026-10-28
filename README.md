# 荣耀赛事台 · 国服全局 BP

面向班级赛的单机裁判控制台和独立16:9大屏。基于 [qiqi47/HOK_Ban_Pick](https://github.com/qiqi47/HOK_Ban_Pick)（MIT）改造，保留上游Git历史、LICENSE.txt及[原始README](docs/UPSTREAM_README.md)。

## 运行

Windows双击 `start.cmd`，或：

```powershell
wsl -d Ubuntu -- bash /root/Course_THU/HOK-BP/start.sh
```

- 上下分屏工作台：<http://localhost:5173>
- 独立裁判台：<http://localhost:5173/control>
- 大屏：<http://localhost:5173/display>

Windows使用扩展显示，把大屏窗口拖到第二屏。需要使用同一浏览器配置与相同主机名。大屏左下角点击启用声音，然后全屏。

## 已实现

- 国服官方名单快照、分路筛选、搜索、133个条目及本地头像/展示图。
- 自定义赛事名、队名、Logo、选手昵称、比分。
- BO3/BO5/BO7，KPL 2026 的每方 2+3 Ban、先选三个再第二轮 Ban 流程，计时、暂停、撤销。
- 全局英雄消耗绑定队伍；换边、局结果确认、下一局、BO7 战成 3:3 后自动巅峰盲选及同时揭晓。
- 浏览器自动存档、JSON导入导出、非法记录校验、控制台互斥。
- 133条目均配置官方大厅/登场语音，资源共387条；角色共享映射明确记录。
- 内置 **Know My Name · 社区伴奏版（Nelshare）**，212.4秒，非官方分轨版。
- 阶段曲库、本地音频导入、打乱轮播、语音队列、BGM保持设定音量、紧急静音、单窗口发声。

目前是单机同浏览器同步，不能通过不同电脑远程共同控制。需要用户手动点击一次以解锁浏览器声音。音频导入保存在浏览器媒体库，不包含在比赛JSON中。

## 文档与验证

- [使用指南](docs/USER_GUIDE.md)
- [资源来源、语音接口及音乐版本](docs/RESOURCES.md)
- [实施和验收记录](IMPLEMENTATION.md)

```bash
cd vite-project
npm ci
npm run build
npm test
npm run test:e2e
npm run verify:assets
```

Node.js需20.19+或22.12+。浏览器验收默认使用当前WSL的Chromium，可通过CHROME_PATH覆盖。启动脚本会按需安装依赖并构建；源码和资源均在本地，安装完成后办赛不需要访问素材服务器。

更新国服资料：`python3 scripts/sync-assets.py`，随后重新构建。数据核对时间和覆盖率保存在 `vite-project/public/data/`。完整来源与文件哈希可追溯。

代码遵循MIT许可；腾讯英雄图像/语音及Riot音乐不因代码开源而成为MIT素材。
