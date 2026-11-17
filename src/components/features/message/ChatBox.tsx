"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Send, Paperclip, FileIcon, Download, AlertCircle } from "lucide-react";
import { Timestamp, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, arrayUnion, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadFile } from "@/lib/storage";

interface Attachment {
  name: string;
  url: string;
  size?: number;           // ファイルサイズ（バイト）
  downloadCount?: number;  // ダウンロード回数（後方互換性のため残す）
  maxDownloads?: number;   // 最大ダウンロード回数（デフォルト3）
}

// ユーザー別ダウンロード状態
interface DownloadStatus {
  count: number;
  canDownload: boolean;
  loading?: boolean;
}

interface Message {
  id: string;
  senderId: string;
  text: string;
  attachments?: Attachment[];
  createdAt: Timestamp;
  readBy: string[];
}

interface ChatBoxProps {
  roomId: string;
  currentUserId: string;
  clientId?: string;  // クライアントのユーザーID（累計サイズ計算用）
  workerId?: string;  // ワーカーのユーザーID（累計サイズ計算用）
}

const MAX_UPLOAD_SIZE_PER_USER = 100 * 1024 * 1024; // 100MB
const MAX_DOWNLOADS_PER_FILE = 3;

export function ChatBox({ roomId, currentUserId, clientId, workerId }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [clientTotalSize, setClientTotalSize] = useState(0);
  const [workerTotalSize, setWorkerTotalSize] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<{ [key: string]: DownloadStatus }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newMessage]);

  // ルーム情報から累計アップロードサイズを取得
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, "rooms", roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setClientTotalSize(data.clientTotalUploadSize || 0);
        setWorkerTotalSize(data.workerTotalUploadSize || 0);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const q = query(
      collection(db, "rooms", roomId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [roomId]);

  // Mark as read
  useEffect(() => {
    if (!roomId || !currentUserId || messages.length === 0) return;

    const unreadMessages = messages.filter(
      (msg) => msg.senderId !== currentUserId && !msg.readBy?.includes(currentUserId)
    );

    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async (msg) => {
        try {
          const msgRef = doc(db, "rooms", roomId, "messages", msg.id);
          await updateDoc(msgRef, {
            readBy: arrayUnion(currentUserId),
          });
        } catch (error) {
          console.error("Error marking message as read:", error);
        }
      });
    }
  }, [messages, roomId, currentUserId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 添付ファイルのダウンロード状態を取得
  const fetchDownloadStatus = useCallback(async (messageId: string, attachmentIndex: number) => {
    const key = `${messageId}_${attachmentIndex}`;
    try {
      const response = await fetch(
        `/api/attachments/download?type=message&id=${messageId}&attachmentIndex=${attachmentIndex}&userId=${currentUserId}`
      );
      if (response.ok) {
        const data = await response.json();
        setDownloadStatus(prev => ({
          ...prev,
          [key]: {
            count: data.downloadCount,
            canDownload: data.canDownload,
            loading: false
          }
        }));
      }
    } catch (error) {
      console.error("Error fetching download status:", error);
    }
  }, [currentUserId]);

  // メッセージが読み込まれたら各添付ファイルのダウンロード状態を取得
  useEffect(() => {
    if (!currentUserId || messages.length === 0) return;

    messages.forEach(msg => {
      if (msg.attachments && msg.attachments.length > 0) {
        msg.attachments.forEach((_, idx) => {
          const key = `${msg.id}_${idx}`;
          if (!downloadStatus[key]) {
            fetchDownloadStatus(msg.id, idx);
          }
        });
      }
    });
  }, [messages, currentUserId, fetchDownloadStatus, downloadStatus]);

  // 直接メッセージ（DM）かどうかを判定
  const isDirectMessage = roomId.startsWith('dm_');
  
  // 現在のユーザーがクライアントかワーカーかを判定
  const isClient = currentUserId === clientId;
  const currentUserTotalSize = isClient ? clientTotalSize : workerTotalSize;
  const remainingSize = MAX_UPLOAD_SIZE_PER_USER - currentUserTotalSize;
  
  // ファイル添付が可能かどうか（DMでは不可）
  const canAttachFiles = !isDirectMessage;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      
      // 各ファイルのサイズチェック（1ファイル100MB制限）
      const validFiles: File[] = [];
      let totalNewSize = 0;
      
      for (const file of newFiles) {
        if (file.size > 100 * 1024 * 1024) {
          setUploadError(`ファイル「${file.name}」は100MBを超えているため除外されました。`);
          continue;
        }
        totalNewSize += file.size;
        validFiles.push(file);
      }
      
      // 既存の選択ファイルのサイズも含めて計算
      const existingFilesSize = files.reduce((sum, f) => sum + f.size, 0);
      const totalPendingSize = existingFilesSize + totalNewSize;
      
      // 累計制限チェック
      if (currentUserTotalSize + totalPendingSize > MAX_UPLOAD_SIZE_PER_USER) {
        const remainingMB = (remainingSize / (1024 * 1024)).toFixed(1);
        setUploadError(`累計アップロード制限（100MB）を超えます。残り容量: ${remainingMB}MB`);
        return;
      }
      
      setFiles(prev => [...prev, ...validFiles]);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setUploadError(null);
  };

  const uploadFiles = async (files: File[]): Promise<Attachment[]> => {
    const attachments: Attachment[] = [];
    for (const file of files) {
      const path = `messages/${roomId}/${Date.now()}_${file.name}`;
      const url = await uploadFile(path, file);
      attachments.push({ 
        name: file.name, 
        url,
        size: file.size,
        downloadCount: 0,
        maxDownloads: MAX_DOWNLOADS_PER_FILE
      });
    }
    return attachments;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    
    try {
      let attachments: Attachment[] = [];
      let totalUploadSize = 0;
      
      if (files.length > 0) {
        // 最終的な累計チェック
        totalUploadSize = files.reduce((sum, f) => sum + f.size, 0);
        if (currentUserTotalSize + totalUploadSize > MAX_UPLOAD_SIZE_PER_USER) {
          const remainingMB = (remainingSize / (1024 * 1024)).toFixed(1);
          setUploadError(`累計アップロード制限（100MB）を超えます。残り容量: ${remainingMB}MB`);
          setIsUploading(false);
          return;
        }
        
        attachments = await uploadFiles(files);
      }

      await addDoc(collection(db, "rooms", roomId, "messages"), {
        senderId: currentUserId,
        text: newMessage,
        attachments,
        createdAt: serverTimestamp(),
        readBy: [currentUserId],
        emailSent: false,
      });
      
      // 累計アップロードサイズを更新
      if (totalUploadSize > 0) {
        const roomRef = doc(db, "rooms", roomId);
        const updateField = isClient ? "clientTotalUploadSize" : "workerTotalUploadSize";
        await updateDoc(roomRef, {
          [updateField]: increment(totalUploadSize)
        });
      }
      
      setNewMessage("");
      setFiles([]);
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setUploadError("メッセージの送信に失敗しました。");
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // ダウンロード処理（ユーザー別回数制限付き）
  const handleDownload = async (messageId: string, attachmentIndex: number, attachment: Attachment) => {
    const key = `${messageId}_${attachmentIndex}`;
    const status = downloadStatus[key];
    
    // ステータスがあり、ダウンロード不可の場合
    if (status && !status.canDownload) {
      alert(`このファイルのダウンロード回数（${MAX_DOWNLOADS_PER_FILE}回）に達しました。`);
      return;
    }
    
    try {
      // APIを呼び出してダウンロード回数を記録
      const response = await fetch('/api/attachments/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          id: messageId,
          attachmentIndex,
          userId: currentUserId
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        alert(data.error || 'ダウンロードに失敗しました');
        return;
      }
      
      // ステータスを更新
      setDownloadStatus(prev => ({
        ...prev,
        [key]: {
          count: data.downloadCount,
          canDownload: data.canDownload,
          loading: false
        }
      }));
      
      // ダウンロードを開始
      window.open(attachment.url, '_blank');
    } catch (error) {
      console.error("Error updating download count:", error);
      // エラーが発生してもダウンロードは許可
      window.open(attachment.url, '_blank');
    }
  };

  // 残り容量の表示
  const remainingMB = (remainingSize / (1024 * 1024)).toFixed(1);
  const usedMB = (currentUserTotalSize / (1024 * 1024)).toFixed(1);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMyMessage = msg.senderId === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex ${isMyMessage ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  isMyMessage
                    ? "bg-primary text-white rounded-br-none"
                    : "bg-gray-100 text-gray-800 rounded-bl-none"
                }`}
              >
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {msg.attachments.map((att, idx) => {
                      // ユーザー別ダウンロード状態を取得
                      const key = `${msg.id}_${idx}`;
                      const status = downloadStatus[key];
                      const userDownloadCount = status?.count ?? 0;
                      const maxDownloads = MAX_DOWNLOADS_PER_FILE;
                      const isDownloadable = status ? status.canDownload : true;
                      
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 p-2 rounded-md ${
                            isMyMessage ? "bg-primary-hover" : "bg-white"
                          } ${!isDownloadable ? "opacity-60" : ""}`}
                        >
                          <FileIcon size={20} />
                          <div className="flex-1 min-w-0">
                            <span className="truncate block max-w-[180px] text-sm">
                              {att.name || "添付ファイル"}
                            </span>
                            <span className={`text-xs ${isMyMessage ? "text-primary-100" : "text-gray-500"}`}>
                              {att.size ? `${(att.size / (1024 * 1024)).toFixed(2)}MB` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                              isDownloadable 
                                ? (isMyMessage ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600")
                                : (isMyMessage ? "bg-red-400/30 text-white" : "bg-red-100 text-red-600")
                            }`}>
                              {userDownloadCount}/{maxDownloads}回
                            </span>
                            {isDownloadable ? (
                              <button
                                onClick={() => handleDownload(msg.id, idx, att)}
                                className={`p-1 rounded hover:bg-opacity-20 hover:bg-black ${
                                  isMyMessage ? "text-white" : "text-primary"
                                }`}
                                title="ダウンロード"
                              >
                                <Download size={18} />
                              </button>
                            ) : (
                              <span className={`text-xs ${isMyMessage ? "text-primary-100" : "text-gray-400"}`}>
                                上限
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Backward compatibility for single attachment */}
                {/* @ts-ignore */}
                {msg.attachmentUrl && !msg.attachments && (
                  <div className="mb-2">
                    <a
                      // @ts-ignore
                      href={msg.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 p-2 rounded-md ${
                        isMyMessage ? "bg-primary-hover" : "bg-white"
                      }`}
                    >
                      <FileIcon size={20} />
                      <span className="underline truncate max-w-[200px]">
                        {/* @ts-ignore */}
                        {msg.attachmentName || "添付ファイル"}
                      </span>
                    </a>
                  </div>
                )}
                <div className="max-h-40 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                </div>
                <div className="flex justify-between items-center mt-1 gap-2">
                  <span className={`text-xs ${isMyMessage ? "text-primary-100" : "text-gray-500"}`}>
                    {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  {isMyMessage && (
                    <span className="text-xs text-primary-100">
                      {msg.readBy?.length > 1 ? "既読" : "未読"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200">
        {/* 直接メッセージ（DM）の場合 */}
        {isDirectMessage ? (
          <div className="text-xs text-gray-500 mb-2">
            <p>※ファイルを共有する場合は、外部ファイル共有サービス（Google Drive、Dropbox等）のURLをメッセージで送信してください。</p>
          </div>
        ) : (
          /* 案件メッセージの場合 */
          <div className="text-xs text-gray-500 mb-2 space-y-1">
            <p>※ファイルは最大100MBまでアップロードできます。100MBを超える場合は、外部ファイル共有サービス（Google Drive、Dropbox等）のURLをメッセージで送信してください。</p>
            <p className="text-primary font-medium">
              あなたの使用量: {usedMB}MB / 100MB（残り {remainingMB}MB）
            </p>
          </div>
        )}
        
        {uploadError && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-600 text-xs">
            <AlertCircle size={16} />
            {uploadError}
          </div>
        )}
        
        {canAttachFiles && files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file, index) => (
              <div key={index} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs">
                <span className="truncate max-w-[150px]">{file.name}</span>
                <span className="text-gray-400">({(file.size / (1024 * 1024)).toFixed(2)}MB)</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="text-gray-500 hover:text-danger"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
          {canAttachFiles && (
            <>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || remainingSize <= 0}
                className="mb-0.5"
                title={remainingSize <= 0 ? "アップロード制限に達しました" : "ファイルを添付"}
              >
                <Paperclip size={20} className={remainingSize <= 0 ? "text-gray-300" : "text-gray-500"} />
              </Button>
            </>
          )}
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            className="flex-1 min-h-[40px] max-h-[200px] p-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm leading-relaxed"
            disabled={isUploading}
            rows={1}
            style={{ height: 'auto' }}
          />
          <Button type="submit" size="icon" disabled={isUploading || (!newMessage.trim() && files.length === 0)} className="mb-0.5">
            <Send size={20} />
          </Button>
        </form>
      </div>
    </div>
  );
}
