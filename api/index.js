export default {
  async fetch(request) {
    try {
      const data = await request.json();

      // 完全沿用你快捷指令原本字段，不改任何东西
      const url = data.pasted_text;
      const NOTION_TOKEN = data.notion_api;
      const NOTION_DATABASE_ID = data.database_id;

      // 仅Vercel本地读取智谱key
      const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
        }
      });
      const html = await res.text();

      const title = html.match(/<title>(.*?)<\/title>/)?.[1].replace(" - 小红书", "") || "无标题";
      const content = html.match(/"content":"(.*?)"/)?.[1] || "";
      const imgs = [...html.matchAll(/"url":"(https?:\/\/[^\s]+?\.jpg)"/g)].map(i => i[1].replace(/\\/g, ""));

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
            content: `精准提取菜谱：原料、调料、详细步骤、菜品分类，简洁清晰。正文：${content}`
          }]
        })
      });

      const aiData = await aiRes.json();
      const summary = aiData.choices?.[0]?.message?.content || "暂无AI解析";

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
        })
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }
};
