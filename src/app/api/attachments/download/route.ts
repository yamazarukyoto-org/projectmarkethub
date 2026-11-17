import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = 'force-dynamic';

// ダウンロード回数を追跡・制限するAPI
export async function POST(request: NextRequest) {
    try {
        const { type, id, attachmentIndex, userId } = await request.json();

        if (!type || !id || attachmentIndex === undefined || !userId) {
            return NextResponse.json(
                { error: "必須パラメータが不足しています" },
                { status: 400 }
            );
        }

        // ダウンロード追跡用のドキュメントパス
        const trackingDocPath = `downloadTracking/${type}_${id}_${attachmentIndex}`;
        const trackingRef = adminDb.doc(trackingDocPath);
        const trackingDoc = await trackingRef.get();

        const MAX_DOWNLOADS = 3;

        if (trackingDoc.exists) {
            const data = trackingDoc.data();
            const userDownloads = data?.userDownloads || {};
            const currentCount = userDownloads[userId] || 0;

            if (currentCount >= MAX_DOWNLOADS) {
                return NextResponse.json(
                    { 
                        error: "ダウンロード回数の上限（3回）に達しました",
                        downloadCount: currentCount,
                        maxDownloads: MAX_DOWNLOADS,
                        canDownload: false
                    },
                    { status: 403 }
                );
            }

            // ダウンロード回数をインクリメント
            await trackingRef.update({
                [`userDownloads.${userId}`]: currentCount + 1,
                totalDownloads: FieldValue.increment(1),
                lastDownloadAt: FieldValue.serverTimestamp(),
            });

            return NextResponse.json({
                success: true,
                downloadCount: currentCount + 1,
                maxDownloads: MAX_DOWNLOADS,
                canDownload: true,
            });
        } else {
            // 新規作成
            await trackingRef.set({
                type,
                id,
                attachmentIndex,
                userDownloads: {
                    [userId]: 1,
                },
                totalDownloads: 1,
                createdAt: FieldValue.serverTimestamp(),
                lastDownloadAt: FieldValue.serverTimestamp(),
            });

            return NextResponse.json({
                success: true,
                downloadCount: 1,
                maxDownloads: MAX_DOWNLOADS,
                canDownload: true,
            });
        }
    } catch (error) {
        console.error("Download tracking error:", error);
        return NextResponse.json(
            { error: "ダウンロード追跡中にエラーが発生しました" },
            { status: 500 }
        );
    }
}

// ダウンロード回数を取得するAPI
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type");
        const id = searchParams.get("id");
        const attachmentIndex = searchParams.get("attachmentIndex");
        const userId = searchParams.get("userId");

        if (!type || !id || attachmentIndex === null || !userId) {
            return NextResponse.json(
                { error: "必須パラメータが不足しています" },
                { status: 400 }
            );
        }

        const trackingDocPath = `downloadTracking/${type}_${id}_${attachmentIndex}`;
        const trackingRef = adminDb.doc(trackingDocPath);
        const trackingDoc = await trackingRef.get();

        const MAX_DOWNLOADS = 3;

        if (trackingDoc.exists) {
            const data = trackingDoc.data();
            const userDownloads = data?.userDownloads || {};
            const currentCount = userDownloads[userId] || 0;

            return NextResponse.json({
                downloadCount: currentCount,
                maxDownloads: MAX_DOWNLOADS,
                canDownload: currentCount < MAX_DOWNLOADS,
            });
        } else {
            return NextResponse.json({
                downloadCount: 0,
                maxDownloads: MAX_DOWNLOADS,
                canDownload: true,
            });
        }
    } catch (error) {
        console.error("Download tracking fetch error:", error);
        return NextResponse.json(
            { error: "ダウンロード情報の取得中にエラーが発生しました" },
            { status: 500 }
        );
    }
}
