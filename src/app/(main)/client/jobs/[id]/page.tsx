"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { getJob, getProposals, getContractsForJob } from "@/lib/db";
import { db, auth } from "@/lib/firebase";
import { deleteDoc, doc } from "firebase/firestore";
import { Job, Proposal, Contract } from "@/types";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ArrowLeft, Clock, DollarSign, Calendar, Tag, Trash2, Paperclip, Download } from "lucide-react";

// 案件添付ファイルのダウンロードコンポーネント（ダウンロード回数制限付き）
function JobAttachmentDownload({ 
    jobId, 
    attachmentIndex, 
    url, 
    displayName, 
    userId 
}: { 
    jobId: string; 
    attachmentIndex: number; 
    url: string; 
    displayName: string; 
    userId: string;
}) {
    const [downloadCount, setDownloadCount] = useState(0);
    const [canDownload, setCanDownload] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const MAX_DOWNLOADS = 3;

    useEffect(() => {
        // 初期ダウンロード回数を取得
        const fetchDownloadCount = async () => {
            if (!userId) return;
            try {
                const response = await fetch(
                    `/api/attachments/download?type=job&id=${jobId}&attachmentIndex=${attachmentIndex}&userId=${userId}`
                );
                if (response.ok) {
                    const data = await response.json();
                    setDownloadCount(data.downloadCount);
                    setCanDownload(data.canDownload);
                }
            } catch (error) {
                console.error("Failed to fetch download count:", error);
            }
        };
        fetchDownloadCount();
    }, [jobId, attachmentIndex, userId]);

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        
        if (!userId) {
            alert("ダウンロードするにはログインが必要です。");
            return;
        }

        if (!canDownload) {
            alert("ダウンロード回数の上限（3回）に達しました。");
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/attachments/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'job',
                    id: jobId,
                    attachmentIndex,
                    userId,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setDownloadCount(data.downloadCount);
                setCanDownload(data.downloadCount < MAX_DOWNLOADS);
                // ダウンロードを実行
                window.open(url, '_blank');
            } else {
                alert(data.error || "ダウンロードに失敗しました。");
            }
        } catch (error) {
            console.error("Download error:", error);
            alert("ダウンロード中にエラーが発生しました。");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleDownload}
            disabled={isLoading || !canDownload}
            className={`flex items-center justify-between w-full gap-2 p-2 rounded transition-colors text-sm ${
                canDownload 
                    ? 'bg-gray-50 hover:bg-gray-100 text-primary cursor-pointer' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
        >
            <div className="flex items-center gap-2">
                <Download size={14} />
                <span className="truncate">{displayName}</span>
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">
                {downloadCount}/{MAX_DOWNLOADS}回
            </span>
        </button>
    );
}

// 提案添付ファイルのダウンロードコンポーネント（ダウンロード回数制限付き）
function ProposalAttachmentDownload({ 
    proposalId, 
    attachmentIndex, 
    url, 
    displayName, 
    userId 
}: { 
    proposalId: string; 
    attachmentIndex: number; 
    url: string; 
    displayName: string; 
    userId: string;
}) {
    const [downloadCount, setDownloadCount] = useState(0);
    const [canDownload, setCanDownload] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const MAX_DOWNLOADS = 3;

    useEffect(() => {
        // 初期ダウンロード回数を取得
        const fetchDownloadCount = async () => {
            if (!userId) return;
            try {
                const response = await fetch(
                    `/api/attachments/download?type=proposal&id=${proposalId}&attachmentIndex=${attachmentIndex}&userId=${userId}`
                );
                if (response.ok) {
                    const data = await response.json();
                    setDownloadCount(data.downloadCount);
                    setCanDownload(data.canDownload);
                }
            } catch (error) {
                console.error("Failed to fetch download count:", error);
            }
        };
        fetchDownloadCount();
    }, [proposalId, attachmentIndex, userId]);

    const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        
        if (!userId) {
            alert("ダウンロードするにはログインが必要です。");
            return;
        }

        if (!canDownload) {
            alert("ダウンロード回数の上限（3回）に達しました。");
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch('/api/attachments/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'proposal',
                    id: proposalId,
                    attachmentIndex,
                    userId,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setDownloadCount(data.downloadCount);
                setCanDownload(data.downloadCount < MAX_DOWNLOADS);
                // ダウンロードを実行
                window.open(url, '_blank');
            } else {
                alert(data.error || "ダウンロードに失敗しました。");
            }
        } catch (error) {
            console.error("Download error:", error);
            alert("ダウンロード中にエラーが発生しました。");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleDownload}
            disabled={isLoading || !canDownload}
            className={`flex items-center justify-between w-full gap-1 p-1.5 rounded transition-colors text-xs ${
                canDownload 
                    ? 'bg-gray-50 hover:bg-gray-100 text-primary cursor-pointer' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
        >
            <div className="flex items-center gap-1">
                <Download size={12} />
                <span className="truncate">{displayName}</span>
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">
                {downloadCount}/{MAX_DOWNLOADS}
            </span>
        </button>
    );
}

