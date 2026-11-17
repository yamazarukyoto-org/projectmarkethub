"use client";

import { useState, useRef } from "react";
import { Camera, Upload, RotateCcw, User, X, Check } from "lucide-react";
import { uploadFile, deleteFile } from "@/lib/storage";
import { updateUser } from "@/lib/db";
import { User as UserType } from "@/types";

interface ProfileImageEditorProps {
    user: UserType;
    onUpdate: () => void;
}

export default function ProfileImageEditor({ user, onUpdate }: ProfileImageEditorProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);

        // ファイルタイプチェック
        if (!ALLOWED_TYPES.includes(file.type)) {
            setError("JPEG、PNG、GIF、WebP形式の画像のみアップロードできます");
            return;
        }

        // ファイルサイズチェック
        if (file.size > MAX_FILE_SIZE) {
            setError("ファイルサイズは5MB以下にしてください");
            return;
        }

        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            setPreviewUrl(e.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        setError(null);

        try {
            // ファイル拡張子を取得
            const ext = selectedFile.name.split(".").pop() || "jpg";
            const path = `profile-images/${user.uid}/avatar.${ext}`;

            // Firebase Storageにアップロード
            const downloadURL = await uploadFile(path, selectedFile);

            // Firestoreのユーザー情報を更新
            await updateUser(user.uid, {
                photoURL: downloadURL,
                updatedAt: new Date() as any,
            });

            setIsModalOpen(false);
            setPreviewUrl(null);
            setSelectedFile(null);
            onUpdate();
        } catch (err) {
            console.error("Upload error:", err);
            setError("アップロードに失敗しました。もう一度お試しください。");
        } finally {
            setUploading(false);
        }
    };

    const handleResetToGoogle = async () => {
        if (!user.googlePhotoURL) return;

        setUploading(true);
        setError(null);

        try {
            await updateUser(user.uid, {
                photoURL: user.googlePhotoURL,
                updatedAt: new Date() as any,
            });

            setIsModalOpen(false);
            onUpdate();
        } catch (err) {
            console.error("Reset error:", err);
            setError("リセットに失敗しました。もう一度お試しください。");
        } finally {
            setUploading(false);
        }
    };

    const handleResetToDefault = async () => {
        setUploading(true);
        setError(null);

        try {
            await updateUser(user.uid, {
                photoURL: "",
                updatedAt: new Date() as any,
            });

            setIsModalOpen(false);
            onUpdate();
        } catch (err) {
            console.error("Reset error:", err);
            setError("リセットに失敗しました。もう一度お試しください。");
        } finally {
            setUploading(false);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setPreviewUrl(null);
        setSelectedFile(null);
        setError(null);
    };

    const currentPhotoURL = previewUrl || user.photoURL;

    return (
        <>
            {/* プロフィール画像表示 */}
            <div className="flex flex-col items-center mb-6">
                <div
                    className="relative cursor-pointer group"
                    onClick={() => setIsModalOpen(true)}
                >
                    {currentPhotoURL ? (
                        <img
                            src={currentPhotoURL}
                            alt="プロフィール画像"
                            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                        />
                    ) : (
                        <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center border-4 border-white shadow-lg">
                            <User size={40} className="text-gray-400" />
                        </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black bg-opacity-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera size={24} className="text-white" />
                    </div>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="mt-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                    画像を変更
                </button>
            </div>

            {/* モーダル */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black bg-opacity-50"
                        onClick={closeModal}
                    />
                    <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                        <button
                            onClick={closeModal}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <X size={24} />
                        </button>

                        <h2 className="text-xl font-bold text-gray-900 mb-6">
                            プロフィール画像の変更
                        </h2>

                        {/* 現在の画像プレビュー */}
                        <div className="flex justify-center mb-6">
                            {previewUrl ? (
                                <img
                                    src={previewUrl}
                                    alt="プレビュー"
                                    className="w-32 h-32 rounded-full object-cover border-4 border-gray-100"
                                />
                            ) : user.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt="現在の画像"
                                    className="w-32 h-32 rounded-full object-cover border-4 border-gray-100"
                                />
                            ) : (
                                <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center border-4 border-gray-100">
                                    <User size={48} className="text-gray-400" />
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        {/* アクションボタン */}
                        <div className="space-y-3">
                            {/* 画像アップロード */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                <Upload size={20} />
                                新しい画像をアップロード
                            </button>

                            {/* 選択した画像を保存 */}
                            {selectedFile && (
                                <button
                                    onClick={handleUpload}
                                    disabled={uploading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                >
                                    <Check size={20} />
                                    {uploading ? "アップロード中..." : "この画像を保存"}
                                </button>
                            )}

                            {/* Googleアカウントの画像に戻す */}
                            {user.googlePhotoURL && user.photoURL !== user.googlePhotoURL && (
                                <button
                                    onClick={handleResetToGoogle}
                                    disabled={uploading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    <RotateCcw size={20} />
                                    Googleアカウントの画像に戻す
                                </button>
                            )}

                            {/* デフォルトアイコンに戻す */}
                            {user.photoURL && (
                                <button
                                    onClick={handleResetToDefault}
                                    disabled={uploading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                                >
                                    <User size={20} />
                                    デフォルトアイコンに戻す
                                </button>
                            )}
                        </div>

                        <p className="mt-4 text-xs text-gray-500 text-center">
                            対応形式: JPEG, PNG, GIF, WebP（最大5MB）
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
