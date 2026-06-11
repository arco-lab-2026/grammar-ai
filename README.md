# GrammarAI PWA — セットアップガイド

## 構成

```
grammar-pwa/
├── public/
│   ├── index.html      ← メインアプリ（PWA）
│   ├── manifest.json   ← PWAマニフェスト
│   ├── sw.js           ← Service Worker（オフライン対応）
│   └── icons/          ← アイコン画像（別途用意）
├── api/
│   ├── claude.js       ← Claude APIプロキシ（APIキーを隠す）
│   ├── stripe-webhook.js ← Stripe Webhook処理
│   └── create-checkout.js ← Stripeチェックアウト作成
├── supabase-schema.sql ← Supabase DB設定
├── vercel.json         ← Vercelデプロイ設定
└── package.json
```

---

## セットアップ手順

### Step 1: Supabase（認証・DB）— 無料

1. [supabase.com](https://supabase.com) でプロジェクト作成（無料）
2. SQL Editor で `supabase-schema.sql` を実行
3. Authentication > Providers で「Google」を有効化
4. Project Settings > API から以下をコピー：
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → `SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY`

### Step 2: Stripe（課金）— 無料（売上の3.6%のみ）

1. [stripe.com](https://stripe.com) でアカウント作成
2. Products > 「月額プラン」を作成
   - Price: ¥980/月
   - Lookup key: `monthly`
3. Developers > API keys から `STRIPE_SECRET_KEY` をコピー
4. Webhooks > 「Add endpoint」
   - URL: `https://あなたのドメイン.vercel.app/api/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - `STRIPE_WEBHOOK_SECRET` をコピー
5. 作成したPriceのIDを `STRIPE_PRICE_ID` としてメモ

### Step 3: Anthropic APIキー取得

1. [console.anthropic.com](https://console.anthropic.com) でAPIキー作成
2. `ANTHROPIC_API_KEY` としてメモ

### Step 4: Vercel（ホスティング）— 無料

1. [vercel.com](https://vercel.com) でアカウント作成
2. GitHubにこのフォルダをリポジトリとしてpush
3. Vercelで「Import Repository」
4. Environment Variables に以下を追加：

| 変数名 | 値 |
|--------|-----|
| `ANTHROPIC_API_KEY` | sk-ant-... |
| `SUPABASE_URL` | https://xxxx.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role_key |
| `STRIPE_SECRET_KEY` | sk_live_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_... |
| `STRIPE_PRICE_ID` | price_... |
| `NEXT_PUBLIC_APP_URL` | https://あなたのドメイン.vercel.app |

5. Deploy！

### Step 5: index.html の設定値を更新

`public/index.html` の以下2行を変更：
```js
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'あなたのanon_key';
```

### Step 6: アイコン画像を用意

`public/icons/` フォルダに以下を追加：
- `icon-192.png` (192×192px)
- `icon-512.png` (512×512px)

[Favicon.io](https://favicon.io) などで📖の絵文字からPNG生成可能。

---

## コスト試算

| サービス | 費用 |
|---------|------|
| Vercel | 無料（月100GB帯域まで） |
| Supabase | 無料（月50万リクエストまで） |
| Stripe | 売上の3.6% + ¥40/件 |
| Anthropic API | ~$0.003/リクエスト（Claude Sonnet） |
| **合計（100ユーザー時）** | **月¥3,500程度** |

収益（100ユーザー × ¥980）= ¥98,000/月
コスト（API + Stripe手数料）= 約¥7,000/月
**純利益: 約¥91,000/月**

---

## iOSホーム画面への追加方法（ユーザー向け案内）

1. Safariでサイトを開く
2. 下部の共有ボタン（□↑）をタップ
3. 「ホーム画面に追加」を選択
4. アプリとしてインストール完了！
