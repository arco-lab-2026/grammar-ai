// Vercel Serverless Function
// APIキーをサーバー側で管理 - ユーザーには見せない

export const config = { maxDuration: 30 };

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
].filter(Boolean);

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // JWT認証チェック
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  const token = authHeader.slice(7);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    // ユーザー情報取得
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseServiceKey,
      }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'トークンが無効です' });
    const user = await userRes.json();

    // サブスクリプション確認
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?user_id=eq.${user.id}&status=eq.active&select=id,status,plan`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        }
      }
    );
    const subs = await subRes.json();
    if (!subs || subs.length === 0) {
      return res.status(403).json({ error: 'subscription_required', message: 'サブスクリプションが必要です' });
    }

    // レート制限チェック（1分あたり20リクエスト）
    const rateLimitRes = await fetch(
      `${supabaseUrl}/rest/v1/api_usage?user_id=eq.${user.id}&created_at=gte.${new Date(Date.now() - 60000).toISOString()}&select=id`,
      { headers: { 'apikey': supabaseServiceKey, 'Authorization': `Bearer ${supabaseServiceKey}` } }
    );
    const recentCalls = await rateLimitRes.json();
    if (recentCalls.length > 20) {
      return res.status(429).json({ error: 'リクエストが多すぎます。少し待ってから再試行してください。' });
    }

    // Claude APIを呼ぶ（APIキーはサーバー環境変数）
    const { prompt, maxTokens = 2000 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'promptが必要です' });
    if (maxTokens > 4000) return res.status(400).json({ error: 'maxTokensが大きすぎます' });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      throw new Error(err.error?.message || 'Claude API error');
    }
    const data = await claudeRes.json();

    // 使用ログ記録（非同期・失敗しても続行）
    fetch(`${supabaseUrl}/rest/v1/api_usage`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.id,
        tokens_used: data.usage?.output_tokens || 0,
        model: 'claude-sonnet-4-20250514',
      }),
    }).catch(() => {});

    return res.status(200).json(data);
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
