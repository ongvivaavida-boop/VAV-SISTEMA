'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface MuralPost {
    id: string;
    created_at: string;
    title: string;
    content: string | null;
    category: string;
    pinned: boolean;
    author_id: string | null;
    author?: {
        full_name: string;
        avatar_url: string | null;
        role: string;
    };
}

export async function getMuralPosts(): Promise<MuralPost[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('mural_posts')
        .select('*, author:profiles!author_id(full_name, avatar_url, role)')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as MuralPost[];
}

const LEADERSHIP_ROLES = ['Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia'];

async function assertLeadership(supabase: any, userId: string) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (!profile || !LEADERSHIP_ROLES.includes(profile.role)) {
        throw new Error('Sem permissão para gerenciar o mural.');
    }
}

export async function createMuralPost(title: string, content: string, category: string, pinned: boolean) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado.');
    await assertLeadership(supabase, user.id);

    const { error } = await supabase
        .from('mural_posts')
        .insert({ title, content: content || null, category, pinned, author_id: user.id });

    if (error) throw error;
    revalidatePath('/dashboard/mural');
}

export async function deleteMuralPost(id: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado.');
    await assertLeadership(supabase, user.id);

    const { error } = await supabase
        .from('mural_posts')
        .delete()
        .eq('id', id);

    if (error) throw error;
    revalidatePath('/dashboard/mural');
}

export async function toggleMuralPin(id: string, pinned: boolean) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuário não autenticado.');
    await assertLeadership(supabase, user.id);

    const { error } = await supabase
        .from('mural_posts')
        .update({ pinned: !pinned })
        .eq('id', id);

    if (error) throw error;
    revalidatePath('/dashboard/mural');
}
