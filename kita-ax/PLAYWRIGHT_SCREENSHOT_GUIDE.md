# Playwright Screenshot Capture Guide

**自动化截图脚本用于 KYRA 管理控制台的 Access Policies 截图**

## 前置条件

- Node.js 16+ 已安装
- npm 或 yarn
- 对 KYRA 开发服务器的访问权限

## 设置步骤

### 1. 安装依赖

```bash
cd /home/khchoi/external-projects/kita-ax
npm install
npx playwright install chromium
```

### 2. 确保已登录

在浏览器中访问 https://kyra-guardrail-dev.seekerslab.com/chat 并以管理员账户登录。

### 3. 运行截图脚本

```bash
node capture_screenshot.js
```

脚本将会：
1. 打开 KYRA 管理控制台
2. 导航到 Documents 页面
3. 点击 "Access Policies" 选项卡
4. 等待权限矩阵加载
5. 截图保存到 `screenshots/access_policies.png`

## 脚本选项

### 自定义输出路径

编辑 `capture_screenshot.js` 中的以下行：

```javascript
const screenshotPath = path.join(__dirname, 'screenshots', 'access_policies.png');
```

### 调整视口大小

修改视口设置：

```javascript
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 }  // 修改这里
});
```

### 增加超时时间

如果页面加载缓慢，增加等待时间：

```javascript
await page.waitForTimeout(5000);  // 从 2000 改为 5000 毫秒
```

## 故障排查

### 脚本无法连接到服务器

**症状:** `net::ERR_ADDRESS_UNREACHABLE`

**解决方案:**
1. 确保 KYRA 开发服务器正在运行
2. 检查 DNS：`ping kyra-guardrail-dev.seekerslab.com`
3. 尝试在浏览器中手动访问 URL
4. 检查防火墙/VPN 设置

### 找不到 Access Policies 选项卡

**症状:** `Access Policies tab not found`

**解决方案:**
1. 确保以管理员身份登录
2. 脚本会自动尝试其他选择器
3. 手动打开页面并检查 HTML 结构：
   ```bash
   # 使用浏览器开发工具 (F12) 找到选项卡选择器
   ```

### 截图质量不好

**症状:** 截图模糊或不完整

**解决方案:**
1. 增加视口宽度（例如 1920x1080）
2. 启用全页截图：
   ```javascript
   await page.screenshot({
     path: screenshotPath,
     fullPage: true  // 添加这行
   });
   ```

### 超时错误

**症状:** `Timeout while waiting for...`

**解决方案:**
1. 检查网络连接
2. 增加超时时间：
   ```javascript
   await page.waitForSelector(..., { timeout: 20000 });
   ```

## 手动备选方案

如果自动脚本不工作，可以手动截图：

```bash
# 选项 1：使用 Playwright 调试工具
npx playwright codegen https://kyra-guardrail-dev.seekerslab.com/admin/documents

# 选项 2：使用浏览器截图
# 1. 打开 https://kyra-guardrail-dev.seekerslab.com/admin/documents
# 2. 点击 "Access Policies" 选项卡
# 3. 按 F12 打开开发工具
# 4. Ctrl+Shift+P → 搜索 "Capture screenshot"
# 5. 选择要截图的区域
# 6. 保存到 screenshots/access_policies.png
```

## 脚本代码结构

```
capture_screenshot.js
├── 启动 Chromium 浏览器
├── 创建新页面（1280x800）
├── 导航到 /admin/documents
├── 等待页面加载完成
├── 点击 "Access Policies" 选项卡
├── 等待内容加载
├── 滚动确保内容可见
└── 截图并保存到 screenshots/
```

## 截图质量检查

运行脚本后验证：

```bash
# 检查文件是否创建
ls -lh screenshots/access_policies.png

# 检查文件是否有效
file screenshots/access_policies.png

# 查看文件尺寸
identify screenshots/access_policies.png  # 需要 ImageMagick
```

## 集成到 CI/CD

如果要在 CI/CD 中自动运行：

```yaml
# GitHub Actions 示例
- name: Capture Access Policies Screenshot
  run: |
    cd kita-ax
    npm install
    npx playwright install chromium
    node capture_screenshot.js
```

## 常见问题

**Q: 脚本需要多长时间？**  
A: 通常 10-20 秒（取决于网络和服务器响应）

**Q: 可以在没有图形界面的 Linux 服务器上运行吗？**  
A: 可以，Playwright 无头浏览器支持在没有 GUI 的系统上运行

**Q: 如何在特定时间自动运行？**  
A: 使用 cron 定时任务：
```bash
0 9 * * 1 /home/khchoi/external-projects/kita-ax/run_screenshot.sh
```

**Q: 脚本可以截多个不同页面吗？**  
A: 可以，修改脚本中的 URL 和选择器即可

## 后续步骤

截图完成后：

1. 验证 `screenshots/access_policies.png` 已生成
2. 检查图像内容是否正确
3. 运行 PDF 生成：
   ```bash
   cd /home/khchoi/external-projects/kita-ax/
   chromium-browser --headless --print-to-pdf=AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf \
     --disable-gpu AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html
   ```
4. 提交和推送更新：
   ```bash
   git add screenshots/access_policies.png
   git commit -m "chore: Add Access Policies screenshot for proposal"
   git push
   ```

## 获得帮助

如遇问题，检查以下资源：
- Playwright 文档: https://playwright.dev/
- 脚本错误输出（保存在 `screenshots/error_screenshot.png`）
- 浏览器开发工具检查 DOM 结构
