import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

// CORSヘッダー
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 入金手数料の定数
const PAYOUT_FEE_RATE = 0.0025; // 0.25%
const PAYOUT_FEE_FIXED = 450; // 450円
const MINIMUM_PAYOUT_AMOUNT = 500; // 最低入金額: 500円

// OPTIONSリクエスト（プリフライト）対応
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET: 現在の残高と入金可能額を取得
export async function GET(req: NextRequest) {
    try {
        // 1. 認証チェック
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        // 2. ユーザーのStripeアカウントIDを取得
        const userDoc = await adminDb.collection("users").doc(userId).get();
        const userData = userDoc.data();
        const stripeAccountId = userData?.stripeAccountId;

        if (!stripeAccountId) {
            return NextResponse.json({ error: "Stripe account not connected" }, { status: 400, headers: corsHeaders });
        }

        // デモアカウントの場合
        if (stripeAccountId.startsWith("acct_demo")) {
            return NextResponse.json({ 
                balance: 0,
                availableBalance: 0,
                pendingBalance: 0,
                payoutFee: 0,
                netPayoutAmount: 0,
                canPayout: false,
                isDemo: true,
                message: "デモアカウントのため、残高情報は利用できません。"
            }, { headers: corsHeaders });
        }

        // Stripeが無効な場合
        if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'dummy_key') {
            return NextResponse.json({ 
                balance: 0,
                availableBalance: 0,
                pendingBalance: 0,
                payoutFee: 0,
                netPayoutAmount: 0,
                canPayout: false,
                isDemo: true,
                message: "Stripeが設定されていません。"
            }, { headers: corsHeaders });
        }

        // 3. Stripe残高を取得
        const balance = await stripe.balance.retrieve({
            stripeAccount: stripeAccountId,
        });

        // JPY残高を取得
        const jpyAvailable = balance.available.find(b => b.currency === 'jpy');
        const jpyPending = balance.pending.find(b => b.currency === 'jpy');
        
        const availableBalance = jpyAvailable?.amount || 0;
        const pendingBalance = jpyPending?.amount || 0;

        // 4. 入金手数料と受取額を計算
        const payoutFee = Math.floor(availableBalance * PAYOUT_FEE_RATE) + PAYOUT_FEE_FIXED;
        const netPayoutAmount = availableBalance - payoutFee;
        const canPayout = availableBalance >= MINIMUM_PAYOUT_AMOUNT;

        return NextResponse.json({
            balance: availableBalance + pendingBalance,
            availableBalance,
            pendingBalance,
            payoutFee: canPayout ? payoutFee : 0,
            netPayoutAmount: canPayout ? netPayoutAmount : 0,
            canPayout,
            minimumPayoutAmount: MINIMUM_PAYOUT_AMOUNT,
            feeRate: PAYOUT_FEE_RATE,
            feeFixed: PAYOUT_FEE_FIXED,
        }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("Error fetching balance:", error);
        return NextResponse.json({ 
            error: error.message || "Failed to fetch balance" 
        }, { status: 500, headers: corsHeaders });
    }
}

