# taiji-topo-file-downloader

> 太极平台工作流配置文件自动化下载工具

## 适用场景
在太极平台 (a.taiji.woa.com) 工作流页面，自动下载配置文件到指定目录。

## 前置条件
1. OpenClaw Chrome 扩展已安装并连接成功
2. 目标工作流页面已打开
3. 已点击节点打开参数配置面板

## 使用方法

### 1. 打开文件管理对话框
在节点参数配置中找到"配置文件"输入框，点击旁边的"文件管理"图标。

### 2. 下载单个文件
```javascript
// 点击文件行的下载按钮（第一个图标）
const modal = document.querySelector('.ant-modal-wrap');
const rows = modal.querySelectorAll('tr');
for (let row of rows) {
  if (row.textContent.includes('文件名')) {
    const links = row.querySelectorAll('a');
    links[0].click(); // 第一个是下载
    break;
  }
}
```

### 3. 移动下载的文件
Chrome 下载会生成临时文件（如 `.com.google.Chrome.XXXXX`），需要移动到目标目录：

```bash
# 创建目标目录
mkdir -p ~/Downloads/{工作流ID}/

# 查找最新临时文件并重命名
temp_file=$(ls -t ~/Downloads/.com.google.Chrome.* 2>/dev/null | head -1)
mv "$temp_file" ~/Downloads/{工作流ID}/{文件名}
```

## 完整流程示例

```javascript
// 1. 点击配置文件输入框打开文件管理
click("配置文件输入框")

// 2. 点击目标文件的下载按钮
// 假设要下载 model.py：
const modal = document.querySelector('.ant-modal-wrap');
const rows = modal.querySelectorAll('tr');
for (let row of rows) {
  if (row.textContent.includes('model.py')) {
    row.querySelectorAll('a')[0].click();
    break;
  }
}

// 3. 等待下载完成
sleep(2)

// 4. 移动文件到目标目录
mv $(ls -t ~/Downloads/.com.google.Chrome.* | head -1) ~/Downloads/ol_8020000001_1126026_burn/model.py
```

## 关键技术点

### 解决下载弹窗问题
太极平台使用 `showSaveFilePicker()` API 会触发系统保存对话框。通过监听 Chrome 下载目录自动捕获文件：

1. 下载点击后，Chrome 会在 `~/Downloads/` 生成临时文件 `.com.google.Chrome.XXXXX`
2. 使用 `ls -t` 获取最新文件
3. 移动到目标目录并重命名

### 文件定位
- 文件管理对话框中的文件行在 `<tr>` 元素中
- 操作列包含两个链接：索引0=下载，索引1=编辑
- 使用 `textContent.includes('文件名')` 匹配

## 常见问题

### 下载按钮找不到
- 确认在文件管理对话框内
- 按钮在操作列，是 `<a>` 标签

### 文件名匹配
- 使用部分匹配：`row.textContent.includes('model.py')`
- 注意排除相似文件名：如 `model.py` 和 `trainer.py`

### 临时文件找不到
- 确认 Chrome 下载目录是 `~/Downloads/`
- 临时文件以 `.com.google.Chrome.` 开头

## 输出目录
默认：`~/Downloads/{工作流ID}/`

例如：`~/Downloads/ol_8020000001_1126026_burn/model.py`
