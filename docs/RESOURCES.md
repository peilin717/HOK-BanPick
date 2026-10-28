# 国服英雄与音频来源

核对日期：2026-10-28（Asia/Shanghai）。同步实际时间、HTTP Last-Modified、文件哈希与缺失情况保存在 `vite-project/public/data/heroes.json` / `coverage.json`。

## 英雄名单

官方国服列表：<https://pvp.qq.com/web201605/js/herolist.json>

本次接口返回 **133 个条目**（包含元流之子不同职业以及心魔六耳等官方条目，不能等同于133个独立角色）。新条目包括王维138（接口日期2026.09.23）、卢雅那547（2026.08.06）、元流之子刺客583（2026.04.01）、大禹188（2026.01.08）。

字段 `ename` 是国服英雄ID，`cname` 中文名称，`id_name` 拼音，`roles` 为官方分路字符串，`time` 为接口提供的上线日期。名单按官方返回值保存，不将国际服英雄列表混入国服。官方分路元数据可能与玩家常识不同，原始值保留于 `roleIds`，不靠猜测静默更正。

头像来源模式：`https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg`

展示图片优先采用默认皮肤语音记录中的竖版 `pffmtm_8153`；缺少时使用官网默认皮肤大图：`https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-1.jpg`。

## 最新语音接口

- 官方语音页面：<https://pvp.qq.com/ip/voice.html>
- 官网调用定义：<https://game.gtimg.cn/images/yxzj/ip/js/common.js>
- 当前接口：`https://pvp.qq.com/zlkdatasys/yuzhouzhan/herovoice/{id}.json`
- 示例：<https://pvp.qq.com/zlkdatasys/yuzhouzhan/herovoice/138.json>，王维语音资源路径日期为20260917。

`dqpfyy_5403` 可以是对象或数组；每组是皮肤/形象，`pfmczt_7754` 是名称，`yylbzt_9132` 是语音列表。每条包含：

| 字段 | 含义 |
|---|---|
| `yygn_8632` | 官方用途标签，如大厅语音1、大厅出现、移动语音、死亡语音 |
| `yywbzt_1517` | 台词文本 |
| `yywjzt_5304` | 官方CDN音频URL，常为MP3，部分为WAV |

同步仅选择默认皮肤中带“大厅”“选取”“登场”用途标签的前3条，不将死亡、技能、受击语音作为默认锁定音。**这些是官方大厅/登场语音，不宣称逐条等于KPL导播选取专用版本。**

元流之子的特殊情况：官网世界观角色列表 <https://pvp.qq.com/zlkdatasys/yuzhouzhan/list/heroList.json> 将其作为角色581，职业列同时列出法师/射手/辅助/刺客/坦克/战士；其余职业ID582/583/584/585的独立语音接口返回404。因此这些职业映射到官方角色581的通用大厅语音（含男/女声），在每条英雄的 `voiceHeroId` 和 `voiceSharedReason` 中明确记录。各职业头像、大图仍保留自己的英雄ID。

资源文件保存在 `vite-project/public/media/heroes/`，运行中不依赖腾讯网络。原始名单及语音JSON保留于 `public/data/`，方便后续对照升级。运行 `python3 scripts/sync-assets.py` 刷新名单和语音元数据；`--refresh-media` 强制重新获取素材。

输出格式：`{ schemaVersion, updatedAt, sources, coverage, heroes }`。每个hero包含 `{id,name,pinyin,roles,roleIds,portrait,splash,voice,voiceText,voiceOptions,voiceAvailable,voiceHeroId,voiceSharedReason,sources,errors}`。`voice` 为本地URL或null；`voiceOptions`含本地URL、官方源URL、台词、标签、皮肤、字节数、SHA256。

## 指定 BGM：Know My Name（伴奏）

已确认用户指定的作品确实是 **True Damage 的2026英雄联盟全球总决赛主题曲《Know My Name》**：

- Riot官方公告：<https://lolesports.com/en-SG/news/worlds-anthem-presented-by-true-damage>
- Riot发行聚合入口：<https://truedamage.ffm.to/knowmyname>
- 官方SoundCloud预告：<https://soundcloud.com/leagueoflegends/know-my-name-instrumental-teaser>
- **官方伴奏/分轨活动入口：<https://soundcloud.com/n/pages/true-damage-remix>**（该链接来自上面的官方SoundCloud曲目描述）

2026-10-28检查：SoundCloud预告页面的曲目元数据时长为30秒且 `downloadable:false`，不能将它冒充完整版伴奏。官方活动页写明提供 instrumental 和 stems，但需要SoundCloud Artist Pro，提供30天试用代码KNOWMYNAME26。未登录、未订阅、未下载该资源包，也未使用页面内嵌地址绕过订阅流程。

### 已接入的完整版伴奏

用户进一步授权直接下载后，采用公开社区上传的完整伴奏：<https://www.youtube.com/watch?v=ej8lhd-wpEo>，上传者 **Nelshare**，上传日期2026-10-09，标题为 `Know My Name (ft. True Damage) - 2026 Worlds Song : Instrumental Version`。上传说明指向Riot官方原曲 <https://www.youtube.com/watch?v=mlFxxNsExJc>。

正常匿名访问获取音轨并转码为浏览器兼容MP3，没有登录、订阅、破解DRM或绕过挑战。成品：`public/media/bgm/know-my-name-instrumental.mp3`；元数据：`public/data/bgm.json`。ffprobe确认 **212.4秒、48000Hz、双声道、192kbps MP3**，ffmpeg完整解码通过。SHA256：`6fe0b90a8943caf2b1f926944c7472f8224f857762eb8f73b93cf6405aac77b5`。

界面应显示 **Know My Name · 社区伴奏版（Nelshare）**，不能标成官方原版分轨。上传者标注为Instrumental；未独立验证其人声分离方法，也未通过人工全曲试听确认残留人声情况。官方Artist Pro资源包仍未获取。素材同步脚本只更新英雄数据，不覆盖此BGM。

开源代码许可不涵盖腾讯英雄图像、语音或Riot音乐；素材原始权利归相应权利方。该记录是素材溯源与版本说明，不将官方公开访问等同于开放素材许可。
