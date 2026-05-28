'use client';

import { useState, useTransition, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MuralPost, createMuralPost, deleteMuralPost, toggleMuralPin, getMuralPosts } from '@/actions/mural';
import { createClient } from '@/lib/supabase';

const CATEGORIES = [
    { value: 'geral', label: 'Geral', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20' },
    { value: 'urgente', label: 'Urgente', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
    { value: 'pedagogico', label: 'Pedagógico', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
    { value: 'administrativo', label: 'Administrativo', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
    { value: 'comunicacao', label: 'Comunicação', color: 'bg-pink-500/15 text-pink-400 border-pink-500/20' },
];

function getCategoryStyle(cat: string) {
    return CATEGORIES.find(c => c.value === cat)?.color ?? CATEGORIES[0].color;
}
function getCategoryLabel(cat: string) {
    return CATEGORIES.find(c => c.value === cat)?.label ?? cat;
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}min atrás`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h atrás`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d atrás`;
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

interface Props {
    initialPosts: MuralPost[];
    canPost: boolean;
    currentUserId: string;
    isLeadership: boolean;
}

export default function MuralClient({ initialPosts, canPost, currentUserId, isLeadership }: Props) {
    const [posts, setPosts] = useState(initialPosts);
    const [showForm, setShowForm] = useState(false);
    const [filterCat, setFilterCat] = useState('todos');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    // Form state
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState('geral');
    const [pinned, setPinned] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel('mural-posts-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'mural_posts',
            }, async () => {
                const fresh = await getMuralPosts();
                setPosts(fresh);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const filtered = filterCat === 'todos'
        ? posts
        : posts.filter(p => p.category === filterCat);

    const handleCreate = async () => {
        if (!title.trim()) return;
        setSubmitting(true);
        try {
            await createMuralPost(title.trim(), content.trim(), category, pinned);
            // A subscription realtime atualiza a lista; limpa o formulário
            const fresh = await getMuralPosts();
            setPosts(fresh);
            setTitle('');
            setContent('');
            setCategory('geral');
            setPinned(false);
            setShowForm(false);
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = (id: string) => {
        startTransition(async () => {
            await deleteMuralPost(id);
            setPosts(p => p.filter(x => x.id !== id));
        });
    };

    const handlePin = (id: string, currentPinned: boolean) => {
        startTransition(async () => {
            await toggleMuralPin(id, currentPinned);
            setPosts(p => p.map(x => x.id === id ? { ...x, pinned: !currentPinned } : x)
                .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
        });
    };

    return (
        <div className="max-w-3xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Mural</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Comunicados e avisos da organização</p>
                </div>
                {canPost && (
                    <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                        onClick={() => setShowForm(v => !v)}
                        className="flex items-center gap-2 bg-primary text-zinc-900 px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
                    >
                        <span className="material-symbols-outlined text-base">{showForm ? 'close' : 'add'}</span>
                        {showForm ? 'Cancelar' : 'Novo aviso'}
                    </motion.button>
                )}
            </div>

            {/* Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl p-5 mb-6 shadow-lg"
                    >
                        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-4">Novo comunicado</h3>
                        <div className="flex flex-col gap-3">
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Título do comunicado *"
                                className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-white/10 text-sm outline-none focus:border-primary dark:focus:border-primary transition-colors"
                            />
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="Descrição (opcional)"
                                rows={4}
                                className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-white/10 text-sm outline-none focus:border-primary dark:focus:border-primary transition-colors resize-none"
                            />
                            <div className="flex items-center gap-3 flex-wrap">
                                <select
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                    className="flex-1 min-w-[160px] px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-white/10 text-sm outline-none focus:border-primary dark:focus:border-primary"
                                >
                                    {CATEGORIES.map(c => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                    ))}
                                </select>
                                {isLeadership && (
                                    <button
                                        type="button"
                                        onClick={() => setPinned(v => !v)}
                                        className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${pinned ? 'bg-primary/10 border-primary/30 text-primary dark:text-primary' : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-white/10 text-zinc-500'}`}
                                    >
                                        <span className="material-symbols-outlined text-base">push_pin</span>
                                        {pinned ? 'Fixado' : 'Fixar'}
                                    </button>
                                )}
                                <motion.button
                                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                    onClick={handleCreate}
                                    disabled={!title.trim() || submitting}
                                    className="ml-auto flex items-center gap-2 bg-primary text-zinc-900 px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? (
                                        <div className="w-4 h-4 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <span className="material-symbols-outlined text-base">send</span>
                                    )}
                                    Publicar
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Category filter */}
            <div className="flex gap-2 overflow-x-auto pb-1 mb-5 no-scrollbar">
                <button
                    onClick={() => setFilterCat('todos')}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterCat === 'todos' ? 'bg-primary/10 border-primary/30 text-primary dark:text-primary' : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-500'}`}
                >
                    Todos
                </button>
                {CATEGORIES.map(c => (
                    <button
                        key={c.value}
                        onClick={() => setFilterCat(c.value)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterCat === c.value ? 'bg-primary/10 border-primary/30 text-primary dark:text-primary' : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-white/10 text-zinc-500'}`}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            {/* Posts */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <span className="material-symbols-outlined text-5xl text-zinc-300 dark:text-zinc-700 mb-3">campaign</span>
                    <p className="text-zinc-500 dark:text-zinc-400 font-medium">Nenhum comunicado ainda.</p>
                    {canPost && <p className="text-xs text-zinc-400 mt-1">Clique em "Novo aviso" para criar o primeiro.</p>}
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <AnimatePresence initial={false}>
                        {filtered.map(post => {
                            const canEdit = post.author_id === currentUserId || isLeadership;
                            const isExpanded = expandedId === post.id;
                            const hasLongContent = post.content && post.content.length > 200;

                            return (
                                <motion.div
                                    key={post.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    layout
                                    className={`bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${post.pinned ? 'border-primary/30 dark:border-primary/25' : 'border-zinc-200 dark:border-white/8'}`}
                                >
                                    {post.pinned && (
                                        <div className="h-0.5 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
                                    )}
                                    <div className="p-4">
                                        {/* Top row */}
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                                                {post.pinned && (
                                                    <span className="material-symbols-outlined text-sm text-primary shrink-0">push_pin</span>
                                                )}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getCategoryStyle(post.category)}`}>
                                                    {getCategoryLabel(post.category)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isLeadership && (
                                                    <button
                                                        onClick={() => handlePin(post.id, post.pinned)}
                                                        disabled={isPending}
                                                        title={post.pinned ? 'Desafixar' : 'Fixar'}
                                                        className={`p-1.5 rounded-lg transition-colors ${post.pinned ? 'text-primary' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                                                    >
                                                        <span className="material-symbols-outlined text-base">push_pin</span>
                                                    </button>
                                                )}
                                                {canEdit && (
                                                    <button
                                                        onClick={() => handleDelete(post.id)}
                                                        disabled={isPending}
                                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Title */}
                                        <h3 className="font-bold text-zinc-900 dark:text-white text-base leading-snug mb-1">{post.title}</h3>

                                        {/* Content */}
                                        {post.content && (
                                            <div>
                                                <p className={`text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap ${!isExpanded && hasLongContent ? 'line-clamp-3' : ''}`}>
                                                    {post.content}
                                                </p>
                                                {hasLongContent && (
                                                    <button
                                                        onClick={() => setExpandedId(isExpanded ? null : post.id)}
                                                        className="text-xs font-semibold text-primary mt-1 hover:underline"
                                                    >
                                                        {isExpanded ? 'Ver menos' : 'Ver mais'}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Footer */}
                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-white/5">
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/40 to-primary/20 flex items-center justify-center text-xs font-bold text-zinc-700 dark:text-zinc-300 shrink-0">
                                                {post.author?.full_name?.charAt(0) ?? '?'}
                                            </div>
                                            <span className="text-xs text-zinc-500 dark:text-zinc-500 font-medium truncate">
                                                {post.author?.full_name ?? 'VAV'}
                                            </span>
                                            <span className="text-zinc-300 dark:text-zinc-700 text-xs">·</span>
                                            <span className="text-xs text-zinc-400 dark:text-zinc-600 ml-auto shrink-0">{timeAgo(post.created_at)}</span>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
