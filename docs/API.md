# API使用说明
完整字段、参数、响应模型见 [openapi.json](openapi.json)，可在Apifox选择「导入→OpenAPI」直接导入。默认地址：http://127.0.0.1:4173。
## 认证与通用约定
登录/注册成功响应为 `{"data":{"user":{...},"csrf":"..."}}`，同时设置HttpOnly Cookie。工具需启用Cookie管理，后续写请求加 `X-CSRF-Token: <csrf>`。注册、登录不要求CSRF。Cookie过期24小时或退出后返回401。
成功统一 `{"data":...}`；失败如 `{"code":400,"message":"请检查填写内容","field_errors":{"title":"请填写2—30字"}}`。写请求使用Content-Type: application/json；无参数写接口可发送 {}。
## 接口表
| 方法 | 路径 | 功能 | 登录 |
| --- | --- | --- | --- |
| GET | /api/health | 健康检查 | 否 |
| GET | /api/campuses | 校区字典 | 否 |
| POST | /api/auth/login | 登录 | 否 |
| POST | /api/auth/register | 注册并登录 | 否 |
| GET | /api/auth/me | 当前用户 | 是 |
| POST | /api/auth/logout | 退出 | 是 |
| GET | /api/posts | 公开搜索分页 | 否 |
| GET | /api/me/posts | 我的帖子 | 是 |
| POST | /api/posts | 发布帖子 | 是 |
| GET | /api/posts/{id} | 帖子详情 | 否 |
| PATCH | /api/posts/{id} | 作者编辑 | 是 |
| DELETE | /api/posts/{id} | 作者软删除 | 是 |
| PATCH | /api/posts/{id}/status | 作者更新状态 | 是 |
| POST | /api/images | 上传图片 | 是 |
| POST | /api/posts/{id}/conversations | 创建或复用会话 | 是 |
| GET | /api/conversations | 会话列表及未读 | 是 |
| GET | /api/conversations/{id} | 会话详情 | 是 |
| GET | /api/conversations/{id}/messages | 历史或增量消息 | 是 |
| POST | /api/conversations/{id}/messages | 发送文本消息 | 是 |
| POST | /api/conversations/{id}/read | 更新已读位置 | 是 |
图片读取：GET /media/:id，返回二进制JPEG/PNG。公开未删除帖子引用的图片可匿名读，其余仅上传者可读，未授权返回404。
## 可执行示例（PowerShell）
```powershell
$base = "http://127.0.0.1:4173"
$login = Invoke-RestMethod "$base/api/auth/login" -Method Post -ContentType "application/json" -Body '{"account":"demo","password":"demo12345"}' -SessionVariable session
$headers = @{ "X-CSRF-Token" = $login.data.csrf; "Idempotency-Key" = [guid]::NewGuid().ToString() }
$body = @{type="FOUND";title="蓝色保温杯";category="OTHER";campus_id="xiasha";location="图书馆二楼";event_date=(Get-Date -Format yyyy-MM-dd);description="杯身带小猫贴纸，等失主核实";image_ids=@()} | ConvertTo-Json
$post = Invoke-RestMethod "$base/api/posts" -Method Post -WebSession $session -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
Invoke-RestMethod "$base/api/posts?type=FOUND&category=OTHER&page=1&page_size=20"
$update = @{status="RESOLVED";version=$post.data.version} | ConvertTo-Json
Invoke-RestMethod "$base/api/posts/$($post.data.id)/status" -Method Patch -WebSession $session -Headers $headers -ContentType "application/json" -Body $update
```
## 字段与分页
- 类型 FOUND=招领、LOST=寻物；状态OPEN=进行中、RESOLVED=已完成、CLOSED=已关闭；status=ALL查询全部。
- 校区由/api/campuses获取；目前种子包含下沙及青山湖示例，上线前需确认。
- 公共列表默认OPEN，我的列表默认ALL。page默认1，page_size默认20、最大50。条件取交集；keyword匹配名称/描述，date_from/date_to包含端点。
- 新建必须带Idempotency-Key；网络重试复用键，修改提交内容后换新键。相同键不同内容409。
- 编辑支持部分字段更新，必须带最新version；修改、状态、删除冲突409后重新读取详情，不能静默覆盖。
- 图片POST体data_url包含完整data URL，解码后≤10MiB；返回image_id放入帖子image_ids，最多3个且必须属于当前用户。
- 会话创建不传收件人，服务端根据帖子作者确定；只能联系他人OPEN帖子。
- 历史消息首次查最近30条；before_id向前，after_id向后，二者互斥。limit最大100，items始终按id升序；after_id=0从最早消息开始。has_more=true时继续以next_cursor查询。
- 发送消息必传content与client_message_id。重试必须复用ID和相同内容；后端确认存储后才算发送成功。
- last_read_message_id必须属于当前会话且只前移。未读数不包含自己发的消息。
## 错误处理
| HTTP状态 | 处理 |
| --- | --- |
| 400 | 修正参数；field_errors可定位字段 |
| 401 | 重新登录，保留非敏感草稿 |
| 403 | 权限/来源/CSRF失败；核对账号和令牌 |
| 404 | 资源不存在、已删除或图片不可见 |
| 405 | 方法不匹配，查看Allow头 |
| 409 | 账号重复、版本/状态/幂等冲突 |
| 413 / 415 | 请求过大 / Content-Type错误 |
| 429 | 登录或注册请求过于频繁，10分钟后重试 |
| 500 | 服务异常，保留内容后重试 |


## 首页物品类别榜
GET /api/rankings/lost-categories，匿名可访问，支持可选campus_id（不存在返回400）。返回data：month（YYYY-MM）、campus_id、total、items[{category,count,percentage}]。按当月event_date统计未删除的LOST帖子，包含全部状态；按count降序、category升序返回全部非零类别，前端展示前三。percentage为该类别占全部寻物帖比例，保留一位小数；total为0时items为空。月份使用北京时间，不接受客户端自选月份，不应用列表其他筛选。

### 首页多榜单更新（2026-10-08，替代上版看板交互）
取消底部页签和控制栏，右侧浮动上一页/下一页箭头在悬停或键盘聚焦时显示，触屏弱显示并保留滑动；不自动轮播。榜单采用前三名领奖台，第二名左、第一名中且最高、第三名右；不足三项的位置显示虚位以待。桌面并列四榜，窄屏可在榜单区域纵向浏览。
四榜包括：寻物类别数量榜；已归还招领物品类别榜（展示名拾金不昧榜，按发布者自报统计，非核实的个人荣誉榜）；按地点原文统计的寻物数量榜；未找回占比榜（非RESOLVED寻物帖数/同类别寻物帖数，包含CLOSED，显示样本数）。均按当月事发日期和选中校区汇总、排除删除数据。前两数量榜及地点榜数量降序、同值按名称排序；比例榜比例降序、同值按样本数降序再按类别代码排序。不是全校真实失踪率。
GET /api/rankings/lost-categories保留原items并新增boards；每榜提供id、title、subtitle、unit、category、note、items，items为name、count及比例榜sample。不返回个人账号信息。
