'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, User, AlignLeft, AlertCircle, Send, Trash2 } from 'lucide-react';
import type { Demand, DemandComment } from '@/types/demands';
import { createDemandComment, deleteDemandComment } from '@/actions/demandComments';
import { createClient } from '@/lib/supabase';

interface DemandDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    demand: Demand | null;
    currentUserId?: string;
    isLeadership?: boolean;
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return d < 7 ? `${d}d` : new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function DemandDetailsModal({ isOpen, onClose, demand, currentUserId, isLeadership }: DemandDetailsModalProps) {
    const [comments, setComments] = useState<DemandComment[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [isPending, startTransition] = useTransition();
    const commentsEndRef = useRef<HTMLDivElement>(null);
    const supabase = createClient();

    useEffect(() => {
        if (!isOpen || !demand?.id) { setComments([]); return; }

        setLoadingComments(true);
        supabase
            .from('demand_comments')
            .select('*, author:profiles!author_id(full_name, avatar_url)')
            .eq('demand_id', demand.id)
            .order('created_at', { ascending: true })
            .then((res: { data: DemandComment[] | null }) => {
                setComments(res.data || []);
                setLoadingComments(false);
            });

        // Realtime subscription
        const channel = supabase
            .channel(`demand-comments-${demand.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'demand_comments',
                filter: `demand_id=eq.${demand.id}`,
            }, () => {
                supabase
                    .from('demand_comments')
                    .select('*, author:profiles!author_id(full_name, avatar_url)')
                    .eq('demand_id', demand.id)
                    .order('created_at', { ascending: true })
                    .then((res: { data: DemandComment[] | null }) => setComments(res.data || []));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [isOpen, demand?.id]);

    useEffect(() => {
        if (comments.length > 0) {
            commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [comments.length]);

    const handleSend = () => {
        if (!newComment.trim() || !demand?.id) return;
        const text = newComment.trim();
        setNewComment('');
        startTransition(async () => {
            await createDemandComment(demand.id, text);
        });
    };

    const handleDelete = (commentId: string) => {
        startTransition(async () => {
            await deleteDemandComment(commentId);
            setComments(c => c.filter(x => x.id !== commentId));
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    if (!demand) return null;

    const modal = (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 8 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        onClick={e => e.stopPropagation()}
                        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between p-5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                            <div className="flex-1 min-w-0 pr-3">
                                <h3 className="font-bold text-lg text-zinc-900 dark:text-white leading-tight">{demand.title}</h3>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {demand.assignee?.full_name && (
                                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                                            <User size={11} /> {demand.assignee.full_name}
                                        </span>
                                    )}
                                    {demand.due_date && (
                                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                                            <Calendar size={11} /> {new Date(demand.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors shrink-0">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {/* Rejection note */}
                            {demand.is_rejected && demand.coordination_note && (
                                <div className="mx-5 mt-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 flex gap-3">
                                    <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-red-800 dark:text-red-400 font-bold text-xs mb-1">Motivo da Rejeição</p>
                                        <p className="text-red-700 dark:text-red-300 text-sm whitespace-pre-wrap">{demand.coordination_note}</p>
                                    </div>
                                </div>
                            )}

                            {/* Description */}
                            {demand.description && (
                                <div className="mx-5 mt-4">
                                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <AlignLeft size={12} /> Descrição
                                    </p>
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                                        {demand.description}
                                    </p>
                                </div>
                            )}

                            {/* Comments */}
                            <div className="mx-5 mt-4 mb-2">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                                    Comentários {comments.length > 0 && `(${comments.length})`}
                                </p>

                                {loadingComments ? (
                                    <div className="flex justify-center py-6">
                                        <div className="w-5 h-5 border-2 border-zinc-200 border-t-primary rounded-full animate-spin" />
                                    </div>
                                ) : comments.length === 0 ? (
                                    <div className="text-center py-6 text-zinc-400 dark:text-zinc-600 text-sm">
                                        Nenhum comentário ainda. Seja o primeiro!
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {comments.map(c => {
                                            const isOwn = c.author_id === currentUserId;
                                            const canDelete = isOwn || isLeadership;
                                            return (
                                                <div key={c.id} className="flex gap-2.5 group">
                                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300 shrink-0 mt-0.5">
                                                        {c.author?.full_name?.charAt(0) ?? '?'}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{c.author?.full_name ?? 'Usuário'}</span>
                                                            <span className="text-[10px] text-zinc-400">{timeAgo(c.created_at)}</span>
                                                            {canDelete && (
                                                                <button
                                                                    onClick={() => handleDelete(c.id)}
                                                                    className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 text-zinc-300 hover:text-red-400 transition-all"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">{c.comment}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div ref={commentsEndRef} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Comment input */}
                        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
                            <div className="flex gap-2 items-end">
                                <textarea
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Escreva um comentário... (Enter para enviar)"
                                    rows={2}
                                    className="flex-1 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-white/10 rounded-xl text-sm outline-none focus:border-primary dark:focus:border-primary resize-none transition-colors"
                                />
                                <motion.button
                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                    onClick={handleSend}
                                    disabled={!newComment.trim() || isPending}
                                    className="w-9 h-9 flex items-center justify-center bg-primary text-zinc-900 rounded-xl shadow-md shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                >
                                    <Send size={15} />
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}
