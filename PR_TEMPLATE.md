## PR标题

同步部署更新：跨平台构建脚本和依赖优化

## PR描述

此PR同步了openclaw-cn的最新部署更新，主要改进包括：

### 🚀 主要特性

1. **新增跨平台构建脚本**
   - `bundle-a2ui.mjs` - 支持Windows/macOS/Linux的Node.js脚本
   - `bundle-a2ui.ps1` - PowerShell备用脚本
   - 解决Windows环境bash脚本兼容性问题

2. **依赖和配置更新**
   - 添加`cross-env`用于跨平台环境变量
   - 调整`onlyBuiltDependencies`列表
   - 更新pnpm至10.31.0
   - 同步pnpm-lock.yaml

3. **代码质量改进**
   - 修复ESLint警告和错误
   - 优化飞书扩展导出结构
   - 改进错误处理

### 📁 文件更改

```
scripts/bundle-a2ui.mjs     (新增)
scripts/bundle-a2ui.ps1     (新增)
scripts/bundle-a2ui.sh      (修改)
package.json                (修改)
pnpm-lock.yaml              (修改)
extensions/feishu/index.ts  (修改)
```

### ✅ 测试验证

- [x] Windows 10/11构建测试
- [x] WSL环境构建测试
- [x] 阿里云Linux服务器部署测试
- [x] 网关服务启动测试

### 🔧 构建说明

```bash
# 小内存服务器优化构建
export NODE_OPTIONS="--max-old-space-size=2048"
pnpm install --ignore-scripts
pnpm canvas:a2ui:bundle
pnpm build
```

### 📋 影响范围

- **正向影响**: 提升Windows开发体验，改善小内存服务器部署
- **兼容性**: 完全向后兼容，现有流程不受影响
- **性能**: 构建过程内存使用更可控

### 🐛 相关问题

- 解决WebUI构建过程中的跨平台兼容性问题
- 优化小内存环境部署流程

## 提交记录

- e8cb88093 fix: resolve ESLint issues in bundle-a2ui.mjs
- 3ee0984bf sync: apply openclaw-cn deployment updates
- 8a16c6c19 chore: local modifications - update pnpm version and adjust feishu export

## 目标分支

`openclaw-cn:main` ← `lzyyj:main`

## 评审要点

1. 跨平台脚本是否满足所有构建场景需求
2. 依赖更新是否引入breaking changes
3. 构建性能变化评估
4. 文档更新必要性
