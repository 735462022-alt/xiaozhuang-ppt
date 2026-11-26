# 4K打包助手

先按Presentations技能验证并生成最终PPTX，再由最终PPTX重新导入导出PNG。打包助手不做PPT作者，也不把现有PNG放进PPT来伪装原生内容。

从load_workspace_dependencies获取Node和Node模块路径，设置环境变量 `RUNTIME_NODE_MODULES` 为该模块根目录。不要复制本机固定路径或安装另一套库。需要sharp和jszip，均从该运行库加载。

在任务私有构建目录写manifest.json：

```json
{
  "pptx": "/absolute/task/output/主题_成品.pptx",
  "receipt": "/absolute/task/.build/validation-final.json",
  "outputDir": "/absolute/task/output",
  "stem": "主题",
  "expectedCount": 10,
  "background": "#E7E9E4",
  "slides": [
    {
      "png": "/absolute/task/.build/final-4k/01.png",
      "editableText": ["第1页主标题", "该页的原生副标题"]
    }
  ]
}
```

slides须列全N页，顺序与最终PPT一致。editableText应列该页所有核心文字，不仅标题或页码。长文本按原生文本框或表格单元格拆分，脚本会忽略空白但不忽略标点。PPT页中超链接的原生文字也可以列入。

执行：

```text
<RUNTIME_NODE> <SKILL_DIR>/scripts/package-4k.mjs <manifest.json>
```

输出：3840像素宽PNG长图、4K单页ZIP、PPTX（源文件在别处时复制）和私有manifest旁的打包回执。输出存在时拒绝覆盖，修订使用新stem或新输出目录。图像拼接只装配最终渲染页，不绘制插图。

失败即修复实际问题后重新运行，不把失败的检查关掉。此助手不负责来源HTML，按SKILL.md要求另存一份自包含设计/来源HTML。
