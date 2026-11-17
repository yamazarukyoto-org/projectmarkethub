import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { adminDb } from "@/lib/firebase-admin";
import * as admin from "firebase-admin";

export async function POST(req: Request) {
    const db = adminDb;
    const body = await req.text();
    const signature = (await headers()).get("Stripe-Signature") as string;

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`Webhook signature verification failed: ${errorMessage}`);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    try {
        switch (event.type) {
            case "identity.verification_session.verified": {
                const session = event.data.object as import("stripe").Stripe.Identity.VerificationSession;
                const userId = session.metadata?.userId;
                if (userId) {
                    await db.collection("users").doc(userId).update({
                        verificationStatus: "approved",
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`User ${userId} verification approved.`);
                }
                break;
            }
            case "identity.verification_session.requires_input": {
                const session = event.data.object as import("stripe").Stripe.Identity.VerificationSession;
                const userId = session.metadata?.userId;
                const lastError = session.last_error;
                if (userId) {
                    // lastError might not have message in types, but usually has reason or code
                    const reason = lastError?.reason || (lastError as any)?.message || "Verification failed. Please try again.";
                    await db.collection("users").doc(userId).update({
                        verificationStatus: "rejected",
                        verificationRejectionReason: reason,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`User ${userId} verification requires input/rejected.`);
                }
                break;
            }
            case "payout.paid": {
                // 入金成功時の処理
                const payout = event.data.object as import("stripe").Stripe.Payout;
                const userId = payout.metadata?.userId;
                
                console.log(`Payout paid: ${payout.id}, amount: ${payout.amount}, userId: ${userId}`);
                
                // payoutHistoryを更新
                if (userId) {
                    const payoutHistoryRef = db.collection("payoutHistory");
                    const snapshot = await payoutHistoryRef
                        .where("stripePayoutId", "==", payout.id)
                        .limit(1)
                        .get();
                    
                    if (!snapshot.empty) {
                        const docRef = snapshot.docs[0].ref;
                        await docRef.update({
                            status: "paid",
                            paidAt: admin.firestore.FieldValue.serverTimestamp(),
                            arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`PayoutHistory updated to paid for payout ${payout.id}`);
                    }
                    
                    // ユーザーに通知を作成
                    await db.collection("notifications").add({
                        userId: userId,
                        type: "payout_paid",
                        title: "入金が完了しました",
                        message: `${payout.amount.toLocaleString()}円が銀行口座に入金されました。`,
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`Notification sent to user ${userId} for payout ${payout.id}`);
                }
                break;
            }
            case "payout.failed": {
                // 入金失敗時の処理
                const payout = event.data.object as import("stripe").Stripe.Payout;
                const userId = payout.metadata?.userId;
                const failureCode = payout.failure_code || "unknown";
                const failureMessage = payout.failure_message || "入金処理に失敗しました。";
                
                console.log(`Payout failed: ${payout.id}, code: ${failureCode}, message: ${failureMessage}`);
                
                // payoutHistoryを更新
                if (userId) {
                    const payoutHistoryRef = db.collection("payoutHistory");
                    const snapshot = await payoutHistoryRef
                        .where("stripePayoutId", "==", payout.id)
                        .limit(1)
                        .get();
                    
                    if (!snapshot.empty) {
                        const docRef = snapshot.docs[0].ref;
                        await docRef.update({
                            status: "failed",
                            failedAt: admin.firestore.FieldValue.serverTimestamp(),
                            failureCode: failureCode,
                            failureMessage: failureMessage,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`PayoutHistory updated to failed for payout ${payout.id}`);
                    }
                    
                    // ユーザーに通知を作成
                    await db.collection("notifications").add({
                        userId: userId,
                        type: "payout_failed",
                        title: "入金に失敗しました",
                        message: `入金処理に失敗しました。銀行口座情報をご確認ください。（エラー: ${failureMessage}）`,
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    console.log(`Notification sent to user ${userId} for failed payout ${payout.id}`);
                }
                break;
            }
            case "account.updated": {
                const account = event.data.object as import("stripe").Stripe.Account;
                // Connectアカウントの更新イベント
                // ユーザーIDを特定する必要があるが、accountオブジェクトにはmetadataが含まれていない場合がある
                // そのため、stripeAccountIdでユーザーを検索する
                const usersRef = db.collection("users");
                const snapshot = await usersRef.where("stripeAccountId", "==", account.id).limit(1).get();
                
                if (!snapshot.empty) {
                    const userDoc = snapshot.docs[0];
                    const userId = userDoc.id;
                    
                    // 本人確認状態の同期
                    // charges_enabled と payouts_enabled が true なら本人確認完了とみなす
                    if (account.charges_enabled && account.payouts_enabled) {
                        await userDoc.ref.update({
                            verificationStatus: "approved",
                            stripeOnboardingComplete: true,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`User ${userId} verification approved via Connect Account update.`);
                    } else if (account.requirements?.currently_due && account.requirements.currently_due.length > 0) {
                        // 要件が残っている場合は pending または rejected
                        // ここでは厳密に rejected にせず、pending のままにするか、UI側で判定させる
                        // ただし、verificationStatus を更新することで、Identity機能との統合を図る
                        // await userDoc.ref.update({ verificationStatus: "pending" });
                    }
                }
                break;
            }
            case "payment_intent.amount_capturable_updated":
            case "payment_intent.succeeded": {
                const paymentIntent = event.data.object as import("stripe").Stripe.PaymentIntent;
                const { jobId, contractId, type } = paymentIntent.metadata;

                console.log(`Processing payment event: ${event.type} for ${paymentIntent.id}`);

                if (type === "escrow") {
                    if (contractId) {
                        // Project Format: Update Contract Status
                        await db.collection("contracts").doc(contractId).update({
                            status: "escrow",
                            escrowAt: admin.firestore.FieldValue.serverTimestamp(),
                            stripePaymentIntentId: paymentIntent.id,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`Contract ${contractId} status updated to escrow.`);
                        
                        // Notify Worker (Optional but recommended)
                        // await createNotification(...) 
                    } else if (jobId) {
                        // Competition/Task Format: Update Job Status
                        await db.collection("jobs").doc(jobId).update({
                            status: "open",
                            stripePaymentIntentId: paymentIntent.id,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`Job ${jobId} status updated to open.`);
                    }
                }
                break;
            }
            case "charge.captured": {
                // 決済確定の二重確認（capture-payment-intent APIのバックアップ）
                const charge = event.data.object as import("stripe").Stripe.Charge;
                const paymentIntentId = charge.payment_intent as string;
                
                console.log(`Charge captured: ${charge.id}, PaymentIntent: ${paymentIntentId}`);
                
                if (paymentIntentId) {
                    // PaymentIntentからメタデータを取得
                    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                    const { contractId, jobId, type } = paymentIntent.metadata;
                    
                    if (type === "escrow" && contractId) {
                        const contractRef = db.collection("contracts").doc(contractId);
                        const contractDoc = await contractRef.get();
                        
                        if (contractDoc.exists) {
                            const contractData = contractDoc.data();
                            // escrow状態の場合のみ更新（既にcompletedの場合は無視）
                            if (contractData?.status === "escrow") {
                                await contractRef.update({
                                    paymentCapturedAt: admin.firestore.FieldValue.serverTimestamp(),
                                    paymentStatus: "captured",
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                                });
                                console.log(`Contract ${contractId} payment captured confirmed via webhook.`);
                            }
                        }
                    }
                }
                break;
            }
            case "charge.refunded": {
                // 返金の二重確認（refund APIのバックアップ）
                const charge = event.data.object as import("stripe").Stripe.Charge;
                const paymentIntentId = charge.payment_intent as string;
                const refundAmount = charge.amount_refunded;
                
                console.log(`Charge refunded: ${charge.id}, amount: ${refundAmount}, PaymentIntent: ${paymentIntentId}`);
                
                if (paymentIntentId) {
                    // PaymentIntentからメタデータを取得
                    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                    const { contractId, type } = paymentIntent.metadata;
                    
                    if (type === "escrow" && contractId) {
                        const contractRef = db.collection("contracts").doc(contractId);
                        const contractDoc = await contractRef.get();
                        
                        if (contractDoc.exists) {
                            const contractData = contractDoc.data();
                            // まだcancelledになっていない場合は更新
                            if (contractData?.status !== "cancelled") {
                                await contractRef.update({
                                    status: "cancelled",
                                    refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                                    refundAmount: refundAmount,
                                    refundConfirmedViaWebhook: true,
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                                });
                                console.log(`Contract ${contractId} refund confirmed via webhook.`);
                                
                                // 通知を作成
                                if (contractData?.clientId) {
                                    await db.collection("notifications").add({
                                        userId: contractData.clientId,
                                        type: "refund_completed",
                                        title: "返金が完了しました",
                                        message: `${refundAmount.toLocaleString()}円の返金処理が完了しました。`,
                                        contractId: contractId,
                                        read: false,
                                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                    });
                                }
                            }
                        }
                    }
                }
                break;
            }
            case "transfer.created": {
                // 送金成功の確認（capture-payment-intent内のTransferのバックアップ）
                const transfer = event.data.object as import("stripe").Stripe.Transfer;
                const { contractId, jobId, type } = transfer.metadata;
                
                console.log(`Transfer created: ${transfer.id}, amount: ${transfer.amount}, destination: ${transfer.destination}`);
                
                if (type === "reward" && contractId) {
                    const contractRef = db.collection("contracts").doc(contractId);
                    const contractDoc = await contractRef.get();
                    
                    if (contractDoc.exists) {
                        const contractData = contractDoc.data();
                        // Transfer IDが未設定の場合は更新
                        if (!contractData?.stripeTransferId) {
                            await contractRef.update({
                                stripeTransferId: transfer.id,
                                transferConfirmedViaWebhook: true,
                                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            });
                            console.log(`Contract ${contractId} transfer confirmed via webhook.`);
                        }
                        
                        // ワーカーに通知
                        if (contractData?.workerId) {
                            await db.collection("notifications").add({
                                userId: contractData.workerId,
                                type: "payment_received",
                                title: "報酬が入金されました",
                                message: `${transfer.amount.toLocaleString()}円の報酬がStripeアカウントに入金されました。`,
                                contractId: contractId,
                                read: false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            });
                        }
                    }
                }
                break;
            }
            case "transfer.reversed": {
                // 送金取り消し/失敗の通知（重要！）
                // Note: Stripeでは transfer.failed ではなく transfer.reversed が使用される
                const transfer = event.data.object as import("stripe").Stripe.Transfer;
                const { contractId, jobId, type } = transfer.metadata;
                
                console.error(`Transfer FAILED: ${transfer.id}, amount: ${transfer.amount}, destination: ${transfer.destination}`);
                
                if (type === "reward" && contractId) {
                    const contractRef = db.collection("contracts").doc(contractId);
                    const contractDoc = await contractRef.get();
                    
                    if (contractDoc.exists) {
                        const contractData = contractDoc.data();
                        
                        // ステータスを更新
                        await contractRef.update({
                            status: "transfer_failed",
                            transferFailedAt: admin.firestore.FieldValue.serverTimestamp(),
                            transferError: "Stripe送金処理に失敗しました",
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`Contract ${contractId} marked as transfer_failed.`);
                        
                        // クライアントとワーカー両方に通知
                        const notifications = [];
                        if (contractData?.clientId) {
                            notifications.push({
                                userId: contractData.clientId,
                                type: "transfer_failed",
                                title: "送金処理に問題が発生しました",
                                message: "ワーカーへの送金処理に失敗しました。システム管理者が対応いたします。",
                                contractId: contractId,
                                read: false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            });
                        }
                        if (contractData?.workerId) {
                            notifications.push({
                                userId: contractData.workerId,
                                type: "transfer_failed",
                                title: "報酬の受け取りに問題が発生しました",
                                message: "報酬の送金処理に失敗しました。Stripeアカウントの設定をご確認ください。",
                                contractId: contractId,
                                read: false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            });
                        }
                        
                        // バッチで通知を作成
                        const batch = db.batch();
                        for (const notification of notifications) {
                            const notifRef = db.collection("notifications").doc();
                            batch.set(notifRef, notification);
                        }
                        await batch.commit();
                    }
                }
                break;
            }
            case "charge.dispute.created": {
                // チャージバック（不正利用申告）の通知
                const dispute = event.data.object as import("stripe").Stripe.Dispute;
                const chargeId = dispute.charge as string;
                
                console.error(`Dispute created: ${dispute.id}, charge: ${chargeId}, amount: ${dispute.amount}, reason: ${dispute.reason}`);
                
                // Chargeからメタデータを取得
                const charge = await stripe.charges.retrieve(chargeId);
                const paymentIntentId = charge.payment_intent as string;
                
                if (paymentIntentId) {
                    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                    const { contractId, clientId } = paymentIntent.metadata;
                    
                    if (contractId) {
                        const contractRef = db.collection("contracts").doc(contractId);
                        
                        // 契約にdispute情報を記録
                        await contractRef.update({
                            hasDispute: true,
                            disputeId: dispute.id,
                            disputeReason: dispute.reason,
                            disputeAmount: dispute.amount,
                            disputeCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`Contract ${contractId} marked with dispute.`);
                    }
                    
                    // 管理者に通知（重要なイベントなので）
                    await db.collection("adminNotifications").add({
                        type: "dispute_created",
                        title: "【重要】チャージバックが発生しました",
                        message: `Dispute ID: ${dispute.id}, 金額: ${dispute.amount}円, 理由: ${dispute.reason}`,
                        disputeId: dispute.id,
                        contractId: contractId || null,
                        chargeId: chargeId,
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                break;
            }
            case "payment_intent.canceled": {
                // 7日間の仮決済期限切れ、または手動キャンセル時に発火
                const paymentIntent = event.data.object as import("stripe").Stripe.PaymentIntent;
                const { jobId, contractId, type } = paymentIntent.metadata;
                const cancellationReason = paymentIntent.cancellation_reason || "unknown";

                console.log(`PaymentIntent canceled: ${paymentIntent.id}, reason: ${cancellationReason}`);

                if (type === "escrow") {
                    if (contractId) {
                        // 契約のステータスを「期限切れキャンセル」に更新
                        const contractRef = db.collection("contracts").doc(contractId);
                        const contractDoc = await contractRef.get();
                        
                        if (contractDoc.exists) {
                            const contractData = contractDoc.data();
                            // escrow状態の契約のみ更新（既にcompleted等の場合は無視）
                            if (contractData?.status === "escrow") {
                                await contractRef.update({
                                    status: "payment_expired",
                                    paymentExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
                                    paymentExpiredReason: cancellationReason === "automatic" 
                                        ? "7日間の仮決済期限が切れました" 
                                        : `キャンセル理由: ${cancellationReason}`,
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                                });
                                console.log(`Contract ${contractId} marked as payment_expired due to PaymentIntent cancellation.`);
                                
                                // 通知を作成（クライアントとワーカー両方に）
                                const notifications = [];
                                if (contractData.clientId) {
                                    notifications.push({
                                        userId: contractData.clientId,
                                        type: "payment_expired",
                                        title: "仮決済の期限が切れました",
                                        message: "7日間の仮決済期限が切れたため、契約がキャンセルされました。再度契約を行う場合は、新しい契約を作成してください。",
                                        contractId: contractId,
                                        read: false,
                                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                    });
                                }
                                if (contractData.workerId) {
                                    notifications.push({
                                        userId: contractData.workerId,
                                        type: "payment_expired",
                                        title: "仮決済の期限が切れました",
                                        message: "クライアントの仮決済期限が切れたため、契約がキャンセルされました。",
                                        contractId: contractId,
                                        read: false,
                                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                    });
                                }
                                
                                // バッチで通知を作成
                                const batch = db.batch();
                                for (const notification of notifications) {
                                    const notifRef = db.collection("notifications").doc();
                                    batch.set(notifRef, notification);
                                }
                                await batch.commit();
                                console.log(`Notifications sent for expired contract ${contractId}`);
                            }
                        }
                    } else if (jobId) {
                        // タスク/コンペ形式の場合
                        const jobRef = db.collection("jobs").doc(jobId);
                        const jobDoc = await jobRef.get();
                        
                        if (jobDoc.exists) {
                            const jobData = jobDoc.data();
                            // open状態の仕事のみ更新
                            if (jobData?.status === "open") {
                                await jobRef.update({
                                    status: "payment_expired",
                                    paymentExpiredAt: admin.firestore.FieldValue.serverTimestamp(),
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                                });
                                console.log(`Job ${jobId} marked as payment_expired due to PaymentIntent cancellation.`);
                            }
                        }
                    }
                }
                break;
            }
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (error) {
        console.error("Error processing webhook:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }

    return NextResponse.json({ received: true });
}