export default function ClientJobDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const [job, setJob] = useState<Job | null>(null);
    const [proposals, setProposals] = useState<Proposal[]>([]);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                if (params.id) {
                    const jobId = params.id as string;
                    const jobData = await getJob(jobId);
                    setJob(jobData);

                    if (jobData && jobData.clientId === user?.uid) {
                        try {
                            // セキュリティルールで認証済みユーザーはproposalsを読めるように設定済み
                            const proposalsData = await getProposals(jobId);
                            setProposals(proposalsData);
                        } catch (error) {
                            console.error("Error fetching proposals:", error);
                        }
                        
                        // 契約情報も取得して、採用済みの提案と紐付ける
                        try {
                            const contractsData = await getContractsForJob(jobId);
                            setContracts(contractsData);
                        } catch (error) {
                            console.error("Error fetching contracts:", error);
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching job details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [params.id, user]);

    const handleDelete = async () => {
        if (!job || !confirm("本当にこの依頼を削除しますか？この操作は取り消せません。")) return;

        try {
            await deleteDoc(doc(db, "jobs", job.id));
            alert("依頼を削除しました。");
            router.push("/client/dashboard");
        } catch (error) {
            console.error("Error deleting job:", error);
            alert("削除に失敗しました。");
        }
    };

    if (loading) return <div className="p-8 text-center">読み込み中...</div>;
    if (!job) return <div className="p-8 text-center">案件が見つかりません</div>;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-4">
                <Button variant="ghost" className="pl-0" onClick={() => router.back()}>
                    <ArrowLeft size={20} className="mr-2" />
                    戻る
                </Button>
                {job.status === 'open' && (
                    <Button variant="ghost" className="text-danger hover:bg-red-50 hover:text-danger" onClick={handleDelete}>
                        <Trash2 size={20} className="mr-2" />
                        依頼を削除
                    </Button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Job Details */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                <CardTitle className="text-2xl font-bold text-secondary">{job.title}</CardTitle>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                                    job.status === 'open' ? (job.proposalCount > 0 ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800') :
                                    job.status === 'filled' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                    {job.status === 'open' ? (job.proposalCount > 0 ? '選定中' : '募集中') :
                                     job.status === 'filled' ? '契約中' : '終了'}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex flex-col sm:flex-row flex-wrap gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-1">
                                    <DollarSign size={16} />
                                    <span>予算: {job.budget.toLocaleString()}円 (固定報酬)</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Calendar size={16} />
                                    <span>期限: {job.deadline.toDate().toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Clock size={16} />
                                    <span>掲載日: {job.createdAt.toDate().toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="prose max-w-none">
                                <h3 className="text-lg font-semibold mb-2">依頼詳細</h3>
                                <p className="whitespace-pre-wrap text-gray-700">{job.description}</p>
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                    <Tag size={16} /> 関連タグ
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {job.tags.map(tag => (
                                        <span key={tag} className="px-2 py-1 bg-gray-100 text-xs rounded text-gray-600 whitespace-nowrap">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {job.attachments && job.attachments.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                        <Paperclip size={16} /> 添付ファイル
                                    </h3>
                                    <p className="text-xs text-gray-500 mb-2">注意）各ファイルのダウンロードは3回までです。</p>
                                    <div className="space-y-2">
                                        {job.attachments.map((att, index) => {
                                            // attが文字列（URL）の場合と、オブジェクト{name, url}の場合の両方に対応
                                            const attUrl = typeof att === 'string' ? att : att.url;
                                            const attName = typeof att === 'string' ? '' : (att.name || '');
                                            
                                            // ファイル名が空の場合、URLからファイル名を抽出
                                            const getFileNameFromUrl = (url: string, fallbackIndex: number) => {
                                                try {
                                                    // Firebase Storage URL形式: 
                                                    // https://firebasestorage.googleapis.com/v0/b/bucket/o/job-attachments%2F1234567890_filename.pdf?alt=media&token=xxx
                                                    
                                                    // URLからパス部分を抽出（/o/以降、?より前）
                                                    let encodedPath = '';
                                                    if (url.includes('/o/')) {
                                                        const afterO = url.split('/o/')[1];
                                                        if (afterO) {
                                                            encodedPath = afterO.split('?')[0];
                                                        }
                                                    }
                                                    
                                                    if (!encodedPath) {
                                                        return `ファイル${fallbackIndex + 1}`;
                                                    }
                                                    
                                                    // URLデコード（%2Fを/に変換など）
                                                    const decodedPath = decodeURIComponent(encodedPath);
                                                    
                                                    // パスの最後の部分を取得
                                                    const parts = decodedPath.split('/');
                                                    let lastPart = parts[parts.length - 1];
                                                    
                                                    if (!lastPart) {
                                                        return `ファイル${fallbackIndex + 1}`;
                                                    }
                                                    
                                                    // Firebase Storageの場合、タイムスタンプ_ファイル名の形式
                                                    // 例: 1234567890123_document.pdf
                                                    if (lastPart.includes('_')) {
                                                        const underscoreIndex = lastPart.indexOf('_');
                                                        const beforeUnderscore = lastPart.substring(0, underscoreIndex);
                                                        // 最初の部分が13桁程度の数字（タイムスタンプ）の場合のみスキップ
                                                        if (/^\d{10,15}$/.test(beforeUnderscore)) {
                                                            const fileName = lastPart.substring(underscoreIndex + 1);
                                                            return fileName || `ファイル${fallbackIndex + 1}`;
                                                        }
                                                    }
                                                    return lastPart;
                                                } catch (e) {
                                                    console.error('Error extracting filename:', e);
                                                    return `ファイル${fallbackIndex + 1}`;
                                                }
                                            };
                                            
                                            const displayName = attName && attName.trim() !== '' 
                                                ? attName 
                                                : getFileNameFromUrl(attUrl, index);
                                            
                                            return (
                                                <JobAttachmentDownload
                                                    key={index}
                                                    jobId={job.id}
                                                    attachmentIndex={index}
                                                    url={attUrl}
                                                    displayName={displayName}
                                                    userId={user?.uid || ''}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Proposals (Only visible to client) */}
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-secondary">応募一覧 ({proposals.length})</h2>
                    {proposals.length > 0 ? (
                        <div className="space-y-4">
                            {proposals.map(proposal => (
                                <Card key={proposal.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div 
                                                className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden cursor-pointer hover:opacity-80"
                                                onClick={() => router.push(`/users/${proposal.workerId}`)}
                                            >
                                                {proposal.workerPhotoURL ? (
                                                    <img src={proposal.workerPhotoURL} alt={proposal.workerName} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-gray-300" />
                                                )}
                                            </div>
                                            <div>
                                                <p 
                                                    className="font-medium cursor-pointer hover:text-primary hover:underline"
                                                    onClick={() => router.push(`/users/${proposal.workerId}`)}
                                                >
                                                    {proposal.workerName}
                                                </p>
                                                <p className="text-xs text-gray-500">{proposal.createdAt.toDate().toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        <div className="mb-3">
                                            <p className="text-sm font-medium">提案金額: {proposal.price.toLocaleString()}円</p>
                                            <p className="text-sm text-gray-500">完了予定: {proposal.estimatedDuration}</p>
                                        </div>
                                        <div className="mb-3 max-h-32 overflow-y-auto">
                                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.message}</p>
                                        </div>
                                        {/* 提案の添付ファイル */}
                                        {proposal.attachments && proposal.attachments.length > 0 && (
                                            <div className="mb-3">
                                                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                    <Paperclip size={12} /> 添付ファイル（各3回までDL可）
                                                </p>
                                                <div className="space-y-1">
                                                    {proposal.attachments.map((att, index) => {
                                                        const getFileName = (attachment: { name: string; url: string }) => {
                                                            if (attachment.name && attachment.name.trim() !== '') {
                                                                return attachment.name;
                                                            }
                                                            try {
                                                                const url = new URL(attachment.url);
                                                                const pathname = decodeURIComponent(url.pathname);
                                                                const parts = pathname.split('/');
                                                                const lastPart = parts[parts.length - 1];
                                                                if (lastPart.includes('_')) {
                                                                    const nameParts = lastPart.split('_');
                                                                    return nameParts.slice(1).join('_') || `ファイル${index + 1}`;
                                                                }
                                                                return lastPart || `ファイル${index + 1}`;
                                                            } catch {
                                                                return `ファイル${index + 1}`;
                                                            }
                                                        };
                                                        return (
                                                            <ProposalAttachmentDownload
                                                                key={index}
                                                                proposalId={proposal.id}
                                                                attachmentIndex={index}
                                                                url={att.url}
                                                                displayName={getFileName(att)}
                                                                userId={user?.uid || ''}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <Button 
                                                size="sm" 
                                                className="flex-1 whitespace-nowrap"
                                                onClick={() => router.push(`/messages/${proposal.id}`)}
                                            >
                                                詳細・交渉
                                            </Button>
                                            {proposal.status === 'hired' && (
                                                <div className="flex-1 flex gap-2">
                                                    <div className="flex-1 text-center text-sm font-bold text-green-600 bg-green-50 py-2 rounded flex items-center justify-center">
                                                        採用済み
                                                    </div>
                                                    {contracts.find(c => c.proposalId === proposal.id) && (
                                                        <Button
                                                            size="sm"
                                                            className="flex-1 whitespace-nowrap"
                                                            onClick={() => {
                                                                const contract = contracts.find(c => c.proposalId === proposal.id);
                                                                if (contract) {
                                                                    router.push(`/client/contracts/${contract.id}`);
                                                                }
                                                            }}
                                                        >
                                                            契約詳細へ
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <Card>
                            <CardContent className="p-8 text-center text-gray-500">
                                まだ応募はありません
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