// POST: 入金をリクエスト
export async function POST(req: NextRequest) {
    try {
        // 1. 認証チェック
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
        }
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userId = decodedToken.uid;

        // 2. ユーザーのStripeアカウントIDを取得
        const userDoc = await adminDb.collection("users").doc(userId).get();
        const userData = userDoc.data();
        const stripeAccountId = userData?.stripeAccountId;

        if (!stripeAccountId) {
            return NextResponse.json({ error: "Stripe account not connected" }, { status: 400, headers: corsHeaders });
        }

        // デモアカウントの場合
        if (stripeAccountId.startsWith("acct_demo")) {
            return NextResponse.json({ 
                success: false,
                error: "デモアカウントのため、入金リクエストは利用できません。"
            }, { status: 400, headers: corsHeaders });
        }

        // Stripeが無効な場合
        if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'dummy_key') {
            return NextResponse.json({ 
                success: false,
                error: "Stripeが設定されていません。"
            }, { status: 400, headers: corsHeaders });
        }

        // 3. Stripe残高を取得
        const balance = await stripe.balance.retrieve({
            stripeAccount: stripeAccountId,
        });

        // JPY残高を取得
        const jpyAvailable = balance.available.find(b => b.currency === 'jpy');
        const availableBalance = jpyAvailable?.amount || 0;

        // 4. 最低入金額チェック
        if (availableBalance < MINIMUM_PAYOUT_AMOUNT) {
            return NextResponse.json({ 
                success: false,
                error: `残高が最低入金額（${MINIMUM_PAYOUT_AMOUNT}円）に達していません。現在の残高: ${availableBalance}円`
            }, { status: 400, headers: corsHeaders });
        }

        // 5. 入金手数料を計算
        const payoutFee = Math.floor(availableBalance * PAYOUT_FEE_RATE) + PAYOUT_FEE_FIXED;
        const netPayoutAmount = availableBalance - payoutFee;

        // 6. 入金額が0以下にならないかチェック
        if (netPayoutAmount <= 0) {
            return NextResponse.json({ 
                success: false,
                error: "入金手数料を差し引くと入金額が0円以下になります。残高を増やしてから再度お試しください。"
            }, { status: 400, headers: corsHeaders });
        }

        // 7. Transfer Reversalで入金手数料をプラットフォームに戻す
        // このワーカーへのTransferを取得
        const transfers = await stripe.transfers.list({
            destination: stripeAccountId,
            limit: 50,
        });

        let reversedAmount = 0;
        const reversalIds: string[] = [];

        // 手数料分をReverse（複数のTransferから回収する可能性あり）
        for (const transfer of transfers.data) {
            if (reversedAmount >= payoutFee) break;
            
            // このTransferで取り消し可能な金額を計算
            const alreadyReversed = transfer.amount_reversed || 0;
            const reversibleAmount = transfer.amount - alreadyReversed;
            
            if (reversibleAmount <= 0) continue;
            
            // 必要な金額だけ取り消す
            const amountToReverse = Math.min(payoutFee - reversedAmount, reversibleAmount);
            
            try {
                const reversal = await stripe.transfers.createReversal(transfer.id, {
                    amount: amountToReverse,
                    metadata: {
                        type: 'payout_fee',
                        userId: userId,
                        feeRate: PAYOUT_FEE_RATE.toString(),
                        feeFixed: PAYOUT_FEE_FIXED.toString(),
                    }
                });
                
                reversedAmount += amountToReverse;
                reversalIds.push(reversal.id);
                console.log(`Transfer reversal created: ${reversal.id}, amount: ${amountToReverse}`);
            } catch (reversalError: any) {
                console.error(`Failed to reverse transfer ${transfer.id}:`, reversalError);
                // 一部のTransferが取り消せなくても続行
            }
        }

        // 手数料の全額を回収できなかった場合
        if (reversedAmount < payoutFee) {
            console.warn(`Could not reverse full payout fee. Requested: ${payoutFee}, Reversed: ${reversedAmount}`);
            // 回収できた分だけで続行（または、エラーにする場合はここでreturn）
        }

        // 8. Payoutを作成（手数料を差し引いた金額）
        // 注意: Transfer Reversalで手数料分を回収した後なので、残高は netPayoutAmount になっている
        const payout = await stripe.payouts.create(
            {
                amount: netPayoutAmount,
                currency: 'jpy',
                metadata: {
                    userId: userId,
                    originalAmount: availableBalance,
                    payoutFee: payoutFee,
                    reversedAmount: reversedAmount,
                    feeRate: PAYOUT_FEE_RATE.toString(),
                    feeFixed: PAYOUT_FEE_FIXED.toString(),
                },
            },
            {
                stripeAccount: stripeAccountId,
            }
        );

        // 9. 入金履歴をFirestoreに保存
        await adminDb.collection("payoutHistory").add({
            userId: userId,
            stripeAccountId: stripeAccountId,
            stripePayoutId: payout.id,
            originalAmount: availableBalance,
            payoutFee: payoutFee,
            reversedAmount: reversedAmount,
            reversalIds: reversalIds,
            netPayoutAmount: netPayoutAmount,
            status: payout.status,
            createdAt: new Date(),
        });

        return NextResponse.json({
            success: true,
            payout: {
                id: payout.id,
                amount: netPayoutAmount,
                fee: payoutFee,
                reversedAmount: reversedAmount,
                originalAmount: availableBalance,
                status: payout.status,
                arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : null,
            },
            message: `入金リクエストが完了しました。${netPayoutAmount}円が銀行口座に入金されます（手数料: ${payoutFee}円）。`
        }, { headers: corsHeaders });

    } catch (error: any) {
        console.error("Error creating payout:", error);
        
        // Stripeエラーの詳細を返す
        if (error.type === 'StripeInvalidRequestError') {
            return NextResponse.json({ 
                success: false,
                error: error.message || "入金リクエストに失敗しました。",
                code: error.code,
            }, { status: 400, headers: corsHeaders });
        }

        return NextResponse.json({ 
            success: false,
            error: error.message || "入金リクエストに失敗しました。"
        }, { status: 500, headers: corsHeaders });
    }
}
