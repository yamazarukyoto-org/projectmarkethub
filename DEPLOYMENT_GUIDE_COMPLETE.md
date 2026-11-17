AI Deployment Manifest: Project Market HubRole: Deployment AgentObjective: Deploy "Project Market Hub" to Google Cloud Platform (Cloud Run) with Firebase integration.Target Environment: Production (Asia-Northeast1)1. 🌍 Context & Configuration (コンテキストと設定)AIエージェントはこの設定値を全てのコマンド実行時の定数として使用すること。1.1 Project Identifiers (プロジェクト識別子)Variable NameValueDescriptionGCP_PROJECT_IDprojectmarkethubGoogle Cloud Project IDFIREBASE_PROJECT_IDprojectmarkethub-db904Firebase Project IDPROJECT_NUMBER173689610587GCP Project NumberSERVICE_NAMEprojectmarkethubCloud Run Service NameREGIONasia-northeast1Default Region1.2 Infrastructure Specs (インフラ仕様)Variable NameValueDescriptionARTIFACT_REPOprojectmarkethub-repoArtifact Registry Repository NameIMAGE_PATHasia-northeast1-docker.pkg.dev/projectmarkethub/projectmarkethub-repo/app:latestFull Docker Image URICUSTOM_DOMAINproject-market-hub.comPrimary DomainDNS_ZONEproject-market-hub-comCloud DNS Zone Name1.3 Required Secrets (必須シークレット)実行時に以下の環境変数が注入されていることを前提とする。FIREBASE_API_KEYFIREBASE_AUTH_DOMAINFIREBASE_STORAGE_BUCKETFIREBASE_MESSAGING_SENDER_IDFIREBASE_APP_IDSTRIPE_SECRET_KEYSTRIPE_WEBHOOK_SECRETFIREBASE_SERVICE_ACCOUNT_EMAILFIREBASE_PRIVATE_KEY2. 🛠 Toolchain Verification (ツールチェーン検証)デプロイプロセスを開始する前に、以下のコマンドで環境適合性をチェックすること。# Verify gcloud authentication and project setting
gcloud config get-value project | grep -q "projectmarkethub" || echo "ERROR: Wrong GCP Project"

# Verify Docker daemon is running
docker info > /dev/null 2>&1 || echo "ERROR: Docker is not running"

# Verify Firebase CLI login
firebase projects:list > /dev/null 2>&1 || echo "ERROR: Firebase CLI not authenticated"
3. 🚀 Execution Sequence (実行シーケンス)AIエージェントは以下のフェーズを順次実行する。各フェーズでエラーが発生した場合は直ちに中断(Abort)すること。Phase 1: Infrastructure Initialization (インフラ初期化)冪等性を確保するため、リソースが存在しない場合のみ作成するロジックを含む。1.1 Enable Required APIsgcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  firebase.googleapis.com \
  dns.googleapis.com \
  --project projectmarkethub
1.2 Ensure Artifact Registry Existsgcloud artifacts repositories describe projectmarkethub-repo \
  --location=asia-northeast1 \
  --project=projectmarkethub \
  || gcloud artifacts repositories create projectmarkethub-repo \
    --repository-format=docker \
    --location=asia-northeast1 \
    --project=projectmarkethub
Phase 2: Build & Push (ビルドとプッシュ)2.1 Cloud Build Submission (Recommended)ローカル依存を排除するため、Cloud Buildを優先使用する。gcloud builds submit \
  --tag asia-northeast1-docker.pkg.dev/projectmarkethub/projectmarkethub-repo/app:latest \
  --project projectmarkethub \
  --timeout=1200s
Validation Criteria:Exit Code: 0Log output contains: SUCCESSPhase 3: Service Deployment (サービスデプロイ)3.1 Deploy to Cloud Runシークレットと環境変数を動的に適用する。gcloud run deploy projectmarkethub \
  --image asia-northeast1-docker.pkg.dev/projectmarkethub/projectmarkethub-repo/app:latest \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --project projectmarkethub \
  --set-env-vars "^,^NEXT_PUBLIC_FIREBASE_API_KEY=${FIREBASE_API_KEY},NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN},NEXT_PUBLIC_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID},NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET},NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID},NEXT_PUBLIC_FIREBASE_APP_ID=${FIREBASE_APP_ID},STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY},STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}"
Validation Criteria:Exit Code: 0Output contains Service URL.Phase 4: Domain & Networking (ドメインとネットワーク)4.1 Verify Domain Mappinggcloud run domain-mappings describe \
  --domain project-market-hub.com \
  --region asia-northeast1 \
  --project projectmarkethub \
  || gcloud run domain-mappings create \
    --service projectmarkethub \
    --domain project-market-hub.com \
    --region asia-northeast1 \
    --project projectmarkethub
4.2 DNS Record Verification (Read-Only Check)AIは現在のDNSレコードがGoogleの指定するIPと一致するか確認する必要がある。# Check A Record
nslookup -type=A project-market-hub.com
# Expected: 216.239.32.21

# Check AAAA Record
nslookup -type=AAAA project-market-hub.com
# Expected: 2001:4860:4802:32::15
4. 🔍 Verification Protocols (検証プロトコル)デプロイ完了後、以下のヘルスチェックを実行する。4.1 HTTP Availability Check# Check HTTP Status 200 via curl
curl -I -f [https://project-market-hub.com](https://project-market-hub.com)
4.2 SSL Certificate Statusgcloud run domain-mappings describe \
  --domain project-market-hub.com \
  --region asia-northeast1 \
  --project projectmarkethub \
  --format="value(status.resourceRecords)"
Note: SSL証明書の発行には時間がかかる場合があるため、失敗時は Retry-After: 60s でポーリングを行うこと。5. ⚠️ Error Handling Strategies (エラーハンドリング戦略)Case: "Docker build failed due to missing files"Action: Dockerfile 内の COPY 命令を確認する。特に public フォルダや .env ファイルの参照エラーをチェック。Recovery: COPY --from=builder /app/public ./public の行を条件付きコピーに変更するか削除する。Case: "Permission Denied"Action: サービスアカウント権限を確認。Command: gcloud projects get-iam-policy projectmarkethubRequired Roles: roles/run.admin, roles/storage.admin, roles/iam.serviceAccountUser6. File Structure Expectation (期待されるファイル構造)AIが操作するディレクトリには最低限以下が存在すること。.
├── Dockerfile          # Must contain "COPY --from=builder ..."
├── next.config.js      # Must contain "output: 'standalone'"
├── package.json
└── src/                # Source code
