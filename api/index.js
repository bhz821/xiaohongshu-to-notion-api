export default {
  async fetch(request) {
    try {
      const data = await request.json();
      
      const url = data.pasted_text;
      const NOTION_TOKEN = data.notion_api;
      const NOTION_DATABASE_ID = data.database_id;
      const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

      // 极速抓取小红书页面（解决超时）
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          "Referer": "https://www.xiaohongshu.com/"
        },
        signal: AbortSignal.timeout(8000)
      });

      const html = await res.text();

      // 统一提取：图文 + 视频 都能用
      const title = (html.match(/<title>(.*?)<\/title/)?.[1] || "无标题").replace(" - 小红书", "");
      const content = html.match(/"content":"([\s\S]*?)"/)?.[1] || "";
      
      // 图片提取（视频页也能提取封面+素材图）
      const imgs = [...html.matchAll(https?:\/\/[^"\s]+\.(jpg|jpeg|png)/g)]
        .map(i => i[0])
        .filter(u => !u.includes('svg'))
        .slice(0, 10);

      // AI 快速解析
      const aiRes = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ZHIPU_API_KEY}`
        },
        body: JSON.stringify({
          model: "glm-4-flash",
          messages: [{
            role: "user",
            content: `提取菜谱：原料、调料、步骤、分类。正文：${content}`
          }]
        }),
        signal: AbortSignal.timeout(8000)
      });

      const aiData = await aiRes.json();
      const summary = aiData.choices?.[0]?.message?.content || "AI 解析失败";

      // 推送到 Notion
      await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_TOKEN}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28"
        },
        body: JSON.stringify({
          parent: { database_id: NOTION_DATABASE_ID },
          properties: {
            "标题": { title: [{ text: { content: title } }] },
            "链接": { url: url },
            "AI总结": { rich_text: [{ text: { content: summary } }] }
          },
          children: [
            ...imgs.map(img => ({
              object: "block",
              type: "image",
              image: { external: { url: img } }
            })),
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ text: { content: content } }] }
            }
          ]
        }),
        signal: AbortSignal.timeout(10000)
      });

      return new Response(JSON.stringify({ status: "success" }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
};
